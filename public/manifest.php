<?php
// The web app manifest, from the active brand pack.
require_once('../config.php');
require_once('../brand.inc.php');

$b = brand();
$icons = array();
foreach (array('192' => '192x192', '512' => '512x512') as $key => $size) {
	if (!empty($b['icons'][$key])) { $icons[] = array('src' => brand_url($b['icons'][$key]), 'sizes' => $size, 'type' => 'image/png'); }
}
if (!empty($b['icons']['maskable'])) { $icons[] = array('src' => brand_url($b['icons']['maskable']), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'); }

$manifest = array(
	'name'             => $b['product'] . (!empty($b['corp']) ? ' · ' . $b['corp'] : ''),
	'short_name'       => $b['product'],
	'description'      => $b['description'] ?? '',
	'start_url'        => '/',
	'scope'            => '/',
	'display'          => 'standalone',
	'orientation'      => 'any',
	'background_color' => $b['palette']['dark']['background'] ?? '#1b1b1b',
	'theme_color'      => $b['palette']['dark']['background'] ?? '#1b1b1b',
	'icons'            => $icons,
);

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
