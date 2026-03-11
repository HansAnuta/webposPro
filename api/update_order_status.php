<?php
session_start();
header("Content-Type: application/json");
include_once 'db_connect.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401); 
    echo json_encode(["error" => "Unauthorized"]); 
    exit;
}

// Block Manager (store_admin) from processing transactions
if ($_SESSION['role'] === 'store_admin') {
    http_response_code(403);
    echo json_encode(["message" => "Managers are not allowed to process transactions."]);
    exit;
}

$data = json_decode(file_get_contents("php://input"));

if (!isset($data->order_id) || !isset($data->status)) {
    http_response_code(400); 
    echo json_encode(["error" => "Missing data"]); 
    exit;
}

try {
    $stmt = $pdo->prepare("UPDATE orders SET status = ? WHERE order_id = ?");
    $stmt->execute([$data->status, $data->order_id]);
    
    echo json_encode(["success" => true]);
} catch (Exception $e) {
    http_response_code(500); 
    echo json_encode(["error" => $e->getMessage()]);
}
?>