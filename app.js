// Global State
let products = [];
let cart = [];
let allSales = []; 
let pendingAction = null; 
let confirmCallback = null;
let currentVatRate = 12; 
let currentDiscountType = null;
let selectedPaymentMethod = 'cash';
let activeDiscounts = [];
let appliedDiscountObj = null;
let parkedOrders = JSON.parse(localStorage.getItem('parked_orders')) || [];
let currentItemType = 'product';
let allCategories = [];
let currentSalesTab = 'completed';
let editingOrderId = null;
let editingOrderData = null;

// Global Settings Object (Initialize with defaults)
let posSettings = {
    vat_rate: 12,
    store_name: 'SimplePOS',
    store_address: 'Philippines'
};

// Service Types
const serviceTypes = [
    {id: 1, name: 'Walk-in'},
    {id: 2, name: 'Take-out'},
    {id: 3, name: 'Delivery'}
];

// --- 1. INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    const isAuthenticated = await checkAuth(); 
    if (!isAuthenticated) { 
        window.location.href = 'login.html'; 
        return; 
    }
    
    await fetchSettings();
    
    showView('pos'); 

    // Init Service Type Dropdown
    const svcSelect = document.getElementById('service-type-select');
    if(svcSelect) {
        svcSelect.innerHTML = serviceTypes.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // Load Data
    try { await loadCategories(); } catch (e) { console.error("Cat Error", e); }
    try { await loadProducts(); } catch (e) { console.error("Prod Error", e); }
    try { await loadDiscounts(); } catch (e) { console.error("Disc Error", e); } // NEW
    
    // Restore Cart from LocalStorage
    restoreCartState();

    // Event Listeners
    const clearBtn = document.getElementById('clear-cart');
    if (clearBtn) clearBtn.addEventListener('click', clearCart);

    const addForm = document.getElementById('add-product-form');
    if(addForm) addForm.addEventListener('submit', handleSaveProduct);
    
    // Sidebar Toggle Logic
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
    }
    
    // Search Listeners
    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = products.filter(p => 
                p.category_type === currentItemType && 
                (p.name.toLowerCase().includes(term) || 
                (p.product_code && p.product_code.toLowerCase().includes(term)))
            );
            renderProducts(filtered);
        });
    }

    const salesSearchInput = document.getElementById('sales-search-input');
    if(salesSearchInput) {
        salesSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allSales.filter(sale => 
                (sale.transaction_number && sale.transaction_number.toLowerCase().includes(term)) ||
                (sale.reference_number && sale.reference_number.toLowerCase().includes(term)) ||
                (sale.customer_name && sale.customer_name.toLowerCase().includes(term))
            );
            renderSalesTable(filtered);
        });
    }
    
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    if(confirmYesBtn) {
        confirmYesBtn.addEventListener('click', () => {
            if (confirmCallback) confirmCallback();
            closeModal('confirm-modal');
        });
    }

    const passInput = document.getElementById('security-password');
    if(passInput) {
        passInput.addEventListener('keypress', function (e) { 
            if (e.key === 'Enter') verifyAndExecute(); 
        });
    }

    // --- NEW: CHECKOUT KEYBOARD SHORTCUTS ---
    const amountTenderedInput = document.getElementById('amount-tendered');
        if(amountTenderedInput) {
        amountTenderedInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Stop any default form submission
                executePayment();   // Trigger checkout!
            } else if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault(); // Stop natural tab order
                
                // Find the actual complete payment button inside the modal
                const confirmBtn = document.querySelector('#payment-modal button[onclick*="confirmPayment"], #payment-modal button[onclick*="executePayment"]');
                if (confirmBtn) confirmBtn.focus(); // Jump straight to the right button
            }
        });
    }

    // Just in case they are using a Reference Number (like GCash) and press Enter
    const refInput = document.getElementById('ref-number');
    if(refInput) {
        refInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                executePayment();
            }
        });
    } // <-- End of initApp()
}

// --- NEW: PERSISTENCE HELPERS ---
function saveCartState() {
    localStorage.setItem('persistent_cart', JSON.stringify(cart));
}

function restoreCartState() {
    const savedCart = localStorage.getItem('persistent_cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            updateCartUI();
        } catch (e) {
            console.error("Failed to restore cart", e);
            cart = [];
        }
    }
}

function clearCartState() {
    localStorage.removeItem('persistent_cart');
}

// --- FETCH SETTINGS ---
async function fetchSettings() {
    try {
        const res = await fetch('api/get_settings.php?t=' + new Date().getTime());
        const text = await res.text(); 
        const cleanText = text.trim();
        
        try {
            const data = JSON.parse(cleanText);
            if (data) {
                posSettings = {
                    vat_rate: parseFloat(data.vat_rate || 12),
                    store_name: data.store_name || 'SimplePOS',
                    store_address: data.store_address || 'Philippines'
                };
                currentVatRate = posSettings.vat_rate;
                
                const brandEl = document.getElementById('store-brand');
                if(brandEl) brandEl.innerText = posSettings.store_name;
                
                const nameInput = document.getElementById('setting-store-name');
                if(nameInput) {
                    nameInput.value = posSettings.store_name;
                    document.getElementById('setting-store-address').value = posSettings.store_address;
                    document.getElementById('setting-vat-rate').value = posSettings.vat_rate;
                }
            }
        } catch (jsonErr) {
            console.error("JSON Error. Server sent:", text);
        }
    } catch (e) { 
        console.error("Network Error", e); 
    }
}

// --- 2. VIEW NAVIGATION ---
window.showView = function(viewName, btnElement) {
    const currentView = document.querySelector('.view-section.active');
    if (currentView && currentView.id === `${viewName}-view`) return;
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const targetView = document.getElementById(`${viewName}-view`);
    if(targetView) targetView.classList.add('active');
    
    if(btnElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }
    
    if (viewName === 'sales') loadSalesHistory();
    if (viewName === 'settings') loadSettingsPageUI();
}

// --- 3. AUTHENTICATION & SECURITY ---
async function checkAuth() {
    try {
        const response = await fetch('api/check_auth.php');
        if (response.status === 200) {
            const data = await response.json();
            sessionStorage.setItem('user', JSON.stringify(data.user));
            updateUserDisplay(data.user);
            return true;
        }
        return false;
    } catch (error) { return false; }
}

function updateUserDisplay(user) {
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-role-display');
    if(nameEl && user) nameEl.innerText = user.first_name + ' ' + user.last_name;
    
    let displayRole = user.role;
    if (displayRole === 'store_admin') displayRole = 'admin';
    if(roleEl && user) roleEl.innerText = displayRole.toUpperCase();

    // --- NEW: Populate Mobile Profile Avatar & Modal ---
    if(user) {
        const initial = user.first_name.charAt(0).toUpperCase();
        document.querySelectorAll('.user-initial').forEach(el => el.innerText = initial);
        
        if(document.getElementById('modal-user-initial')) document.getElementById('modal-user-initial').innerText = initial;
        if(document.getElementById('modal-user-name')) document.getElementById('modal-user-name').innerText = user.first_name + ' ' + user.last_name;
        if(document.getElementById('modal-user-role')) document.getElementById('modal-user-role').innerText = displayRole.toUpperCase();
    }

    if (user && user.role === 'cashier') {
        document.body.classList.add('role-cashier'); 
        const addBtn = document.querySelector('#pos-view .top-header .btn-primary');
        if (addBtn) addBtn.style.display = 'none';
        
        const settingsNav = document.querySelector('button[onclick="showView(\'settings\', this)"]');
        if (settingsNav) settingsNav.parentElement.style.display = 'none';
    }
}

window.logout = function() { window.location.href = 'api/logout.php'; }

function requirePassword(callback) {
    pendingAction = callback;
    document.getElementById('security-password').value = '';
    openModal('security-modal');
    setTimeout(() => document.getElementById('security-password').focus(), 100);
}

async function verifyAndExecute() {
    const password = document.getElementById('security-password').value;
    if (!password) return;
    try {
        const res = await fetch('api/verify_password.php', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ password: password }) 
        });
        const data = await res.json();
        if (data.success) {
            closeModal('security-modal');
            if (pendingAction) { pendingAction(); pendingAction = null; }
        } else {
            showNotification('Incorrect Password', 'error');
            document.getElementById('security-password').value = '';
        }
    } catch (err) { showNotification('Verification Error', 'error'); }
}

// --- 4. UI COMPONENTS ---
window.showNotification = function(message, type = 'success') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    notif.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(notif);
    
    setTimeout(() => {
        notif.classList.add('hiding');
        notif.addEventListener('animationend', () => {
            if (notif.parentNode) notif.parentNode.removeChild(notif);
        });
    }, 3000);
}

window.showConfirm = function(message, callback) {
    document.getElementById('confirm-message').innerText = message;
    confirmCallback = callback;
    openModal('confirm-modal');
}
window.closeModal = function(id) { document.getElementById(id).classList.remove('active'); }
window.openModal = function(id) { document.getElementById(id).classList.add('active'); }
window.onclick = function(event) { if (event.target.classList.contains('modal')) { event.target.classList.remove('active'); } }

