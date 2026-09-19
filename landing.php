<?php

require_once('config.php');
require_once('brand.inc.php');
require_once('settings.php');

// The landing page is the first thing every member sees, every session. It
// used to be the 2013 marketing site -- partner badge, glossy register
// buttons, a login form behind a tab, and a donate panel the form overlapped.
// This is one screen with one primary action. The forms and handlers behind
// it are unchanged: the Tripwire-account login still POSTs to login.php and
// reads its JSON, SSO still goes through login.php?mode=sso, registration
// still goes through register.php.

$loggedIn = isset($_SESSION['userID']);
$systemQS = isset($_GET['system']) ? '&system=' . rawurlencode($_GET['system']) : '';
$systemQSHtml = htmlspecialchars($systemQS, ENT_QUOTES, 'UTF-8');
$error = isset($_REQUEST['error']) ? $_REQUEST['error'] : null;
$success = isset($_REQUEST['success']) ? $_REQUEST['success'] : null;

$messages = array(
	'login-account'        => 'No Tripwire account exists for that character yet. Register first, then sign in.',
	'login-unknown'        => 'EVE sign-in did not complete. Try again.',
	'register-account'     => 'A Tripwire account already exists for that character. Sign in instead.',
	'register-unknown'     => 'EVE sign-in did not complete. Try again.',
	'registeradmin-account'=> 'No Tripwire account for that character yet. Register as a user first.',
	'registeradmin-roles'  => 'That character is not a CEO, Director or Tripwire Admin.',
	'registeradmin-unknown'=> 'EVE sign-in did not complete. Try again.',
);
$message = $error && isset($messages[$error]) ? $messages[$error] : null;
$startOnRegister = $success || ($error && strpos($error, 'register') === 0);

?>
<!DOCTYPE html>
<html lang="en">
<head>
	<title><?= APP_NAME ?></title>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="description" content="<?= brand_h(brand()['description']) ?>" />
	<link rel="stylesheet" type="text/css" href="//<?= CDN_DOMAIN ?>/css/landing/landing.css?v=<?= VERSION ?>" />
<?php brand_head(true); ?>
</head>
<body>
<div class="page">

	<div class="bar">
		<a class="brand" href="."><?php if (brand_landing_mark()): ?><img class="brand-small" src="<?= brand_h(brand_url(brand_landing_mark())) ?>" alt="<?= brand_h(brand()['corp']) ?>" /><?php else: ?><span class="brand-text"><?= APP_NAME ?></span><?php endif; ?></a>
		<nav>
			<a href="https://github.com/mogglemoss/tripwire/issues" target="_blank" rel="noopener">Issues</a>
			<a href="#privacy">Privacy</a>
			<a href="#ccp">Fenris copyright</a>
		</nav>
	</div>

	<main class="hero">
		<section class="intro">
			<?php if (brand_landing_mark()): ?><img class="brand-mark" src="<?= brand_h(brand_url(brand_landing_mark())) ?>" alt="<?= brand_h(brand()['corp']) ?>" /><?php endif; ?>
			<h1><small><?= brand_h(brand()['tagline']) ?></small><?= APP_NAME ?></h1>
			<p>Wormhole mapping for the corp: signatures, chains, and who is where. Sign in with your EVE character and the map is where you left it.</p>
			<p class="version"><?= APP_NAME ?> <?= VERSION ?></p>
		</section>

<?php if ($loggedIn): ?>
		<section class="card" id="card-me">
			<h2>You are signed in</h2>
			<div class="me">
				<img src="https://images.evetech.net/characters/<?= htmlspecialchars($_SESSION['characterID'], ENT_QUOTES, 'UTF-8') ?>/portrait?size=128" alt="" />
				<div>
					<div class="name"><?= htmlspecialchars($_SESSION['characterName'], ENT_QUOTES, 'UTF-8') ?></div>
					<div class="corp"><?= isset($_SESSION['corporationName']) ? htmlspecialchars($_SESSION['corporationName'], ENT_QUOTES, 'UTF-8') : '' ?></div>
				</div>
			</div>
			<a class="btn primary" href="?system=<?= isset($_GET['system']) ? htmlspecialchars(rawurlencode($_GET['system']), ENT_QUOTES, 'UTF-8') : '' ?>">Open Tripwire</a>
			<a class="btn" href="logout.php">Sign out</a>
		</section>
