<?php
// Version
define('VERSION_TAG', '1.30.1');

$gitDirectory = __DIR__ . '/.git';
$headFile = $gitDirectory . '/HEAD';
$gitHash = is_readable($headFile) ? trim((string) file_get_contents($headFile)) : '';

if (strpos($gitHash, 'ref: ') === 0) {
	$refFile = $gitDirectory . '/' . substr($gitHash, 5);
	$gitHash = is_readable($refFile) ? trim((string) file_get_contents($refFile)) : '';
}

// Deployed by copy, with no .git, the tag is the cache key -- 'unknown' would
// never change and cache-busting would stop.
define('VERSION', preg_match('/^[0-9a-f]{40}$/i', $gitHash) ? substr($gitHash, 0, 7) : VERSION_TAG);
