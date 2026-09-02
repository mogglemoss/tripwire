<?php

require_once('config.php');
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
	<meta name="description" content="Tripwire is an open source wormhole mapping tool for EVE Online." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" />
	<link rel="stylesheet" type="text/css" href="//<?= CDN_DOMAIN ?>/css/landing/wds.css" />
	<link rel="shortcut icon" href="//<?= CDN_DOMAIN ?>/images/favicon.png" />
	<link rel="apple-touch-icon" href="images/apple-touch-icon.png" />
</head>
<body>
<div class="page">

	<div class="bar">
		<a class="brand" href="."><span class="wing" aria-hidden="true"></span><?= APP_NAME ?></a>
		<nav>
			<a href="https://bitbucket.org/daimian/tripwire/issues?status=new&status=open" target="_blank" rel="noopener">Issues</a>
			<a href="#privacy">Privacy</a>
			<a href="#ccp">CCP copyright</a>
		</nav>
	</div>

	<main class="hero">
		<section class="intro">
			<div class="wing-lg" aria-hidden="true"></div>
			<h1><small>the corp</small><?= APP_NAME ?></h1>
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
			<summary>Privacy policy</summary>
			<div class="body">
				<p>This Privacy Policy governs the manner in which Tripwire collects, uses, maintains and discloses information collected from users (each, a "User") of the <a href="http://tripwire.eve-apps.com">tripwire.eve-apps.com</a> website ("Site"). This privacy policy applies to the Site and all products and services offered by Eon Studios.</p>
				<p><b>Personal identification information.</b> We may collect personal identification information from Users in a variety of ways, including, but not limited to, when Users visit our site, register on the site, and in connection with other activities, services, features or resources we make available on our Site. Users may be asked for, as appropriate, name. We will collect personal identification information from Users only if they voluntarily submit such information to us. Users can always refuse to supply personally identification information, except that it may prevent them from engaging in certain Site related activities.</p>
				<p><b>Non-personal identification information.</b> We may collect non-personal identification information about Users whenever they interact with our Site. Non-personal identification information may include the browser name, the type of computer and technical information about Users means of connection to our Site, such as the operating system and the Internet service providers utilized and other similar information.</p>
				<p><b>Web browser cookies.</b> Our Site may use "cookies" to enhance User experience. User's web browser places cookies on their hard drive for record-keeping purposes and sometimes to track information about them. User may choose to set their web browser to refuse cookies, or to alert you when cookies are being sent. If they do so, note that some parts of the Site may not function properly.</p>
				<p><b>How we use collected information.</b> Tripwire may collect and use Users personal information for the following purposes:</p>
				<ul>
					<li><i>To improve customer service</i> — information you provide helps us respond to your customer service requests and support needs more efficiently.</li>
					<li><i>To personalize user experience</i> — we may use information in the aggregate to understand how our Users as a group use the services and resources provided on our Site.</li>
					<li><i>To improve our Site</i> — we may use feedback you provide to improve our products and services.</li>
					<li><i>To send periodic emails</i> — we may use the email address to respond to their inquiries, questions, and/or other requests.</li>
				</ul>
				<p><b>How we protect your information.</b> We adopt appropriate data collection, storage and processing practices and security measures to protect against unauthorized access, alteration, disclosure or destruction of your personal information, username, password, transaction information and data stored on our Site. Sensitive and private data exchange between the Site and its Users happens over a SSL secured communication channel and is encrypted and protected with digital signatures.</p>
				<p><b>Sharing your personal information.</b> We do not sell, trade, or rent Users personal identification information to others. We may share generic aggregated demographic information not linked to any personal identification information regarding visitors and users with our business partners, trusted affiliates and advertisers for the purposes outlined above.</p>
				<p><b>Third party websites.</b> Users may find advertising or other content on our Site that link to the sites and services of our partners, suppliers, advertisers, sponsors, licensors and other third parties. We do not control the content or links that appear on these sites and are not responsible for the practices employed by websites linked to or from our Site. In addition, these sites or services, including their content and links, may be constantly changing. These sites and services may have their own privacy policies and customer service policies. Browsing and interaction on any other website, including websites which have a link to our Site, is subject to that website's own terms and policies.</p>
				<p><b>Changes to this privacy policy.</b> Tripwire has the discretion to update this privacy policy at any time. When we do, we will revise the updated date at the bottom of this page. We encourage Users to frequently check this page for any changes to stay informed about how we are helping to protect the personal information we collect. You acknowledge and agree that it is your responsibility to review this privacy policy periodically and become aware of modifications.</p>
				<p><b>Your acceptance of these terms.</b> By using this Site, you signify your acceptance of this policy. If you do not agree to this policy, please do not use our Site. Your continued use of the Site following the posting of changes to this policy will be deemed your acceptance of those changes.</p>
				<p><b>Contacting us.</b> If you have any questions about this Privacy Policy, the practices of this site, or your dealings with this site, please contact us at <a href="mailto:daimian.mercer@gmail.com">daimian.mercer@gmail.com</a>. This document was last updated on January 27, 2017.</p>
			</div>
		</details>
		<details id="ccp">
			<summary>CCP copyright notice</summary>
			<div class="body">
				<p>All EVE related materials are property of CCP Games. EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. All other trademarks are the property of their respective owners. EVE Online, the EVE logo, EVE and all associated logos and designs are the intellectual property of CCP hf. All artwork, screenshots, characters, vehicles, storylines, world facts or other recognizable features of the intellectual property relating to these trademarks are likewise the intellectual property of CCP hf. CCP is in no way responsible for the content on or functioning of this website, nor can it be liable for any damage arising from the use of this website.</p>
			</div>
		</details>
	</section>

	<footer class="foot">
		<span>Tripwire is open source. CCP Partner Programme community app.</span>
		<?php include 'donation_panel.inc'; ?>
	</footer>

</div>

<?php
	$analytics_file = dirname( __FILE__ ) . "/analytics.inc.php";
	if ( file_exists( $analytics_file ) ) include_once( $analytics_file );
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
