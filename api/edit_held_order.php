<?php
session_start();
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
include_once 'db_connect.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

// Block Manager (store_admin) from processing transactions
if ($_SESSION['role'] === 'store_admin') {
    http_response_code(403);
    echo json_encode(["message" => "Managers are not allowed to process transactions."]);
    exit;
}

$data = json_decode(file_get_contents("php://input"));
$user_id = $_SESSION['user_id'];

try {
    $pdo->beginTransaction();

    // 1. Recalculate Subtotal/VAT for the NEW items
    $raw_subtotal = 0;
    foreach($data->items as $item) {
        $raw_subtotal += ($item->price * $item->qty);
    }
    
    $vat_rate = 12; 
    $is_exempt = ($data->discount_type === 'Senior' || $data->discount_type === 'PWD');
    $final_vat_amount = 0; $final_discount_amount = 0; $final_subtotal = $raw_subtotal; 
    
    if ($is_exempt) {
        $vat_exempt_sales = $raw_subtotal / (1 + ($vat_rate / 100));
        $calculated_discount = $vat_exempt_sales * 0.20;
        $final_discount_amount = ($calculated_discount > 50) ? 50.00 : $calculated_discount;
    } else {
        $net_sales = $raw_subtotal / (1 + ($vat_rate / 100));
        $final_vat_amount = $raw_subtotal - $net_sales;
    }

    // 2. Update the existing Order (Notice :uid1 and :uid2 at the end)
    $sql_order = "UPDATE orders SET 
        service_type_id = :svc_id, customer_name = :cust_name, customer_id_type = :id_type, customer_id_number = :id_num,
        total_amount = :total, original_total = :orig_total, store_credit = :store_credit, 
        subtotal = :sub, vat_amount = :vat, discount_amount = :disc, discount_type = :dtype,
        payment_method = :method, amount_tendered = :tendered, change_amount = :change, status = :status
        WHERE order_id = :oid AND (user_id = :uid1 OR user_id IN (SELECT user_id FROM users WHERE parent_id = :uid2))";
    
    $stmt = $pdo->prepare($sql_order);
    
    // Bind all 18 unique parameters explicitly
    $stmt->execute([
        ':svc_id' => $data->service_type_id ?? 1,
        ':cust_name' => $data->customer_name ?? null,
        ':id_type' => $data->customer_id_type ?? null,
        ':id_num' => $data->customer_id_number ?? null,
        ':total' => $data->total, 
        ':orig_total' => $data->original_total ?? 0,
        ':store_credit' => $data->store_credit ?? 0,
        ':sub' => $final_subtotal,
        ':vat' => $final_vat_amount,
        ':disc' => $final_discount_amount,
        ':dtype' => $data->discount_type,
        ':method' => $data->payment_method,
        ':tendered' => $data->amount_tendered, 
        ':change' => $data->change_amount, 
        ':status' => $data->status ?? 'completed',
        ':oid' => $data->order_id,
        ':uid1' => $user_id, // First usage mapped
        ':uid2' => $user_id  // Second usage mapped
    ]);

    // 3. Delete existing items
    $pdo->prepare("DELETE FROM order_items WHERE order_id = ?")->execute([$data->order_id]);

    // 4. Insert new items
    $sql_item = "INSERT INTO order_items (order_id, product_id, product_name, variant_id, variant_name, quantity, price_at_sale) VALUES (?, ?, ?, ?, ?, ?, ?)";
    $stmt_item = $pdo->prepare($sql_item);
    foreach ($data->items as $item) {
        $stmt_item->execute([$data->order_id, $item->product_id, $item->name, $item->variant_id ?? null, $item->variant_name ?? null, $item->qty, $item->price]);
    }

    $pdo->commit();
    echo json_encode(["success" => true, "message" => "Order updated successfully"]);
} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500); 
    echo json_encode(["error" => $e->getMessage()]);
}
?>