// --- 5. PRODUCT MANAGEMENT ---
window.openAddModal = function() {
    document.getElementById('add-product-form').reset();
    resetImagePreview();
    document.getElementById('edit-product-id').value = '';
    document.getElementById('modal-title').innerText = "Add Item";
    const codeInput = document.getElementById('new-code');
    if(codeInput) codeInput.value = '';
    
    document.getElementById('new-item-type').value = currentItemType; // Default to currently viewed type
    
    document.getElementById('variant-list').innerHTML = '';
    document.getElementById('has-variants-toggle').checked = false;
    toggleVariantInputs();
    addVariantRow();
    
    updateCategorySuggestions();
    openModal('add-modal');
}

window.promptEdit = function(id) { requirePassword(() => openEditModal(id)); }

function openEditModal(id) {
    const p = products.find(i => i.product_id == id);
    if (!p) return;
    document.getElementById('add-product-form').reset();
    resetImagePreview();
    if(p.image) {
        const preview = document.getElementById('image-preview');
        preview.src = p.image;
        preview.style.display = 'block';
        document.getElementById('upload-placeholder').style.display = 'none';
    }
    document.getElementById('variant-list').innerHTML = '';
    document.getElementById('modal-title').innerText = "Edit Item";
    document.getElementById('edit-product-id').value = p.product_id;
    document.getElementById('new-name').value = p.name;
    document.getElementById('new-category').value = p.category_name;
    document.getElementById('new-item-type').value = p.category_type || 'product'; // NEW
    
    const codeInput = document.getElementById('new-code');
    if(codeInput) codeInput.value = p.product_code || '';
    
    const hasVar = p.has_variants == 1;
    document.getElementById('has-variants-toggle').checked = hasVar;
    toggleVariantInputs();
    if (hasVar) { p.variants.forEach(v => addVariantRow(v.variant_name, v.price)); } 
    else { document.getElementById('new-price').value = p.price; }
    
    updateCategorySuggestions();
    openModal('add-modal');
}



async function handleSaveProduct(e) {
    e.preventDefault();
    const formData = new FormData();
    const editId = document.getElementById('edit-product-id').value;
    const url = editId ? 'api/edit_product.php' : 'api/add_product.php';
    if(editId) formData.append('product_id', editId);
    
    formData.append('name', document.getElementById('new-name').value);
    formData.append('category_name', document.getElementById('new-category').value);
    formData.append('type', document.getElementById('new-item-type').value);
    const codeInput = document.getElementById('new-code');
    if(codeInput) formData.append('product_code', codeInput.value);
    
    const imageFile = document.getElementById('new-image').files[0];
    if (imageFile) formData.append('image', imageFile);
    
    const isVariant = document.getElementById('has-variants-toggle').checked;
    if (isVariant) {
        const rows = document.querySelectorAll('.variant-row');
        let variants = [];
        rows.forEach(row => {
            const vName = row.querySelector('.v-name').value;
            const vPrice = row.querySelector('.v-price').value;
            if(vName && vPrice) { variants.push({ name: vName, price: vPrice }); }
        });
        if(variants.length === 0) { showNotification("Add at least one variant.", "error"); return; }
        formData.append('variants', JSON.stringify(variants));
    } else {
        formData.append('price', document.getElementById('new-price').value);
    }
    
    try {
        const res = await fetch(url, { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
            showNotification(editId ? 'Item Updated!' : 'Item Added!', 'success');
            closeModal('add-modal');
            await loadCategories();
            await loadProducts();
        } else { showNotification(data.message || 'Error saving product', 'error'); }
    } catch (err) { showNotification('System Error', 'error'); }
}

window.toggleVariantInputs = function() {
    const isChecked = document.getElementById('has-variants-toggle').checked;
    document.getElementById('simple-inputs').style.display = isChecked ? 'none' : 'flex';
    document.getElementById('variant-inputs').style.display = isChecked ? 'block' : 'none';
}

window.addVariantRow = function(name='', price='') {
    const container = document.getElementById('variant-list');
    const div = document.createElement('div');
    div.className = 'variant-row';
    div.innerHTML = `
        <input type="text" class="v-name" value="${name}" placeholder="Name">
        <input type="number" class="v-price" value="${price}" placeholder="Price" step="0.01">
        <button type="button" class="btn-remove-variant" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
}

window.previewImage = function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const preview = document.getElementById('image-preview');
            preview.src = evt.target.result;
            preview.style.display = 'block';
            document.getElementById('upload-placeholder').style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
}

function resetImagePreview() {
    const preview = document.getElementById('image-preview');
    const placeholder = document.getElementById('upload-placeholder');
    const input = document.getElementById('new-image');
    preview.src = ''; preview.style.display = 'none'; placeholder.style.display = 'flex'; input.value = '';
}

window.switchItemType = function(type) {
    currentItemType = type;
    document.getElementById('btn-type-product').classList.toggle('active', type === 'product');
    document.getElementById('btn-type-service').classList.toggle('active', type === 'service');
    renderCategoriesUI();
    filterByCategory('all');
    
    // Clear search bar when switching types
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.value = '';
}

async function loadCategories() { 
    try {
        const response = await fetch('api/get_categories.php');
        allCategories = await response.json();
        renderCategoriesUI();
    } catch (error) { console.error(error); }
}

function renderCategoriesUI() {
    const container = document.getElementById('category-list');
    if (!container) return;
    container.innerHTML = ''; 
    
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All ' + (currentItemType === 'product' ? 'Products' : 'Services');
    allBtn.className = 'active'; 
    allBtn.onclick = () => filterByCategory('all', allBtn);
    container.appendChild(allBtn);
    
    const filteredCats = allCategories.filter(c => c.type === currentItemType);
    filteredCats.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.name;
        btn.onclick = () => filterByCategory(cat.category_id, btn);
        container.appendChild(btn);
    });
}

async function loadProducts() {
    try {
        const response = await fetch('api/get_products.php'); 
        if (response.ok) {
            products = await response.json();
            filterByCategory('all'); // Automatically respects currentItemType
        }
    } catch (error) { console.error(error); }
}

function filterByCategory(categoryId, clickedBtn) {
    if (clickedBtn) {
        document.querySelectorAll('.categories button').forEach(btn => btn.classList.remove('active'));
        clickedBtn.classList.add('active');
    }
    
    // 1. Filter by Product/Service Type First
    let filteredByType = products.filter(p => p.category_type === currentItemType);
    
    // 2. Then filter by category
    let filtered = (categoryId === 'all') ? filteredByType : filteredByType.filter(p => p.category_id == categoryId);
    
    renderProducts(filtered); 
}

window.updateCategorySuggestions = function() {
    const type = document.getElementById('new-item-type').value;
    const datalist = document.getElementById('cat-suggestions');
    if(datalist) {
        datalist.innerHTML = '';
        const cats = allCategories.filter(c => c.type === type).map(c => c.name);
        [...new Set(cats)].forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            datalist.appendChild(opt);
        });
    }
}

function renderProducts(productList) {
    const grid = document.getElementById('product-grid');
    if(!grid) return;
    
    if (!productList || productList.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666;">No items found.</p>';
        return;
    }

    const loading = grid.querySelector('.loading');
    if(loading) loading.remove();

    grid.innerHTML = '';

    productList.forEach((product, index) => {
        const hasVariants = product.has_variants == 1;
        let metaHtml = '<div class="meta-spacer">&nbsp;</div>'; 
        let priceText = `PHP ${parseFloat(product.price).toFixed(2)}`;
        
        if (hasVariants && product.variants && product.variants.length > 0) {
             const prices = product.variants.map(v => parseFloat(v.price));
             metaHtml = `<div class="variant-badge">${product.variants.length} Options</div>`;
             priceText = `PHP ${Math.min(...prices).toFixed(2)}`; 
        }

        const imageHtml = product.image 
            ? `<div class="product-img-wrapper"><img src="${product.image}" class="product-img"></div>`
            : `<div class="product-img-wrapper"><i class="fas fa-box fa-3x" style="color:#cbd5e1;"></i></div>`;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.id = product.product_id;
        card.style.animationDelay = `${index * 0.05}s`; 
        
        card.innerHTML = `
            <div class="card-actions">
                <button class="action-btn edit-btn" data-action="edit"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete-btn" data-action="delete"><i class="fas fa-trash"></i></button>
            </div>
            ${imageHtml}
            <div class="product-card-content">
                <h3 class="product-name">${product.name}</h3>
                ${metaHtml}
                <div class="product-price">${priceText}</div>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn')) {
                const btn = e.target.closest('.action-btn');
                if(btn.dataset.action === 'edit') promptEdit(product.product_id);
                if(btn.dataset.action === 'delete') promptDelete(product.product_id);
                return;
            }
            checkVariantAndAdd(product);
        });
        
        grid.appendChild(card);
    });
}

// --- 7. CART LOGIC ---
window.checkVariantAndAdd = function(p) {
    if (p.has_variants == 1 && p.variants.length > 0) {
        const container = document.getElementById('variant-options-container');
        container.innerHTML = '';
        p.variants.forEach(v => {
            const btn = document.createElement('button');
            btn.className = 'pay-btn';
            btn.style.width = '100%';
            btn.style.flexDirection = 'row';
            btn.style.justifyContent = 'space-between';
            btn.innerHTML = `<span>${v.variant_name}</span> <strong>PHP ${parseFloat(v.price).toFixed(2)}</strong>`;
            btn.onclick = () => { addToCart(p, v); closeModal('select-variant-modal'); };
            container.appendChild(btn);
        });
        openModal('select-variant-modal');
    } else { addToCart(p, null); }
}