<?php else: ?>
		<section class="card" id="card-login" <?= $startOnRegister ? 'hidden' : '' ?>>
			<h2>Sign in</h2>
			<p class="sub">Use the character you fly.</p>
<?php if ($message && strpos($error, 'login') === 0): ?>
			<p class="error"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
<?php endif; ?>
			<a class="btn primary" href="login.php?mode=sso&login=sso<?= $systemQSHtml ?>"><span class="eve">EVE</span> Sign in with EVE Online</a>

			<div class="divider">or</div>

			<details class="alt">
				<summary>Use a Tripwire username instead</summary>
				<form id="login-form" method="POST" action="login.php" autocomplete="off">
					<input type="hidden" name="mode" value="login" />
					<input class="hidden" type="text" name="fakeusernameremembered" tabindex="-1" aria-hidden="true" />
					<input class="hidden" type="password" name="fakepasswordremembered" tabindex="-1" aria-hidden="true" autocomplete="off" />
					<div class="field">
						<label for="login_username">Username</label>
						<input type="text" name="username" id="login_username" autocomplete="username" autocapitalize="off" />
						<span class="hint" id="userError" hidden></span>
					</div>
					<div class="field">
						<label for="login_password">Password</label>
						<input type="password" name="password" id="login_password" autocomplete="current-password" />
						<span class="hint" id="passError" hidden></span>
					</div>
					<label class="check"><input type="checkbox" id="remember" name="remember" /> Remember me</label>
					<button type="submit" class="btn" id="login-submit">Sign in</button>
				</form>
			</details>

			<p class="swap">No account yet? <a href="#register" data-show="card-register">Register</a></p>
		</section>

		<section class="card" id="card-register" <?= $startOnRegister ? '' : 'hidden' ?>>
<?php if ($success === 'user'): ?>
			<h2>Account created</h2>
			<p class="sub">Your username and password can be set in Settings once you are in.</p>
			<a class="btn primary" href="login.php?mode=sso&login=sso<?= $systemQSHtml ?>"><span class="eve">EVE</span> Sign in with EVE Online</a>
<?php elseif ($success === 'admin'): ?>
			<h2>Admin enabled</h2>
			<p class="sub">Your character can now administer the corp's Tripwire.</p>
			<a class="btn primary" href="login.php?mode=sso&login=sso<?= $systemQSHtml ?>"><span class="eve">EVE</span> Sign in with EVE Online</a>
<?php else: ?>
			<h2>Register</h2>
			<p class="sub">One click with your EVE character. No form.</p>
<?php if ($message && strpos($error, 'register') === 0): ?>
			<p class="error"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
<?php endif; ?>
			<a class="btn primary" href="register.php?mode=user"><span class="eve">EVE</span> Register with EVE Online</a>
			<a class="btn" href="register.php?mode=admin">Enable admin for my character</a>
			<p class="note">Admin needs an existing account and one of these roles: <b>CEO</b>, <b>Director</b> or <b>Tripwire Admin</b>.</p>
			<p class="swap">Already registered? <a href="#login" data-show="card-login">Sign in</a></p>
<?php endif; ?>
		</section>
