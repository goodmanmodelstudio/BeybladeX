<?php
$data = file_get_contents('php://input');
file_put_contents('path/to/your/group_data.json', $data);
echo json_encode(['status' => 'success']);
?>