// UPDATED: Save state after adding
function addToCart(p, v) {
    const id = v ? `${p.product_id}-${v.variant_id}` : `${p.product_id}`;
    const existingItem = cart.find(i => String(i.uniqueId) === String(id));
    
    if (existingItem) { 
        existingItem.qty++; 
    } else {
        cart.push({
            uniqueId: String(id),
            product_id: p.product_id,
            variant_id: v ? v.variant_id : null,
            variant_name: v ? v.variant_name : null,
            name: p.name,
            price: parseFloat(v ? v.price : p.price),
            image: p.image,
            qty: 1
        });
    }
    updateCartUI();
    saveCartState(); 
    showNotification("Added to cart", "success");
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    if (!container) return;

    container.innerHTML = '';

    if (cart.length === 0) {
        container.innerHTML = `<div class="empty-cart-state"><p>No items yet</p></div>`;
        calculateTotals();
        return;
    }

    const fragment = document.createDocumentFragment();

    cart.forEach((item, index) => {
        const itemDisplayName = item.variant_name ? `${item.name} (${item.variant_name})` : item.name;
        
        const div = document.createElement('div');
        div.className = 'cart-item';
        
        let imgHtml = '';
        if (item.image) {
            imgHtml = `<img src="${item.image}" class="cart-item-img" onerror="this.style.display='none'">`;
        } else {
            imgHtml = `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;color:#ccc"><i class="fas fa-box"></i></div>`;
        }

        div.innerHTML = `
            ${imgHtml}
            <div class="item-info">
                <h4>${itemDisplayName}</h4>
                <div class="unit-price">PHP ${parseFloat(item.price).toFixed(2)} x ${item.qty}</div>
            </div>
            <div class="item-controls">
                <button class="qty-btn" data-action="decrease">-</button>
                <span class="qty-val">${item.qty}</span>
                <button class="qty-btn" data-action="increase">+</button>
            </div>
            <div class="item-total">PHP ${(item.price * item.qty).toFixed(2)}</div>
            <button class="btn-remove-item" data-action="remove"><i class="fas fa-times"></i></button>
        `;

        div.querySelector('[data-action="decrease"]').onclick = () => changeQty(index, -1);
        div.querySelector('[data-action="increase"]').onclick = () => changeQty(index, 1);
        div.querySelector('[data-action="remove"]').onclick = () => removeOneItem(index);

        fragment.appendChild(div);
    });

    container.appendChild(fragment);
    calculateTotals();
}

// UPDATED: Save state after removing
window.removeOneItem = function(index) {
    requirePassword(() => {
        cart.splice(index, 1);
        updateCartUI();
        saveCartState(); 
    });
}

// UPDATED: Save state after qty change
window.changeQty = function(index, change) {
    if (cart[index].qty + change <= 0) {
        removeOneItem(index);
    } else {
        cart[index].qty += change;
        updateCartUI();
        saveCartState(); 
    }
}

// UPDATED: Clear state on manual clear
window.clearCart = function() {
    if(cart.length === 0) return;
    requirePassword(() => { 
        cart = []; 
        updateCartUI(); 
        clearCartState(); 
        showNotification("Cart Cleared", "success"); 
    });
}

window.promptDelete = function(id) { requirePassword(() => deleteProduct(id)); }

async function deleteProduct(id) {
    try {
        const res = await fetch('api/delete_product.php', { method: 'POST', body: JSON.stringify({ product_id: id }) });
        const data = await res.json();
        if (res.ok) { showNotification('Product Deleted', 'success'); await loadProducts(); await loadCategories(); }
        else { showNotification(data.message, 'error'); }
    } catch (e) { showNotification('Error', 'error'); }
}

function calculateTotals() {
    let sub = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
    let vat = 0;
    let disc = 0;
    let vatStatusText = "(Incl.)";
    
    if (appliedDiscountObj) {
        // Check minimum spend
        if (sub >= parseFloat(appliedDiscountObj.min_spend)) {
            // Determine the basis for the discount (if VAT Exempt, discount applies to Vatable Sales only)
            let basis = appliedDiscountObj.is_vat_exempt == 1 ? (sub / (1 + (currentVatRate/100))) : sub;
            
            if (appliedDiscountObj.type === 'percentage') {
                disc = basis * (parseFloat(appliedDiscountObj.value) / 100);
            } else {
                disc = parseFloat(appliedDiscountObj.value); // Fixed amount
            }
            
            // Apply Cap
            let cap = parseFloat(appliedDiscountObj.cap_amount);
            if (cap > 0 && disc > cap) { disc = cap; }
            
            // Calculate final VAT
            if (appliedDiscountObj.is_vat_exempt == 1) {
                vat = 0;
                vatStatusText = "(Voided)";
            } else {
                let discountedGross = sub - disc;
                vat = discountedGross - (discountedGross / (1 + (currentVatRate/100)));
            }
        } else {
            showNotification(`Minimum spend of PHP ${appliedDiscountObj.min_spend} required`, "error");
            appliedDiscountObj = null;
            currentDiscountType = null;
            document.querySelectorAll('.disc-btn').forEach(b => b.classList.remove('active-disc'));
            toggleDiscountInputs();
            let netSales = sub / (1 + (currentVatRate / 100));
            vat = sub - netSales;
        }
    } else {
        let netSales = sub / (1 + (currentVatRate / 100));
        vat = sub - netSales;
    }
    
    let total = sub - disc;
    if (total < 0) total = 0;

    // Update main UI
    if(document.getElementById('subtotal')) document.getElementById('subtotal').innerText = `PHP ${sub.toFixed(2)}`;
    if(document.getElementById('total')) document.getElementById('total').innerText = `PHP ${total.toFixed(2)}`;
    if(document.getElementById('pay-total')) document.getElementById('pay-total').innerText = `PHP ${total.toFixed(2)}`;
    
    // Update Breakdown Modal UI
    if(document.getElementById('chk-subtotal')) document.getElementById('chk-subtotal').innerText = `PHP ${sub.toFixed(2)}`;
    if(document.getElementById('chk-discount')) {
        document.getElementById('chk-discount').innerText = `-PHP ${disc.toFixed(2)}`;
        document.getElementById('chk-disc-name').innerText = appliedDiscountObj ? `(${appliedDiscountObj.name})` : '';
    }
    if(document.getElementById('chk-vat')) {
        document.getElementById('chk-vat').innerText = `PHP ${vat.toFixed(2)}`;
        document.getElementById('chk-vat-status').innerText = vatStatusText;
    }

    return { total, subtotal: sub, vatAmount: vat, discountAmount: disc };
}

window.toggleDiscountSection = function() {
    const area = document.getElementById('discount-selection-area');
    const btn = document.getElementById('toggle-discount-btn');
    if (area.style.display === 'none') {
        area.style.display = 'block';
        btn.style.display = 'none';
    } else {
        area.style.display = 'none';
        btn.style.display = 'flex';
    }
}