<?php endif; ?>
	</main>

	<section class="legal">
		<details id="privacy">
			<summary>What this installation stores</summary>
			<div class="body">
				<p>This is a self-hosted copy of Tripwire<?= brand()['corp'] ? ', run by ' . brand_h(brand()['corp']) : '' ?>. There is no central service: what you enter stays on this server, and the people who run it are the only ones who can read it.</p>
				<p><b>Signing in.</b> EVE SSO gives this server your character's id and name, and nothing else about your EVE account. For characters you link for tracking it also holds a token it uses to ask EVE where that character is; you can revoke any token from your EVE account's third-party applications page, and unlink a character in Settings.</p>
				<p><b>Tracking.</b> While a linked character is tracked, its current system, ship and online state are recorded so the map can follow it and mark jumps. Tracking is off until you turn it on, per character.</p>
				<p><b>The map.</b> Signatures, connections, notes and flares you add are shared with everyone on the same mask and kept until they expire or someone deletes them. A history of signature changes feeds the statistics panel.</p>
				<p><b>Your account.</b> Display preferences are stored with your account, and a record of each sign-in (time and address) is kept.</p>
				<p><b>Third parties.</b> No email address is collected. <?= (defined('ENABLE_ANALYTICS') && ENABLE_ANALYTICS) ? 'This installation sends anonymous usage data to Google Analytics.' : 'This installation sends no usage data to any analytics service.' ?> Map data comes from EVE's public ESI API; links to zKillboard, Dotlan and Anoikis leave this site.</p>
				<p><b>Questions.</b> Ask <?= (defined('OPERATOR_CONTACT') && OPERATOR_CONTACT) ? brand_h(OPERATOR_CONTACT) : 'the people who run this server' ?>.</p>
			</div>
		</details>
		<details id="ccp">
			<summary>Fenris Creations copyright notice</summary>
			<div class="body">
				<p>All EVE related materials are the property of Fenris Creations, formerly CCP Games. EVE Online&reg; and Fenris Creations&trade; and all related logos and other elements are trademarks of Fenris Creations. &copy; 2026 Fenris Creations. All rights reserved. All other trademarks are the property of their respective owners. All artwork, screenshots, characters, vehicles, storylines, world facts or other recognizable features of the intellectual property relating to these trademarks are likewise the intellectual property of Fenris Creations. Fenris Creations is in no way responsible for the content on or functioning of this website, nor can it be liable for any damage arising from the use of this website.</p>
			</div>
		</details>
	</section>

	<footer class="foot">
		<span>Tripwire is open source. EVE Online Partner Programme community app.</span>
		<?php if (defined('ENABLE_DONATIONS') && ENABLE_DONATIONS) include 'donation_panel.inc'; ?>
	</footer>

</div>

<?php
	$analytics_enabled = defined('ENABLE_ANALYTICS') && ENABLE_ANALYTICS;
	$analytics_file = dirname( __FILE__ ) . "/analytics.inc.php";
	if ( $analytics_enabled && file_exists( $analytics_file ) ) include_once( $analytics_file );
?>

<script>
(function() {
	// Card switching by hash, so #register and #login keep working as links.
	function show(id) {
		var login = document.getElementById('card-login'), reg = document.getElementById('card-register');
		if (!login || !reg) { return; }
		login.hidden = id !== 'card-login';
		reg.hidden = id !== 'card-register';
	}
	document.querySelectorAll('[data-show]').forEach(function(a) {
		a.addEventListener('click', function(e) { e.preventDefault(); show(a.getAttribute('data-show')); history.replaceState(null, '', a.getAttribute('href')); });
	});
	if (location.hash.indexOf('#register') === 0) { show('card-register'); }
	else if (location.hash.indexOf('#login') === 0) { show('card-login'); }

	// Tripwire-account login: same POST, same JSON, no jQuery.
	var form = document.getElementById('login-form');
	if (!form) { return; }
	var params = new URLSearchParams(location.search);
	var system = params.get('system') || '';
	function setError(id, text) {
		var el = document.getElementById(id);
		if (!el) { return; }
		el.textContent = text || '';
		el.hidden = !text;
		el.style.color = text ? '#f28b8f' : '';
	}
	form.addEventListener('submit', function(e) {
		e.preventDefault();
		setError('userError'); setError('passError');
		var btn = document.getElementById('login-submit');
		btn.disabled = true; btn.textContent = 'Signing in…';
		fetch('login.php', { method: 'POST', body: new URLSearchParams(new FormData(form)), credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
			.then(function(r) { return r.json(); })
			.then(function(res) {
				if (res && res.result === 'success') {
					location.href = '?system=' + encodeURIComponent(system);
					return;
				}
				if (res && res.error) {
					setError(res.field === 'password' ? 'passError' : 'userError', res.error);
					(res.field === 'password' ? document.getElementById('login_password') : document.getElementById('login_username')).focus();
				} else {
					setError('userError', 'Sign-in failed. Try again.');
				}
			})
			.catch(function() { setError('userError', 'Could not reach the server.'); })
			.then(function() { btn.disabled = false; btn.textContent = 'Sign in'; });
	});
})();
</script>
</body>
</html>
