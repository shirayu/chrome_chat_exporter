const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

global.Node = {
	TEXT_NODE: 3,
	ELEMENT_NODE: 1,
};

const VOID_TAGS = new Set(["br", "hr", "img", "meta", "input", "link"]);

class TextNode {
	constructor(value) {
		this.nodeType = global.Node.TEXT_NODE;
		this.nodeValue = value;
		this.parentNode = null;
	}

	cloneNode() {
		return new TextNode(this.nodeValue);
	}

	get textContent() {
		return this.nodeValue;
	}

	get innerText() {
		return this.nodeValue;
	}

	get outerHTML() {
		return escapeHtml(this.nodeValue);
	}
}

class ElementNode {
	constructor(tagName, attrs = {}) {
		this.nodeType = global.Node.ELEMENT_NODE;
		this.tagName = tagName.toUpperCase();
		this.attributes = attrs;
		this.childNodes = [];
		this.parentNode = null;
	}

	get children() {
		return this.childNodes.filter(
			(child) => child.nodeType === global.Node.ELEMENT_NODE,
		);
	}

	get classList() {
		return {
			contains: (className) => hasClass(this, className),
		};
	}

	getAttribute(name) {
		return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	appendChild(node) {
		node.parentNode = this;
		this.childNodes.push(node);
	}

	removeChild(node) {
		const index = this.childNodes.indexOf(node);
		if (index === -1) return;
		this.childNodes.splice(index, 1);
		node.parentNode = null;
	}

	remove() {
		if (!this.parentNode) return;
		this.parentNode.removeChild(this);
	}

	cloneNode(deep = false) {
		const clone = new ElementNode(this.tagName, { ...this.attributes });
		if (!deep) return clone;
		this.childNodes.forEach((child) => {
			clone.appendChild(child.cloneNode(true));
		});
		return clone;
	}

	contains(node) {
		let current = node;
		while (current) {
			if (current === this) return true;
			current = current.parentNode;
		}
		return false;
	}

	querySelectorAll(selector) {
		const matcher = createSelectorMatcher(selector);
		const matches = [];
		walk(this, (node) => {
			if (node.nodeType === global.Node.ELEMENT_NODE && matcher(node)) {
				matches.push(node);
			}
		});
		return matches;
	}

	querySelector(selector) {
		const matcher = createSelectorMatcher(selector);
		let found = null;
		walk(this, (node) => {
			if (found) return;
			if (node.nodeType === global.Node.ELEMENT_NODE && matcher(node)) {
				found = node;
			}
		});
		return found;
	}

	get textContent() {
		return this.childNodes.map((child) => child.textContent || "").join("");
	}

	get innerText() {
		return this.childNodes.map((child) => child.innerText || "").join("");
	}

	get innerHTML() {
		return this.childNodes.map((child) => child.outerHTML || "").join("");
	}

	get outerHTML() {
		const attrs = Object.entries(this.attributes)
			.map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
			.join("");
		return `<${this.tagName.toLowerCase()}${attrs}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
	}
}

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function hasClass(node, className) {
	const classValue = node.getAttribute("class");
	if (!classValue) return false;
	return classValue.split(/\s+/).includes(className);
}

function parseSelector(selector) {
	return selector
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => {
			if (part.startsWith(".")) {
				return { className: part.slice(1) };
			}
			const attrMatch = part.match(
				/^\[([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/,
			);
			if (attrMatch) {
				return {
					attrName: attrMatch[1],
					attrValue: attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? null,
				};
			}
			throw new Error(`Unsupported selector: ${selector}`);
		});
}

function matchesSimple(node, token) {
	if (token.className && !hasClass(node, token.className)) return false;
	if (token.attrName) {
		const value = node.getAttribute(token.attrName);
		if (value === null) return false;
		if (token.attrValue !== null && value !== token.attrValue) return false;
	}
	return true;
}

function createSelectorMatcher(selector) {
	const tokenGroups = selector
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => parseSelector(item));
	return (node) => {
		return tokenGroups.some((tokens) => {
			if (!matchesSimple(node, tokens[tokens.length - 1])) return false;
			let current = node.parentNode;
			for (let i = tokens.length - 2; i >= 0; i -= 1) {
				let found = false;
				while (current) {
					if (
						current.nodeType === global.Node.ELEMENT_NODE &&
						matchesSimple(current, tokens[i])
					) {
						found = true;
						current = current.parentNode;
						break;
					}
					current = current.parentNode;
				}
				if (!found) return false;
			}
			return true;
		});
	};
}

function walk(node, fn) {
	fn(node);
	if (node.nodeType !== global.Node.ELEMENT_NODE) return;
	node.childNodes.forEach((child) => {
		walk(child, fn);
	});
}

function parseAttributes(input) {
	const attrs = {};
	const attrRe = /(\w[\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	let match;
	for (match = attrRe.exec(input); match; match = attrRe.exec(input)) {
		const name = match[1];
		const value = match[2] ?? match[3] ?? match[4] ?? "";
		attrs[name] = value;
	}
	return attrs;
}

function parseHtml(html) {
	const root = new ElementNode("root");
	const stack = [root];
	const tagRe = /<!--[\s\S]*?-->|<\/?[^>]+>/g;
	let lastIndex = 0;
	let match;

	for (match = tagRe.exec(html); match; match = tagRe.exec(html)) {
		const token = match[0];
		const text = html.slice(lastIndex, match.index);
		if (text && /\S/.test(text)) {
			stack[stack.length - 1].appendChild(new TextNode(text));
		}
		lastIndex = match.index + token.length;

		if (token.startsWith("<!--")) continue;
		if (token.startsWith("</")) {
			const tagName = token.slice(2, -1).trim().toLowerCase();
			while (stack.length > 1) {
				const node = stack.pop();
				if (node.tagName.toLowerCase() === tagName) break;
			}
			continue;
		}

		const selfClosing = token.endsWith("/>");
		const tagContent = token.slice(1, selfClosing ? -2 : -1).trim();
		const [tagName, ...rest] = tagContent.split(/\s+/);
		const attrs = parseAttributes(rest.join(" "));
		const element = new ElementNode(tagName, attrs);
		stack[stack.length - 1].appendChild(element);
		if (!selfClosing && !VOID_TAGS.has(tagName.toLowerCase())) {
			stack.push(element);
		}
	}

	const tail = html.slice(lastIndex);
	if (tail && /\S/.test(tail)) {
		stack[stack.length - 1].appendChild(new TextNode(tail));
	}

	return root;
}

test("user prompt hidden label is excluded from markdown export", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-user-hidden-label.html"),
		"utf8",
	);
	const root = parseHtml(html);

	global.document = {
		querySelectorAll(selector) {
			return root.querySelectorAll(selector);
		},
	};

	global.window = {
		__geminiChatExporterInjected: false,
	};

	let messageListener = null;
	global.chrome = {
		runtime: {
			onMessage: {
				addListener(listener) {
					messageListener = listener;
				},
			},
		},
	};

	delete require.cache[require.resolve("../content.js")];
	require("../content.js");

	assert.ok(messageListener, "message listener should be registered");

	let response = null;
	messageListener(
		{ type: "EXPORT_GEMINI_CHAT", scope: "current" },
		null,
		(payload) => {
			response = payload;
		},
	);

	assert.ok(response?.ok, "export should succeed");
	assert.equal(response.data.turns.length, 1);
	assert.equal(response.data.turns[0].user, "SynthIDはどうやって作れる？");
	assert.ok(
		!response.data.markdown.includes("あなたのプロンプト"),
		"markdown should not include hidden user prompt label",
	);
	assert.ok(response.data.markdown.includes("SynthIDはどうやって作れる？"));
});

test("markdown style option switches heading format", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-user-hidden-label.html"),
		"utf8",
	);
	const root = parseHtml(html);

	global.document = {
		querySelectorAll(selector) {
			return root.querySelectorAll(selector);
		},
	};

	global.window = {
		__geminiChatExporterInjected: false,
	};

	let messageListener = null;
	global.chrome = {
		runtime: {
			onMessage: {
				addListener(listener) {
					messageListener = listener;
				},
			},
		},
	};

	delete require.cache[require.resolve("../content.js")];
	require("../content.js");

	assert.ok(messageListener, "message listener should be registered");

	let defaultStyleResponse = null;
	messageListener(
		{ type: "EXPORT_GEMINI_CHAT", scope: "current" },
		null,
		(payload) => {
			defaultStyleResponse = payload;
		},
	);
	assert.ok(defaultStyleResponse?.ok, "default export should succeed");
	assert.ok(defaultStyleResponse.data.markdown.includes("## Turn 1-1: User"));
	assert.ok(defaultStyleResponse.data.markdown.includes("## Turn 1-2: Gemini"));

	let legacyStyleResponse = null;
	messageListener(
		{ type: "EXPORT_GEMINI_CHAT", scope: "current", markdownStyle: "legacy" },
		null,
		(payload) => {
			legacyStyleResponse = payload;
		},
	);
	assert.ok(legacyStyleResponse?.ok, "legacy export should succeed");
	assert.ok(legacyStyleResponse.data.markdown.includes("## Turn 1-1: User"));
	assert.ok(legacyStyleResponse.data.markdown.includes("## Turn 1-2: Gemini"));

	let geminiStyleResponse = null;
	messageListener(
		{ type: "EXPORT_GEMINI_CHAT", scope: "current", markdownStyle: "gemini" },
		null,
		(payload) => {
			geminiStyleResponse = payload;
		},
	);
	assert.ok(geminiStyleResponse?.ok, "gemini style export should succeed");
	assert.ok(geminiStyleResponse.data.markdown.includes("## Turn 1"));
	assert.ok(geminiStyleResponse.data.markdown.includes("### User"));
	assert.ok(geminiStyleResponse.data.markdown.includes("### Gemini"));
});