window.processCheckout = async function() {
    if (cart.length === 0) { showNotification("Cart is empty", "error"); return; }
    
    // Clear previous inputs
    const custNameInput = document.getElementById('global-cust-name');
    const idNumInput = document.getElementById('discount-id-number');
    if (custNameInput) custNameInput.value = '';
    if (idNumInput) idNumInput.value = '';
    
    // Reset discount state
    appliedDiscountObj = null;
    currentDiscountType = null;
    
    const discArea = document.getElementById('discount-selection-area');
    const discBtn = document.getElementById('toggle-discount-btn');
    if(discArea) discArea.style.display = 'none';
    if(discBtn) discBtn.style.display = 'flex';
    if(document.getElementById('discount-details-section')) document.getElementById('discount-details-section').style.display = 'none';
    
    await loadDiscounts();
    renderDiscountButtons(); 
    
    const totals = calculateTotals(); 
    document.getElementById('amount-tendered').value = '';
    document.getElementById('ref-number').value = ''; 
    selectPayment('cash');

    // SAFE Element Selection
    const paymentMethodsDiv = document.querySelector('.payment-methods');
    const paymentLabel = paymentMethodsDiv ? paymentMethodsDiv.previousElementSibling : null;
    const cashSection = document.getElementById('cash-section');
    const refSection = document.getElementById('ref-section');

    if (editingOrderId) {
        if (custNameInput && editingOrderData.customer_name) {
            custNameInput.value = editingOrderData.customer_name;
        }

        document.getElementById('payment-modal-title').innerText = `Update Transaction (${editingOrderData.transaction_number})`;
        if(document.getElementById('edit-status-section')) document.getElementById('edit-status-section').style.display = 'block';
        
        // --- NEW: STORE CREDIT LOGIC ---
        let originalTotalLocked = parseFloat(editingOrderData.original_total);
        if (isNaN(originalTotalLocked) || originalTotalLocked === 0) {
            originalTotalLocked = parseFloat(editingOrderData.total_amount || 0); // Fallback for first-time edits
        }

        const liveCartTotal = totals.total;
        let difference = liveCartTotal - originalTotalLocked;

        const diffEl = document.getElementById('edit-difference-display');
        if(diffEl) diffEl.style.display = 'block';
        
        if (difference < 0) {
            // SCENARIO A: Less than original (Store Credit Generated)
            let storeCredit = Math.abs(difference);
            
            if(paymentLabel) paymentLabel.style.display = 'none';
            if(paymentMethodsDiv) paymentMethodsDiv.style.display = 'none';
            if(cashSection) cashSection.style.display = 'none';
            if(refSection) refSection.style.display = 'none';

            diffEl.innerHTML = `
                <div style="padding:15px; background:#dcfce7; color:#166534; border-radius:8px; border: 1px solid #86efac; text-align:left; line-height: 1.5;">
                    <div style="font-weight:bold; margin-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-arrow-down"></i> Order Reduced (Price Locked)</div>
                    Original Locked Total: <strong>PHP ${originalTotalLocked.toFixed(2)}</strong><br>
                    Current Items Total: <strong>PHP ${liveCartTotal.toFixed(2)}</strong><br>
                    <div style="margin-top:8px; font-size: 1.1rem;">Store Credit Generated: <strong style="color:#14532d;">PHP ${storeCredit.toFixed(2)}</strong></div>
                </div>
            `;
            document.getElementById('amount-tendered').value = ''; 
            
        } else if (difference > 0) {
            // SCENARIO B: Greater than original (Additional Due)
            if(paymentLabel) paymentLabel.style.display = 'block';
            if(paymentMethodsDiv) paymentMethodsDiv.style.display = 'flex';
            if(cashSection) cashSection.style.display = 'block';

            diffEl.innerHTML = `
                <div style="padding:15px; background:#fef3c7; color:#92400e; border-radius:8px; border: 1px solid #fbd38d; text-align:left; line-height: 1.5;">
                    <div style="font-weight:bold; margin-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-arrow-up"></i> Additional Payment Required</div>
                    Original Locked Total: <strong>PHP ${originalTotalLocked.toFixed(2)}</strong><br>
                    Current Items Total: <strong>PHP ${liveCartTotal.toFixed(2)}</strong><br>
                    <div style="margin-top:8px; font-size: 1.1rem;">Additional Amount Due: <strong style="color:#b45309;">PHP ${difference.toFixed(2)}</strong></div>
                </div>
            `;
            document.getElementById('amount-tendered').value = difference.toFixed(2);
            calculateChange();
            
        } else {
            // SCENARIO C: Exact match
            if(paymentLabel) paymentLabel.style.display = 'none';
            if(paymentMethodsDiv) paymentMethodsDiv.style.display = 'none';
            if(cashSection) cashSection.style.display = 'none';
            if(refSection) refSection.style.display = 'none';

            diffEl.innerHTML = `
                <div style="padding:15px; background:#f3f4f6; color:#374151; border-radius:8px; border: 1px solid #d1d5db; text-align:left; line-height: 1.5;">
                    <div style="font-weight:bold; margin-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-equals"></i> No Change in Total</div>
                    Original Locked Total: <strong>PHP ${originalTotalLocked.toFixed(2)}</strong><br>
                    Current Items Total: <strong>PHP ${liveCartTotal.toFixed(2)}</strong><br>
                </div>
            `;
            document.getElementById('amount-tendered').value = '';
        }
    } else {
        // NORMAL CHECKOUT
        document.getElementById('payment-modal-title').innerText = "Checkout";
        if(document.getElementById('edit-difference-display')) document.getElementById('edit-difference-display').style.display = 'none';
        if(document.getElementById('edit-status-section')) document.getElementById('edit-status-section').style.display = 'none';

        if(paymentLabel) paymentLabel.style.display = 'block';
        if(paymentMethodsDiv) paymentMethodsDiv.style.display = 'flex';
        if(cashSection) cashSection.style.display = 'block';
    }
    
    openModal('payment-modal');

    // --- NEW: AUTO-FOCUS LOGIC ---
    setTimeout(() => {
        const amountInput = document.getElementById('amount-tendered');
        // Find the actual complete payment button inside the modal
        const confirmBtn = document.querySelector('#payment-modal button[onclick*="confirmPayment"], #payment-modal button[onclick*="executePayment"]');
        
        // If the cash input is visible, focus it. Otherwise, focus the Complete button!
        if (cashSection && cashSection.style.display !== 'none') {
            amountInput.focus();
        } else if (confirmBtn) {
            confirmBtn.focus();
        }
    }, 100);// 100ms delay allows the modal to become visible before focusing
}

function toggleDiscountInputs() {
    const inputs = document.getElementById('discount-details-section');
    if (appliedDiscountObj && appliedDiscountObj.requires_customer_info == 1) {
        inputs.style.display = 'block';
    } else {
        inputs.style.display = 'none';
        document.getElementById('discount-id-number').value = '';
    }
}

async function executePayment() {
    const totals = calculateTotals();
    const tendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
    const refNumber = document.getElementById('ref-number').value;
    const serviceTypeId = document.getElementById('service-type-select').value;
    
    let custName = document.getElementById('global-cust-name').value.trim() || null;
    let custIdType = null;
    let custIdNum = null;
    
    if (currentDiscountType) {
        custIdNum = document.getElementById('discount-id-number').value.trim();
        custIdType = currentDiscountType + " ID"; 
        if (appliedDiscountObj && appliedDiscountObj.requires_customer_info == 1) {
            if (!custName || !custIdNum) { showNotification("Customer Name and ID Number are required", "error"); return; }
        }
    }

    // --- ROLLING FUND MATH ---
    let finalTotal = totals.total;
    let finalTendered = tendered;
    let finalChange = 0;
    let retainedBalance = 0; 
    let originalTotalLocked = 0; // Initialize for payload

    if (editingOrderId) {
        originalTotalLocked = parseFloat(editingOrderData.original_total);
        if (isNaN(originalTotalLocked) || originalTotalLocked === 0) originalTotalLocked = parseFloat(editingOrderData.total_amount || 0);

        if (totals.total <= originalTotalLocked) {
            // SCENARIO A/C: Price Lock! 
            finalTotal = originalTotalLocked; 
            finalTendered = originalTotalLocked; 
            finalChange = 0;
            retainedBalance = originalTotalLocked - totals.total; // Store Credit
        } else {
            // SCENARIO B: Owe the difference
            let difference = totals.total - originalTotalLocked;
            if(selectedPaymentMethod === 'cash' && tendered < difference) {
                showNotification("Insufficient Amount for the difference", "error"); return; 
            }
            finalTotal = totals.total;
            finalTendered = originalTotalLocked + tendered; 
            finalChange = tendered - difference;
        }
    } else {
        // NORMAL CHECKOUT
        if(selectedPaymentMethod === 'cash' && tendered < totals.total) { showNotification("Insufficient Amount", "error"); return; }
        finalTendered = selectedPaymentMethod === 'cash' ? tendered : totals.total;
        finalChange = selectedPaymentMethod === 'cash' ? (tendered - totals.total) : 0;
    } 

    if(selectedPaymentMethod !== 'cash' && !refNumber) { showNotification("Reference Number Required", "error"); return; }

    const orderData = { 
        items: cart, 
        total: finalTotal,
        original_total: originalTotalLocked,
        store_credit: retainedBalance,
        subtotal: totals.subtotal, 
        vat_amount: totals.vatAmount, 
        discount_amount: totals.discountAmount, 
        discount_type: currentDiscountType, 
        payment_method: selectedPaymentMethod, 
        amount_tendered: finalTendered, 
        change_amount: finalChange, 
        retained_balance: retainedBalance, // Pass this strictly for the receipt UI
        reference_number: refNumber, 
        service_type_id: serviceTypeId,
        customer_name: custName, 
        customer_id_type: custIdType,
        customer_id_number: custIdNum,
        status: 'completed' 
    };

    if (editingOrderId) {
        orderData.order_id = editingOrderId;
        orderData.status = document.getElementById('edit-order-status').value;
    }

    const endpoint = editingOrderId ? 'api/edit_held_order.php' : 'api/save_order.php';
    
    try {
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) });
        const result = await res.json();
        
        if (res.ok) {
            closeModal('payment-modal');
            orderData.transaction_number = result.transaction_number || (editingOrderData ? editingOrderData.transaction_number : 'UPDATED');
            showReceipt(result.order_id || editingOrderId, orderData);
            openModal('receipt-modal');
            
            if (editingOrderId) { cancelEdit(); } 
            else { cart = []; updateCartUI(); clearCartState(); }
            
            currentDiscountType = null;
            document.querySelectorAll('.disc-btn').forEach(b => b.classList.remove('active-disc'));
        } else { showNotification(result.error || result.message, "error"); }
    } catch (e) { console.error(e); }
}

window.confirmPayment = function() { executePayment(); }

async function loadDiscounts() {
    const res = await fetch('api/get_discounts.php');
    activeDiscounts = await res.json();
}

function renderDiscountButtons() {
    const container = document.getElementById('dynamic-discount-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (activeDiscounts.length === 0) {
        container.innerHTML = '<small style="color:var(--gray);">No active discounts.</small>';
        return;
    }

    activeDiscounts.forEach(d => {
        const btn = document.createElement('button');
        btn.className = 'btn-primary disc-btn';
        btn.id = `btn-disc-${d.discount_id}`;
        btn.style.cssText = 'background:white; color:#374151; border:1px solid #d1d5db; flex:1; min-width:100px; padding:8px;';
        
        // Show percentage or fixed indicator
        const valueStr = d.type === 'percentage' ? `${parseFloat(d.value)}%` : `PHP ${parseFloat(d.value)}`;
        
        btn.innerHTML = `<strong>${d.name}</strong><br><small>${valueStr}</small>`;
        btn.onclick = () => toggleDiscountObj(d);
        container.appendChild(btn);
    });
}

