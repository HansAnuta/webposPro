<?php
session_start();
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

include_once 'db_connect.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$product_id = $_POST['product_id'] ?? null;
$name = $_POST['name'] ?? null;
$type = $_POST['type'] ?? 'product';
$category_name = $_POST['category_name'] ?? null;
$price = $_POST['price'] ?? 0;
$product_code = $_POST['product_code'] ?? null; 
if ($product_code === '') $product_code = null;

$variants_json = $_POST['variants'] ?? '[]';
$variants = json_decode($variants_json);

// --- ADDED MISSING VARIABLES ---
// We need to figure out if there are variants and set the base price BEFORE we use them in the query!
$has_variants = (is_array($variants) && count($variants) > 0) ? 1 : 0;
$base_price = $has_variants ? 0 : $price; 

// Better validation: Let's see exactly what is missing
if (!$product_id || trim($name) === '' || trim($category_name) === '') {
    http_response_code(400);
    echo json_encode(["message" => "Missing data! ID: $product_id, Name: $name, Category: $category_name"]);
    exit;
}

try {
    $pdo->beginTransaction();
    $user_id = $_SESSION['user_id'];

    // 1. Get or Create Category
    $stmt = $pdo->prepare("SELECT category_id FROM categories WHERE name = ? AND user_id = ? AND type = ?");
    $stmt->execute([$category_name, $user_id, $type]);
    $cat = $stmt->fetch();

    if ($cat) {
        $category_id = $cat['category_id'];
    } else {
        $stmt = $pdo->prepare("INSERT INTO categories (name, user_id, type) VALUES (?, ?, ?)");
        $stmt->execute([$category_name, $user_id, $type]);
        $category_id = $pdo->lastInsertId();
    }

    // 2. Handle optional Image replacement
    $image_query = "";
    
    // Now we can safely use $base_price and $has_variants
    $params = [$category_id, $name, $product_code, $base_price, $has_variants];

    if (isset($_FILES['image']) && $_FILES['image']['error'] === 0) {
        $target_dir = "../uploads/";
        if (!is_dir($target_dir)) mkdir($target_dir, 0777, true);
        
        $file_ext = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
        $new_filename = uniqid() . "." . $file_ext;
        
        if (move_uploaded_file($_FILES['image']['tmp_name'], $target_dir . $new_filename)) {
            $image_query = ", image = ?";
            $params[] = "uploads/" . $new_filename;
        }
    }

    // Append WHERE clause variables
    $params[] = $product_id;
    $params[] = $user_id; // Security check: Only the owner can update this

    // 3. Update the Product
    $sql = "UPDATE products SET category_id = ?, name = ?, product_code = ?, price = ?, has_variants = ? $image_query WHERE product_id = ? AND user_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // 4. Reset and Re-insert Variants
    $pdo->prepare("DELETE FROM product_variants WHERE product_id = ?")->execute([$product_id]);
    
    if ($has_variants) {
        $sql_var = "INSERT INTO product_variants (product_id, variant_name, price) VALUES (?, ?, ?)";
        $stmt_var = $pdo->prepare($sql_var);
        foreach ($variants as $variant) {
            if(!empty($variant->name)) {
                $stmt_var->execute([$product_id, $variant->name, $variant->price]);
            }
        }
    }

    $pdo->commit();
    echo json_encode(["message" => "Product updated successfully"]);

} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
?>