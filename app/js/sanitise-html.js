// HTML sanitiser for user-authored content (system notes).
//
// Replaces a regex-based filter that was bypassable. The old one stripped
// disallowed tags and rewrote `on\w+=` to neutralise handlers, but the pattern
// required the equals sign to touch the attribute name -- so
//
//     <img src=x onerror =alert(1)>
//
// passed through untouched and executed on render, with no click, in the
// session of every corp member who opened the system. `javascript:` in an href
// was not filtered at all.
//
// Regexes cannot sanitise HTML: the parser accepts whitespace, newlines and
// entity encodings the pattern does not anticipate. This parses the input with
// the browser's own parser -- in an inert document, so nothing loads or
// executes while inspecting it -- then keeps only allowlisted elements and
// attributes and rebuilds the markup.

var sanitiseHtml = (function() {
	// Formatting CKEditor produces, and nothing that can navigate or execute.
	var ALLOWED_TAGS = {
		b:1, i:1, em:1, strong:1, u:1, s:1, strike:1, sub:1, sup:1,
		font:1, span:1, p:1, br:1, hr:1, div:1, pre:1, blockquote:1,
		h1:1, h2:1, h3:1, h4:1, h5:1, h6:1,
		ul:1, ol:1, li:1,
		table:1, thead:1, tbody:1, tr:1, td:1, th:1,
		a:1, img:1
	};

	// Per-tag attribute allowlist. Anything not named here is dropped, which is
	// what makes an unanticipated handler (onerror, onpointerover, on-anything)
	// impossible rather than merely unmatched.
	var ALLOWED_ATTRS = {
		'*': {style: 1, title: 1, dir: 1},
		a:   {href: 1, target: 1, rel: 1},
		font:{color: 1, size: 1, face: 1},
		td:  {colspan: 1, rowspan: 1},
		th:  {colspan: 1, rowspan: 1},
		// img was in the previous allowlist, so it stays -- dropping it would
		// silently strip pictures out of notes people already wrote. Worth
		// knowing: an image from an arbitrary host reveals the viewer's IP to
		// that host every time the note is opened. If that matters to the corp,
		// remove img here and the concern goes with it.
		img: {src: 1, alt: 1, width: 1, height: 1}
	};

	// Schemes a link may use. Relative URLs are allowed and everything else --
	// javascript:, data:, vbscript: -- is not.
	var SAFE_URL = /^(?:https?:|mailto:|\/|#|\.{0,2}\/)/i;

	// style is kept because notes use colour, but anything that can fetch or
	// execute from within CSS is removed.
	var UNSAFE_CSS = /(?:expression|javascript:|vbscript:|url\s*\(|@import|behaviou?r\s*:|-moz-binding)/i;

	function cleanStyle(value) {
		return UNSAFE_CSS.test(value) ? null : value;
	}

	function cleanNode(node) {
		// Comments can hide conditional markup; drop them.
		if (node.nodeType === 8) { node.remove(); return; }
		if (node.nodeType !== 1) { return; }

		var tag = node.tagName.toLowerCase();

		if (!ALLOWED_TAGS[tag]) {
			// Keep the text, lose the element -- so stripping <script> does not
			// silently delete a paragraph someone wrote around it.
			var parent = node.parentNode;
			while (node.firstChild) { parent.insertBefore(node.firstChild, node); }
			parent.removeChild(node);
			return;
		}

		var permitted = ALLOWED_ATTRS[tag] || {};
		var global = ALLOWED_ATTRS['*'];

		// Copy first: removing while iterating skips entries.
		Array.prototype.slice.call(node.attributes).forEach(function(attr) {
			var name = attr.name.toLowerCase();
			var value = attr.value;

			if (!permitted[name] && !global[name]) { node.removeAttribute(attr.name); return; }

			if (name === 'href' || name === 'src') {
				if (!SAFE_URL.test(value.trim())) { node.removeAttribute(attr.name); return; }
			}
			if (name === 'style') {
				var safe = cleanStyle(value);
				if (safe === null) { node.removeAttribute(attr.name); return; }
			}
		});

		// A link that opens a new tab must not hand the opener over with it.
		if (tag === 'a' && node.getAttribute('target')) {
			node.setAttribute('rel', 'noopener noreferrer');
		}

		Array.prototype.slice.call(node.childNodes).forEach(cleanNode);
	}

	return function sanitiseHtml(html) {
		if (html == null) { return ''; }

		// An inert document: images do not load and scripts do not run while
		// the tree is being inspected.
		var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');

		Array.prototype.slice.call(doc.body.childNodes).forEach(cleanNode);
		return doc.body.innerHTML;
	};
})();