window.toggleDiscountObj = function(discountObj) {
    // Wrap the entire action in the security prompt
    requirePassword(() => {
        if (appliedDiscountObj && appliedDiscountObj.discount_id === discountObj.discount_id) {
            // Deselect
            appliedDiscountObj = null;
            currentDiscountType = null;
            document.querySelectorAll('.disc-btn').forEach(b => b.classList.remove('active-disc'));
        } else {
            // Select
            appliedDiscountObj = discountObj;
            currentDiscountType = discountObj.name;
            document.querySelectorAll('.disc-btn').forEach(b => b.classList.remove('active-disc'));
            document.getElementById(`btn-disc-${discountObj.discount_id}`).classList.add('active-disc');
        }
        toggleDiscountInputs();
        calculateTotals();
    });
}

// --- UPDATED RECEIPT LOGIC (Compliance Update) ---
function showReceipt(id, data) {
    const storeName = posSettings.store_name || 'SimplePOS';
    const storeAddr = posSettings.store_address || 'Philippines';
    
    let total = (data.total !== undefined) ? data.total : data.total_amount;
    if (total === undefined || total === null) total = 0;
    
    const subtotal = data.subtotal || 0;
    const disc = data.discount_amount || 0;
    const vat = data.vat_amount || 0;
    const serviceName = serviceTypes.find(s => s.id == data.service_type_id)?.name || data.service_type || 'Walk-in';

    let itemsHtml = data.items.map(i => {
        const variantStr = i.variant || i.variant_name;
        const displayName = variantStr ? `${i.name} (${variantStr})` : i.name;
        return `<p style="display:flex;justify-content:space-between;margin-bottom:5px;"><span>${displayName} x${i.qty}</span><span>PHP ${(i.price*i.qty).toFixed(2)}</span></p>`;
    }).join('');

    // --- CUSTOMER INFO FOR DISCOUNTS ---
    let customerHtml = '';
    
    // Check if discount was applied (either by amount > 0 or type exists)
    if (parseFloat(data.discount_amount) > 0 || (data.discount_type && data.discount_type !== 'null')) {
        const idLabel = data.customer_id_type ? data.customer_id_type : (data.discount_type + ' ID');
        
        customerHtml = `
            <div style="margin-top:15px; border-top:1px dashed #9ca3af; padding-top:10px; font-size:0.8rem; text-align:left; line-height: 1.6; color: #000;">
                <p><strong>Customer Name:</strong> ${data.customer_name ? data.customer_name.toUpperCase() : ''}</p>
                <p><strong>${idLabel} Number:</strong> ${data.customer_id_number || 'N/A'}</p>
                <div style="margin-top: 20px; display: flex; align-items: flex-end;">
                    <span style="font-weight: bold; margin-right: 5px;">Signature:</span>
                    <div style="flex: 1; border-bottom: 1px solid #000; margin-bottom: 3px;"></div>
                </div>
            </div>
        `;
    }

    // --- NEW: CASH TENDERED & CHANGE DISPLAY ---
    let cashDetailsHtml = '';
    if (data.payment_method && data.payment_method.toLowerCase() === 'cash') {
        cashDetailsHtml = `
            <div style="margin-top:10px; border-top:1px dashed #ccc; padding-top:10px;">
                <p style="display:flex;justify-content:space-between; font-size: 0.9rem; margin-bottom:2px;"><span>Cash Tendered:</span><span>PHP ${parseFloat(data.amount_tendered || 0).toFixed(2)}</span></p>
                <p style="display:flex;justify-content:space-between; font-size: 0.9rem; margin-bottom:5px;"><span>Change:</span><span>PHP ${parseFloat(data.change_amount || 0).toFixed(2)}</span></p>
            </div>
        `;
    }

    document.getElementById('receipt-content').innerHTML = `
        <div style="text-align:center; font-family: monospace; color: #000;">
            <h3 style="margin-bottom: 5px; font-size: 1.2rem;">${storeName}</h3>
            <p style="font-size:0.8rem; margin-bottom: 15px;">${storeAddr}</p>
            
            <div style="text-align: center; margin-bottom: 10px; font-size: 0.85rem;">
                <p style="font-weight:bold;">${data.transaction_number || 'TRX-0000'}</p>
                <p>${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</p>                <p>Type: ${serviceName}</p>
                ${data.reference_number ? `<p>Ref: ${data.reference_number}</p>` : ''}
            </div>
            
            <hr style="border:1px dashed #9ca3af; margin:10px 0;">
            <div style="text-align:left; font-size: 0.9rem;">${itemsHtml}</div>
            <hr style="border:1px dashed #9ca3af; margin:10px 0;">
            
            <div style="font-size: 0.9rem; line-height: 1.4;">
                <p style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>PHP ${parseFloat(subtotal).toFixed(2)}</span></p>
                ${disc > 0 ? `<p style="display:flex;justify-content:space-between;"><span>Disc (${data.discount_type}):</span><span>-PHP ${parseFloat(disc).toFixed(2)}</span></p>` : ''}
                ${vat > 0 ? `<p style="display:flex;justify-content:space-between;font-size:0.8rem"><span>VAT (Incl.):</span><span>PHP ${parseFloat(vat).toFixed(2)}</span></p>` : ''}
                ${data.retained_balance > 0 ? `<p style="display:flex;justify-content:space-between; color:#166534; font-weight:bold; margin-top:5px; border-top:1px dashed #ccc; padding-top:5px;"><span>Rolling Fund Retained:</span><span>PHP ${parseFloat(data.retained_balance).toFixed(2)}</span></p>` : ''}
                
                ${cashDetailsHtml}
                
                <h3 style="text-align:right; margin-top:10px; padding-top:10px; border-top: 1px solid #000; font-size: 1.3rem;">Total: PHP ${parseFloat(total).toFixed(2)}</h3>
                <p style="text-align:right; font-size:0.8rem; margin-top:5px;">Paid via ${data.payment_method}</p>
            </div>
            
            ${customerHtml}
            
            <p style="margin-top: 20px; font-size: 0.8rem; text-align: center;">Thank you, come again!</p>
        </div>`;
}

window.printReceipt = function() {
    const content = document.getElementById('receipt-content').innerHTML;
    const win = window.open('', '', 'height=600,width=400');
    win.document.write('<html><head><title>Receipt</title><style>body{font-family:sans-serif; text-align:center; padding:20px;} hr{border-top:1px dashed #000;}</style></head><body>' + content + '</body></html>');
    win.document.close(); win.print();
}

