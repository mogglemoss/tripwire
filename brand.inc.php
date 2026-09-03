<?php
/**
 * Brand packs.
 *
 * Everything a corp changes about Tripwire's look lives in one directory:
 *
 *   public/brands/<slug>/brand.json   names, tagline, palette, fonts, links
 *   public/brands/<slug>/...          logo (dark and light), mark, icons
 *
 * config.php picks the pack with define('BRAND', '<slug>'); the default is
 * the neutral "tripwire" pack. Nothing else in the app knows a corp's name.
 *
 * The palette is emitted as the same CSS custom properties the stylesheets
 * already read (--background, --card, --primary ...), in a <style> placed
 * after the app stylesheet, so a brand overrides token values and never
 * restyles a component. Data colours (--data-*) are deliberately not
 * brandable: wormhole class, security and mass colours encode meaning.
 */

if (!defined('BRAND')) { define('BRAND', 'tripwire'); }

function brand_dir() {
	return __DIR__ . '/public/brands/' . BRAND;
}

function brand() {
	static $brand = null;
	if ($brand !== null) { return $brand; }

	$defaults = json_decode(file_get_contents(__DIR__ . '/public/brands/tripwire/brand.json'), true);
	$brand = $defaults;
	$file = brand_dir() . '/brand.json';
	if (BRAND !== 'tripwire' && is_readable($file)) {
		$own = json_decode(file_get_contents($file), true);
		if (is_array($own)) { $brand = brand_merge($defaults, $own); }
	}
	$brand['slug'] = BRAND;
	$brand['product'] = defined('APP_NAME') ? APP_NAME : 'Tripwire';
	return $brand;
}

function brand_merge($base, $over) {
	foreach ($over as $k => $v) {
		$base[$k] = (is_array($v) && isset($base[$k]) && is_array($base[$k])) ? brand_merge($base[$k], $v) : $v;
	}
	return $base;
}

/** URL of a file inside the active pack (served by the CDN/static host). */
function brand_url($file) {
	return '//' . CDN_DOMAIN . '/brands/' . BRAND . '/' . ltrim($file, '/');
}

function brand_h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/** One CSS block of custom properties from a palette map. */
function brand_css_vars($vars, $indent = "\t") {
	$out = '';
	foreach ($vars as $name => $value) {
		if ($value === null || $value === '') { continue; }
		$out .= $indent . '--' . preg_replace('/[^a-z0-9-]/', '', strtolower($name)) . ': ' . $value . ";\n";
	}
	return $out;
}

/**
 * The palette as tokens, in the three-state shape the stylesheets use: bare
 * :root is dark, the light values apply under the OS preference unless the
 * page is pinned dark, and again when it is pinned light.
 */
function brand_tokens_css() {
	$b = brand();
	$dark  = $b['palette']['dark']  ?? array();
	$light = $b['palette']['light'] ?? array();
	$dark  = array_merge($dark,  array('primary' => $b['accent']['dark']  ?? null, 'ring' => $b['accent']['dark']  ?? null, 'primary-foreground' => $b['accent']['on-dark']  ?? null));
	$light = array_merge($light, array('primary' => $b['accent']['light'] ?? null, 'ring' => $b['accent']['light'] ?? null, 'primary-foreground' => $b['accent']['on-light'] ?? null));
	$fonts = array(
		'font-ui'      => $b['fonts']['ui']      ?? null,
		'font-mono'    => $b['fonts']['mono']    ?? null,
		'font-display' => $b['fonts']['display'] ?? null,
	);
	$fonts['brand-logo-height'] = !empty($b['logo']['height']) ? intval($b['logo']['height']) . 'px' : null;
	$css  = ":root {\n" . brand_css_vars($dark) . brand_css_vars($fonts) . "}\n";
	$css .= "@media (prefers-color-scheme: light) {\n\t:root:not([data-theme=\"dark\"]) {\n" . brand_css_vars($light, "\t\t") . "\t}\n}\n";
	$css .= ":root[data-theme=\"light\"] {\n" . brand_css_vars($light) . "}\n";
	return $css;
}

/** The landing page's stylesheet reads a smaller vocabulary. */
function brand_landing_tokens_css() {
	$b = brand();
	$d = $b['palette']['dark'] ?? array();
	$vars = array(
		'bg'            => $d['background'] ?? null,
		'card'          => $d['card'] ?? null,
		'fg'            => $d['foreground'] ?? null,
		'muted'         => $d['muted-foreground'] ?? null,
		'border'        => $d['border'] ?? null,
		'border-strong' => $d['border-strong'] ?? null,
		'orange'        => $b['accent']['dark'] ?? null,
		'orange-ink'    => $b['accent']['on-dark'] ?? null,
		'critical'      => $d['destructive'] ?? null,
		'landing-bg'    => !empty($b['landing_bg']) ? 'url(' . brand_url($b['landing_bg']) . ')' : 'none',
	);
	return ":root {\n" . brand_css_vars($vars) . "}\n";
}

/**
 * Head tags shared by the app and the landing page: fonts, manifest, theme
 * colour, iOS install tags, and the token block. Call it AFTER the page's
 * main stylesheet link so the tokens win.
 */
function brand_head($landing = false) {
	$b = brand();
	$theme = $b['palette']['dark']['background'] ?? '#1b1b1b';
	if (!empty($b['fonts']['google'])) {
		echo "\t<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n";
		echo "\t<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n";
		echo "\t<link rel=\"stylesheet\" href=\"" . brand_h($b['fonts']['google']) . "\">\n";
	}
	echo "\t<link rel=\"manifest\" href=\"/manifest.php\">\n";
	echo "\t<meta name=\"theme-color\" content=\"" . brand_h($theme) . "\">\n";
	echo "\t<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n";
	echo "\t<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">\n";
	echo "\t<meta name=\"apple-mobile-web-app-title\" content=\"" . brand_h($b['product']) . "\">\n";
	if (!empty($b['icons']['apple'])) { echo "\t<link rel=\"apple-touch-icon\" href=\"" . brand_h(brand_url($b['icons']['apple'])) . "\">\n"; }
	if (!empty($b['icons']['favicon'])) { echo "\t<link rel=\"icon\" href=\"" . brand_h(brand_url($b['icons']['favicon'])) . "\">\n"; }
	echo "\t<style id=\"brand-tokens\">\n" . ($landing ? brand_landing_tokens_css() : brand_tokens_css()) . "\t</style>\n";
}

/** The letterhead: the corp's logo for each room, or the product name. */
function brand_logo_html() {
	$b = brand();
	$alt = brand_h($b['corp'] ?? $b['product']);
	if (empty($b['logo']['dark'])) {
		return '<span class="logo-text">' . brand_h($b['product']) . '</span>';
	}
	$light = !empty($b['logo']['light']) ? $b['logo']['light'] : $b['logo']['dark'];
	return '<img class="logo-dark"  src="' . brand_h(brand_url($b['logo']['dark'])) . '" alt="' . $alt . '" />'
	     . '<img class="logo-light" src="' . brand_h(brand_url($light)) . '" alt="" />';
}