window.selectPayment = function(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll('.pay-btn').forEach(btn => {
        const label = btn.querySelector('span').innerText;
        if(label.toLowerCase() === method.toLowerCase()) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (method === 'cash') { document.getElementById('cash-section').style.display = 'block'; document.getElementById('ref-section').style.display = 'none'; } 
    else { document.getElementById('cash-section').style.display = 'none'; document.getElementById('ref-section').style.display = 'block'; }
}

window.calculateChange = function() {
    const totals = calculateTotals();
    let requiredAmount = totals.total;
    
    // --- NEW: STORE CREDIT LOGIC FOR CHANGE CALCULATION ---
    if (editingOrderId) {
        // Fetch the locked original total just like we do in checkout
        let originalTotalLocked = parseFloat(editingOrderData.original_total);
        if (isNaN(originalTotalLocked) || originalTotalLocked === 0) {
            originalTotalLocked = parseFloat(editingOrderData.total_amount || 0);
        }
        
        // The required amount is strictly the difference (Additional Due)
        requiredAmount = totals.total - originalTotalLocked;
        
        // If the new total is less than the original, they owe nothing extra
        if (requiredAmount < 0) requiredAmount = 0; 
    }

    const tendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
    
    // Calculate change based on the newly determined requiredAmount
    const change = tendered - requiredAmount;
    
    const changeEl = document.getElementById('change-amount');
    if(change >= 0) { 
        changeEl.innerText = `PHP ${change.toFixed(2)}`; 
        changeEl.style.color = 'var(--text)'; 
    } else { 
        changeEl.innerText = "Insufficient"; 
        changeEl.style.color = 'red'; 
    }
}

// --- NEW: FILTER LOGIC ---
window.switchSalesTab = function(tab) {
    currentSalesTab = tab;
    document.getElementById('tab-completed').classList.toggle('active', tab === 'completed');
    document.getElementById('tab-hold').classList.toggle('active', tab === 'hold');
    filterSalesByDate(); // Re-render table with new tab context
}

window.filterSalesByDate = function() {
    const dateFilter = document.getElementById('sales-date-filter').value;
    const cashierFilterEl = document.getElementById('sales-cashier-filter');
    const cashierFilter = cashierFilterEl ? cashierFilterEl.value : 'all';
    
    const now = new Date();
    const todayStr = now.toDateString();
    
    let filteredData = allSales;
    let labelText = "(All Time)";

    // 1. Filter by Date
    if (dateFilter === 'today') {
        filteredData = filteredData.filter(sale => new Date(sale.created_at).toDateString() === todayStr);
        labelText = "(Today)";
    } else if (dateFilter !== 'all') {
        filteredData = filteredData.filter(sale => sale.created_at.startsWith(dateFilter));
        const [y, m] = dateFilter.split('-');
        const date = new Date(y, m - 1);
        labelText = `(${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`;
    }

    // 2. Filter by Cashier
    if (cashierFilter !== 'all') {
        filteredData = filteredData.filter(sale => String(sale.cashier_id) === String(cashierFilter));
        const cashierName = document.querySelector(`#sales-cashier-filter option[value="${cashierFilter}"]`).innerText;
        labelText += ` - ${cashierName}`;
    }

    const labelEl = document.getElementById('revenue-label');
    if(labelEl) labelEl.innerText = labelText;

    // --- NEW: Calculate Stats ONLY for 'completed' orders ---
    const completedOrders = filteredData.filter(s => s.status === 'completed');
    let totalSales = 0; let totalVat = 0;
    completedOrders.forEach(sale => {
        totalSales += parseFloat(sale.total_amount);
        totalVat += parseFloat(sale.vat_amount || 0);
    });
    const netSales = totalSales - totalVat;
    
    if(document.getElementById('report-total-sales')) document.getElementById('report-total-sales').innerText = `PHP ${totalSales.toFixed(2)}`;
    if(document.getElementById('report-total-orders')) document.getElementById('report-total-orders').innerText = completedOrders.length;
    if(document.getElementById('report-net-sales')) document.getElementById('report-net-sales').innerText = `PHP ${netSales.toFixed(2)}`;
    if(document.getElementById('report-total-vat')) document.getElementById('report-total-vat').innerText = `PHP ${totalVat.toFixed(2)}`;

    // 3. Render Table based on the active Tab
    const tableData = filteredData.filter(s => s.status === currentSalesTab);
    renderSalesTable(tableData);
}

// --- UPDATE: LOAD SALES HISTORY ---
window.loadSalesHistory = async function() {
    try {
        const res = await fetch('api/get_sales.php');
        allSales = await res.json();
        
        populateDateFilter(allSales);
        populateCashierFilter(allSales);
        
        filterSalesByDate(); 
    } catch (e) { showNotification("Error loading sales", "error"); }
}

function populateDateFilter(sales) {
    const filterEl = document.getElementById('sales-date-filter');
    if(!filterEl) return;
    filterEl.innerHTML = `<option value="all">All Time</option><option value="today">Today</option>`;
    
    const months = new Set();
    sales.forEach(sale => {
        const date = new Date(sale.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(key);
    });
    
    const sortedMonths = Array.from(months).sort().reverse();
    sortedMonths.forEach(monthKey => {
        const [year, month] = monthKey.split('-');
        const date = new Date(year, month - 1);
        const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = monthKey; opt.innerText = label;
        filterEl.appendChild(opt);
    });
}

function populateCashierFilter(sales) {
    const filterEl = document.getElementById('sales-cashier-filter');
    if(!filterEl) return;
    
    const user = JSON.parse(sessionStorage.getItem('user'));
    // Only show the filter if the user is a Store Admin
    if(user && user.role !== 'store_admin') {
        filterEl.style.display = 'none'; 
        return;
    }
    
    filterEl.style.display = 'inline-block';
    filterEl.innerHTML = '<option value="all">All Cashiers</option>';
    
    const cashiers = new Map();
    sales.forEach(s => {
        if(!cashiers.has(s.cashier_id) && s.cashier_name) {
            cashiers.set(s.cashier_id, s.cashier_name);
        }
    });
    
    cashiers.forEach((name, id) => {
        const opt = document.createElement('option');
        opt.value = id; opt.innerText = name;
        filterEl.appendChild(opt);
    });
}

// --- UPDATED SALES RENDERER ---
function renderSalesTable(salesData) {
    const tbody = document.getElementById('sales-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    let totalSales = 0;
    let totalVat = 0; 
    let lastDateStr = null;
    const todayStr = new Date().toDateString();
    
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterdayStr = yest.toDateString();
    
    if(!salesData || salesData.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No matching records found.</td></tr>'; 
    } else {
        salesData.forEach(sale => {
            const saleTotal = parseFloat(sale.total_amount);
            const saleVat = parseFloat(sale.vat_amount || 0);
            totalSales += saleTotal;
            totalVat += saleVat; 
            
            const saleDate = new Date(sale.created_at);
            const currentDateStr = saleDate.toDateString();
            
            if (currentDateStr !== lastDateStr) {
                let label = saleDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                if (currentDateStr === todayStr) label = "Today";
                else if (currentDateStr === yesterdayStr) label = "Yesterday";
                
                const sepRow = document.createElement('tr');
                sepRow.className = 'date-separator';
                sepRow.innerHTML = `<td colspan="7">${label}</td>`;
                tbody.appendChild(sepRow);
                lastDateStr = currentDateStr;
            }

            const tr = document.createElement('tr');
            tr.className = 'clickable-row';
            
            const itemCount = sale.items.reduce((acc, i) => acc + parseInt(i.qty), 0);
            const discountDisplay = (parseFloat(sale.discount_amount) > 0) 
                ? `<span style="color:green; font-size:0.8rem;">${sale.discount_type} (-${parseFloat(sale.discount_amount).toFixed(2)})</span>` 
                : '-';
            
            const customerDisplay = sale.customer_name ? `<br><small style="color:#666">${sale.customer_name}</small>` : '';
            const timeStr = saleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // Show Cashier Tag for Store Admins
            const user = JSON.parse(sessionStorage.getItem('user'));

        tr.innerHTML = `
            <td style="font-family:monospace; font-weight:600; color:var(--primary);">${sale.transaction_number || sale.formatted_ref}</td>
            <td>${timeStr}</td>
            <td><span class="badge-service">${sale.service_type || 'Walk-in'}</span>${customerDisplay}</td>
            <td><span style="color:var(--primary); font-weight:600; font-size:0.85rem;"><i class="fas fa-user-tag"></i> ${sale.cashier_name || 'Admin'}</span></td>
            <td>${itemCount}</td>
            <td>${discountDisplay}</td>
            <td><span class="text-success">PHP ${saleTotal.toFixed(2)}</span></td>
        `;
            tr.onclick = () => toggleOrderDetails(tr, sale);
            tbody.appendChild(tr);
        });
    }
    
    const netSales = totalSales - totalVat;
    if(document.getElementById('report-total-sales')) document.getElementById('report-total-sales').innerText = `PHP ${totalSales.toFixed(2)}`;
    if(document.getElementById('report-total-orders')) document.getElementById('report-total-orders').innerText = salesData.length;
    if(document.getElementById('report-net-sales')) document.getElementById('report-net-sales').innerText = `PHP ${netSales.toFixed(2)}`;
    if(document.getElementById('report-total-vat')) document.getElementById('report-total-vat').innerText = `PHP ${totalVat.toFixed(2)}`;
}

function toggleOrderDetails(row, sale) {
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.classList.contains('order-detail-row')) { nextRow.remove(); row.classList.remove('active-row'); return; }
    document.querySelectorAll('.order-detail-row').forEach(el => { el.previousElementSibling.classList.remove('active-row'); el.remove(); });
    row.classList.add('active-row');

    let itemsHtml = sale.items.map(item => `
        <tr>
            <td>${item.qty}x</td>
            <td>${item.name} ${item.variant ? `(${item.variant})` : ''}</td>
            <td>PHP ${parseFloat(item.price).toFixed(2)}</td>
            <td style="text-align:right;">PHP ${parseFloat(item.total).toFixed(2)}</td>
        </tr>
    `).join('');

    const detailRow = document.createElement('tr');
    detailRow.className = 'order-detail-row';
    detailRow.innerHTML = `
        <td colspan="7">
            <div class="detail-container">
                <table class="detail-table">
                    <thead><tr><th width="10%">Qty</th><th width="50%">Item</th><th width="20%">Price</th><th width="20%" style="text-align:right;">Total</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div class="detail-footer">
                    <div class="breakdown">
                        <p><span>Subtotal:</span> <span>PHP ${parseFloat(sale.subtotal).toFixed(2)}</span></p>
                        ${parseFloat(sale.discount_amount) > 0 ? `<p style="color:green;"><span>Discount (${sale.discount_type}):</span> <span>-PHP ${parseFloat(sale.discount_amount).toFixed(2)}</span></p>` : ''}
                        <p><span>VAT:</span> <span>PHP ${parseFloat(sale.vat_amount).toFixed(2)}</span></p>
                        <h4 style="margin-top:5px; border-top:1px solid #ddd; padding-top:5px;"><span>Total:</span> <span>PHP ${parseFloat(sale.total_amount).toFixed(2)}</span></h4>
                    </div>
                    <div class="actions">
                        <p style="font-size:0.8rem; color:#666; text-align:right;">Ref: ${sale.reference_number || 'N/A'}</p>
                        <div style="display:flex; gap:10px; margin-top: 10px; justify-content:flex-end;">
                            ${sale.status === 'completed' 
                                ? `<button class="btn-primary" style="background:#f59e0b;" onclick="requirePassword(() => updateOrderStatus(${sale.order_id}, 'hold'))"><i class="fas fa-pause"></i> Put on Hold</button>`
                                : `<button class="btn-primary" style="background:#10b981;" onclick="requirePassword(() => updateOrderStatus(${sale.order_id}, 'completed'))"><i class="fas fa-check"></i> Fulfill Order</button>
                                <button class="btn-primary" style="background:#3b82f6;" onclick="requirePassword(() => openEditHoldModal(${sale.order_id}))"><i class="fas fa-pen"></i> Edit Hold</button>`
                            }
                            <button class="btn-primary" style="background:#e5e7eb; color:var(--text);" onclick="showReceipt(${sale.order_id}, ${JSON.stringify(sale).replace(/"/g, '&quot;')}); openModal('receipt-modal');">
                                <i class="fas fa-print"></i> Reprint
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </td>
    `;
    row.parentNode.insertBefore(detailRow, row.nextSibling);
}

window.updateOrderStatus = async function(orderId, newStatus) {
    try {
        const res = await fetch('api/update_order_status.php', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, status: newStatus })
        });
        const result = await res.json();
        if (result.success) {
            showNotification(`Transaction marked as ${newStatus}`, "success");
            loadSalesHistory(); // Refresh to update tabs and stats
        } else {
            showNotification("Error updating status", "error");
        }
    } catch (e) {
        showNotification("Connection error", "error");
    }
}

window.openEditHoldModal = function(orderId) {
    if (cart.length > 0) {
        showConfirm("You have items in your current register. Editing a held order will clear them. Proceed?", () => proceedToEdit(orderId));
    } else {
        proceedToEdit(orderId);
    }
}

function proceedToEdit(orderId) {
    const sale = allSales.find(s => s.order_id == orderId);
    if(!sale) return;

    editingOrderId = orderId;
    editingOrderData = sale;
    
    // Inject items into the main cart
    cart = sale.items.map(i => ({
        uniqueId: i.variant_id ? `${i.product_id}-${i.variant_id}` : `${i.product_id}`,
        product_id: i.product_id,
        variant_id: i.variant_id,
        variant_name: i.variant,
        name: i.name,
        price: parseFloat(i.price),
        image: '', 
        qty: parseInt(i.qty)
    }));

    appliedDiscountObj = null; currentDiscountType = null;
    document.querySelectorAll('.disc-btn').forEach(b => b.classList.remove('active-disc'));

    updateCartUI();
    showView('pos', document.querySelector('.nav-btn')); 
    
    // Morph the UI into "Edit Mode"
    document.getElementById('checkout-btn-el').innerText = "Update Held Order";
    document.getElementById('checkout-btn-el').style.background = "#f59e0b";
    document.getElementById('cancel-edit-btn').style.display = 'block';
    
    showNotification("Loaded order for editing", "success");
}

window.cancelEdit = function() {
    editingOrderId = null; editingOrderData = null; cart = [];
    updateCartUI();
    document.getElementById('checkout-btn-el').innerText = "Pay Now";
    document.getElementById('checkout-btn-el').style.background = "var(--primary)";
    document.getElementById('cancel-edit-btn').style.display = 'none';
}

// --- 9. SAVE SETTINGS ---
window.saveGlobalSettings = function() {
    requirePassword(async () => {
        // 1. Get Elements safely
        const vatEl = document.getElementById('setting-vat-rate');
        const nameEl = document.getElementById('setting-store-name');
        const addrEl = document.getElementById('setting-store-address');

        // 2. Crash Prevention: Check if elements exist
        if (!vatEl || !nameEl || !addrEl) {
            showNotification("Error: Settings form incomplete. Refresh page.", "error");
            return;
        }

        const payload = { 
            vat_rate: vatEl.value, 
            store_name: nameEl.value, 
            store_address: addrEl.value 
        };
        
        try {
            const res = await fetch('api/save_settings.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            
            if(res.ok) {
                showNotification("Settings Saved Successfully!", "success");
                await fetchSettings(); // Reload global settings immediately
                // Update header manually just in case
                document.getElementById('store-brand').innerText = payload.store_name;
            } else {
                showNotification("Error saving settings", "error");
            }
        } catch(e) { console.error(e); }
    });
}

// --- 11. SETTINGS PAGE UI LOADER ---
function loadSettingsPageUI() {
    const vatInput = document.getElementById('setting-vat-rate');
    const nameInput = document.getElementById('setting-store-name');
    const addrInput = document.getElementById('setting-store-address');

    if (vatInput) vatInput.value = posSettings.vat_rate;
    // Handle potential null/undefined for text inputs
    if (nameInput) nameInput.value = posSettings.store_name || '';
    if (addrInput) addrInput.value = posSettings.store_address || '';
}

// --- NEW: SEPARATE SAVE FUNCTIONS ---

// 1. Save Store Info Only
window.saveStoreSettings = function() {
    const name = document.getElementById('setting-store-name').value;
    const addr = document.getElementById('setting-store-address').value;
    
    if(!name || !addr) { showNotification("Please fill in fields", "error"); return; }

    requirePassword(async () => {
        // INSTANTLY Update Global State (Client-Side)
        posSettings.store_name = name;
        posSettings.store_address = addr;
        
        // Update Sidebar
        document.getElementById('store-brand').innerText = name;

        // Send to Backend
        const payload = { 
            vat_rate: posSettings.vat_rate, // Keep existing VAT
            store_name: name, 
            store_address: addr 
        };
        await executeSaveSettings(payload, "Store Info Updated!");
    });
}

// 2. Save Tax Info Only
window.saveTaxSettings = function() {
    const vat = document.getElementById('setting-vat-rate').value;
    
    requirePassword(async () => {
        // INSTANTLY Update Global State
        posSettings.vat_rate = parseFloat(vat);
        currentVatRate = parseFloat(vat);
        
        // Send to Backend
        const payload = { 
            vat_rate: vat,
            store_name: posSettings.store_name, // Keep existing Name
            store_address: posSettings.store_address // Keep existing Address
        };
        await executeSaveSettings(payload, "Tax Rate Updated!");
    });
}

async function executeSaveSettings(payload, successMsg) {
    try {
        const res = await fetch('api/save_settings.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if(res.ok) {
            showNotification(successMsg, "success");
            // Optional: Re-fetch to confirm sync
            fetchSettings();
        } else {
            showNotification("Save Failed: " + (data.message || "Unknown error"), "error");
        }
    } catch(e) { console.error(e); showNotification("Connection Error", "error"); }
}

// --- MOBILE CART LOGIC ---
window.toggleMobileCart = function() {
    const cartArea = document.querySelector('.cart-area');
    if(cartArea) {
        cartArea.classList.toggle('show-cart');
    }
}

// Hook into the existing updateCartUI function to update the red badge number
const originalUpdateCartUI = updateCartUI;
updateCartUI = function() {
    originalUpdateCartUI(); // Run the normal update
    
    // Update mobile floating button count
    const badge = document.getElementById('mobile-cart-count');
    if(badge) {
        const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
        badge.innerText = totalQty;
        badge.style.display = totalQty > 0 ? 'block' : 'none';
    }
}

// STORE ADMIN: CASHIER MANAGEMENT

// Hook into the settings loader
const originalLoadSettings = loadSettingsPageUI;
loadSettingsPageUI = function() {
    originalLoadSettings();
    const user = JSON.parse(sessionStorage.getItem('user'));
    if(user && user.role === 'store_admin') {
        loadCashiers();
    }
};

async function loadCashiers() {
    try {
        const res = await fetch('api/store_cashiers.php?action=get');
        const cashiers = await res.json();
        const tbody = document.getElementById('cashier-list-body');
        tbody.innerHTML = '';
        
        if(cashiers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No cashiers created yet.</td></tr>';
            return;
        }

        cashiers.forEach(c => {
            const tr = document.createElement('tr');
            
            // Online Indicator Logic
            const isOnline = c.is_logged_in == 1;
            const dotColor = isOnline ? '#10b981' : '#d1d5db';
            const onlineText = isOnline ? 'Online' : 'Offline';
            const onlineBadge = `<div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; border-radius:50%; background:${dotColor};"></div> <small>${onlineText}</small></div>`;

            // Suspended UI Logic
            const isSuspended = c.account_status === 'suspended';
            const suspendBtnStr = isSuspended 
                ? `<button class="action-btn" style="background:#10b981; width:auto; padding:0 8px;" title="Unsuspend" onclick="requirePassword(() => toggleCashierStatus(${c.user_id}, 'active'))"><i class="fas fa-play"></i></button>`
                : `<button class="action-btn" style="background:#f59e0b; width:auto; padding:0 8px;" title="Suspend" onclick="requirePassword(() => toggleCashierStatus(${c.user_id}, 'suspended'))"><i class="fas fa-pause"></i></button>`;

            tr.innerHTML = `
                <td>${c.first_name} ${c.last_name}</td>
                <td><strong>${c.username}</strong></td>
                <td><span style="font-family:monospace; background:#f3f4f6; padding:2px 6px; border-radius:4px;">${c.raw_password}</span></td>
                <td>${onlineBadge}</td>
                <td><span class="variant-badge" style="background:${isSuspended ? '#fee2e2' : '#e0e7ff'}; color:${isSuspended ? '#ef4444' : 'var(--primary)'}">${c.account_status.toUpperCase()}</span></td>
                <td style="text-align:right; display:flex; gap:5px; justify-content:flex-end;">
                    <button class="action-btn edit-btn" title="Edit Name" onclick="requirePassword(() => openEditCashier(${c.user_id}, '${c.first_name}', '${c.last_name}'))"><i class="fas fa-pen"></i></button>
                    <button class="action-btn" style="background:#3b82f6;" title="Reset Password" onclick="requirePassword(() => resetCashierPassword(${c.user_id}))"><i class="fas fa-key"></i></button>
                    ${suspendBtnStr}
                    <button class="action-btn delete-btn" title="Delete" onclick="requirePassword(() => deleteCashier(${c.user_id}))"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function saveNewCashier() {
    const data = {
        first_name: document.getElementById('cashier-fname').value,
        last_name: document.getElementById('cashier-lname').value,
        username: document.getElementById('cashier-uname').value,
        password: document.getElementById('cashier-pass').value
    };
    
    if(!data.first_name || !data.username || !data.password) return showNotification("Fill required fields", "error");

    const res = await fetch('api/store_cashiers.php?action=add', { method: 'POST', body: JSON.stringify(data) });
    const result = await res.json();
    
    if(result.success) {
        showNotification("Cashier Added!", "success");
        closeModal('add-cashier-modal');
        document.getElementById('cashier-fname').value = ''; document.getElementById('cashier-lname').value = '';
        document.getElementById('cashier-uname').value = ''; document.getElementById('cashier-pass').value = '';
        loadCashiers();
    } else { showNotification(result.message, "error"); }
}

function openEditCashier(id, fname, lname) {
    document.getElementById('edit-cashier-id').value = id;
    document.getElementById('edit-cashier-fname').value = fname;
    document.getElementById('edit-cashier-lname').value = lname;
    openModal('edit-cashier-modal');
}

async function updateCashierInfo() {
    const data = {
        user_id: document.getElementById('edit-cashier-id').value,
        first_name: document.getElementById('edit-cashier-fname').value,
        last_name: document.getElementById('edit-cashier-lname').value
    };
    await fetch('api/store_cashiers.php?action=edit', { method: 'POST', body: JSON.stringify(data) });
    showNotification("Cashier Updated", "success");
    closeModal('edit-cashier-modal');
    loadCashiers();
}

async function resetCashierPassword(id) {
    const newPass = prompt("Enter new password for cashier:");
    if(!newPass) return;
    await fetch('api/store_cashiers.php?action=reset_password', { method: 'POST', body: JSON.stringify({ user_id: id, password: newPass }) });
    showNotification("Password Reset!", "success");
    loadCashiers();
}

async function toggleCashierStatus(id, newStatus) {
    await fetch('api/store_cashiers.php?action=update_status', { method: 'POST', body: JSON.stringify({ user_id: id, status: newStatus }) });
    showNotification("Status Updated", "success");
    loadCashiers();
}

// SOFT DELETE
async function deleteCashier(id) {
    showConfirm("Are you sure? This deletes the login, but keeps receipt history intact.", async () => {
        await fetch('api/store_cashiers.php?action=update_status', { method: 'POST', body: JSON.stringify({ user_id: id, status: 'deleted' }) });
        showNotification("Cashier Account Removed", "success");
        loadCashiers();
    });
}

// ==========================================
// PARK ORDER SYSTEM
// ==========================================
window.parkCurrentOrder = function() {
    if (cart.length === 0) { showNotification("Cart is empty", "error"); return; }
    
    const d = new Date();
    const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const parkId = "Parked - " + timeStr;
    
    parkedOrders.push({
        id: parkId,
        timestamp: d.getTime(),
        items: [...cart]
    });
    
    localStorage.setItem('parked_orders', JSON.stringify(parkedOrders));
    
    cart = [];
    updateCartUI();
    saveCartState();
    showNotification("Order Parked Successfully", "success");
}

window.openRecallModal = function() {
    const list = document.getElementById('parked-list');
    list.innerHTML = '';
    
    if (parkedOrders.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--gray);">No parked orders.</p>';
        openModal('parked-modal');
        return;
    }

    parkedOrders.forEach((order, index) => {
        let itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
        let totalVal = order.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        
        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f9fafb; padding:15px; border-radius:10px; border:1px solid #e5e7eb;";
        div.innerHTML = `
            <div>
                <h4 style="margin:0; color:var(--primary);">${order.id}</h4>
                <small style="color:var(--gray);">${itemCount} items | Est. Total: PHP ${totalVal.toFixed(2)}</small>
            </div>
            <button class="btn-primary" onclick="recallOrder(${index})"><i class="fas fa-hand-holding-usd"></i> Recall</button>
        `;
        list.appendChild(div);
    });
    
    openModal('parked-modal');
}

window.recallOrder = function(index) {
    if (cart.length > 0) {
        showConfirm("Your current cart is not empty. Recalling will replace it. Proceed?", () => executeRecall(index));
    } else {
        executeRecall(index);
    }
}

function executeRecall(index) {
    cart = [...parkedOrders[index].items];
    parkedOrders.splice(index, 1); // Remove from parked list
    localStorage.setItem('parked_orders', JSON.stringify(parkedOrders));
    
    updateCartUI();
    saveCartState();
    closeModal('parked-modal');
    showNotification("Order Recalled", "success");
}

// ==========================================
// STORE ADMIN: DISCOUNT MANAGEMENT
// ==========================================
const originalSettingsLoader = loadSettingsPageUI;
loadSettingsPageUI = function() {
    originalSettingsLoader();
    const user = JSON.parse(sessionStorage.getItem('user'));
    if(user && user.role === 'store_admin') {
        loadDiscountTable();
    }
};

async function loadDiscountTable() {
    const res = await fetch('api/get_discounts.php');
    const discounts = await res.json();
    const tbody = document.getElementById('discounts-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if (discounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No discounts created.</td></tr>';
        return;
    }

    discounts.forEach(d => {
        const valStr = d.type === 'percentage' ? `${parseFloat(d.value)}%` : `PHP ${parseFloat(d.value)}`;
        const tr = document.createElement('tr');
        
        // Sanitize string for JS function call
        const safeName = d.name.replace(/'/g, "\\'");

        tr.innerHTML = `
            <td><strong>${d.name}</strong></td>
            <td>${valStr}</td>
            <td>PHP ${parseFloat(d.min_spend).toFixed(2)}</td>
            <td>${parseFloat(d.cap_amount) > 0 ? 'PHP ' + parseFloat(d.cap_amount).toFixed(2) : 'None'}</td>
            <td>${d.is_vat_exempt == 1 ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
            <td>${d.requires_customer_info == 1 ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
            <td style="text-align:right;">
                <button class="action-btn edit-btn" style="display:inline-flex; width:28px; height:28px;" title="Edit" onclick="requirePassword(() => openEditDiscount(${d.discount_id}, '${safeName}', '${d.type}', ${d.value}, ${d.min_spend}, ${d.cap_amount}, ${d.is_vat_exempt}, ${d.requires_customer_info}))"><i class="fas fa-pen"></i></button>
                <button class="action-btn delete-btn" style="display:inline-flex; width:28px; height:28px;" title="Delete" onclick="requirePassword(() => deleteDiscount(${d.discount_id}))"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveNewDiscount() {
    const data = {
        name: document.getElementById('disc-name').value,
        type: document.getElementById('disc-type').value,
        value: document.getElementById('disc-value').value,
        min_spend: document.getElementById('disc-min').value || 0,
        cap_amount: document.getElementById('disc-cap').value || 0,
        is_vat_exempt: document.getElementById('disc-vat').checked ? 1 : 0,
        requires_customer_info: document.getElementById('disc-id').checked ? 1 : 0
    };
    
    if(!data.name || !data.value) return showNotification("Name and Value required", "error");

    const res = await fetch('api/save_discount.php', { method: 'POST', body: JSON.stringify(data) });
    if(res.ok) {
        showNotification("Discount Created!", "success");
        closeModal('add-discount-modal');
        loadDiscountTable();
    } else {
        showNotification("Error saving discount", "error");
    }
}

window.openEditDiscount = function(id, name, type, value, min, cap, vat, reqId) {
    document.getElementById('edit-disc-id').value = id;
    document.getElementById('edit-disc-name').value = name;
    document.getElementById('edit-disc-type').value = type;
    document.getElementById('edit-disc-value').value = value;
    document.getElementById('edit-disc-min').value = min;
    document.getElementById('edit-disc-cap').value = cap;
    document.getElementById('edit-disc-vat').checked = vat == 1;
    document.getElementById('edit-disc-id-req').checked = reqId == 1;
    openModal('edit-discount-modal');
}

window.updateDiscount = async function() {
    const data = {
        id: document.getElementById('edit-disc-id').value,
        name: document.getElementById('edit-disc-name').value,
        type: document.getElementById('edit-disc-type').value,
        value: document.getElementById('edit-disc-value').value,
        min_spend: document.getElementById('edit-disc-min').value || 0,
        cap_amount: document.getElementById('edit-disc-cap').value || 0,
        is_vat_exempt: document.getElementById('edit-disc-vat').checked ? 1 : 0,
        requires_customer_info: document.getElementById('edit-disc-id-req').checked ? 1 : 0
    };

    if(!data.name || !data.value) return showNotification("Name and Value required", "error");

    const res = await fetch('api/edit_discount.php', { method: 'POST', body: JSON.stringify(data) });
    if(res.ok) {
        showNotification("Discount Updated!", "success");
        closeModal('edit-discount-modal');
        loadDiscountTable();
    } else { showNotification("Error updating discount", "error"); }
}

window.deleteDiscount = async function(id) {
    showConfirm("Delete this discount? (Will not affect past receipts)", async () => {
        const res = await fetch('api/delete_discount.php', { method: 'POST', body: JSON.stringify({ id: id }) });
        if(res.ok) {
            showNotification("Discount Deleted", "success");
            loadDiscountTable();
        } else { showNotification("Error deleting discount", "error"); }
    });
}