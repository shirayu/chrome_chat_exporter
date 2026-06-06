const assert = require("node:assert/strict");
const test = require("node:test");
const { htmlToMarkdown } = require("../markdown.js");

global.Node = {
	TEXT_NODE: 3,
	ELEMENT_NODE: 1,
};

const TEXT = global.Node.TEXT_NODE;
const ELEMENT = global.Node.ELEMENT_NODE;

function text(value) {
	return {
		nodeType: TEXT,
		nodeValue: value,
		cloneNode() {
			return text(value);
		},
	};
}

function element(tag, attrs = {}, children = []) {
	const node = {
		nodeType: ELEMENT,
		tagName: tag.toUpperCase(),
		childNodes: children,
		children: children.filter((child) => child.nodeType === ELEMENT),
		getAttribute: (name) => (name in attrs ? attrs[name] : null),
		appendChild(child) {
			child.parentNode = node;
			node.childNodes.push(child);
			node.children = node.childNodes.filter(
				(item) => item.nodeType === ELEMENT,
			);
		},
		cloneNode(deep = false) {
			const clone = element(tag, { ...attrs }, []);
			if (!deep) return clone;
			node.childNodes.forEach((child) => {
				clone.appendChild(child.cloneNode(true));
			});
			return clone;
		},
	};
	Object.defineProperty(node, "textContent", {
		get() {
			return children
				.map((child) =>
					child.nodeType === TEXT ? child.nodeValue : child.textContent || "",
				)
				.join("");
		},
	});
	return node;
}

global.document = {
	createElement(tagName) {
		return element(tagName, {}, []);
	},
};

test("bold in paragraph", () => {
	const tree = element("div", {}, [
		element("p", {}, [text("hello "), element("b", {}, [text("world")])]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "hello **world**");
});

test("unordered list with bold label", () => {
	const tree = element("div", {}, [
		element("ul", {}, [
			element("li", {}, [element("b", {}, [text("Label")]), text(" text")]),
			element("li", {}, [text("second")]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "- **Label** text\n- second");
});

test("list item with line breaks", () => {
	const tree = element("div", {}, [
		element("ul", {}, [
			element("li", {}, [text("line1"), element("br"), text("line2")]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "- line1\n  line2");
});

test("blockquote and heading", () => {
	const tree = element("div", {}, [
		element("blockquote", {}, [
			text("note"),
			element("br"),
			text("second line"),
		]),
		element("h2", {}, [text("Title")]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "> note\n> second line\n\n## Title");
});

test("heading with emoji and hr between paragraphs", () => {
	const tree = element("div", {}, [
		element("p", {}, [text("intro")]),
		element("hr"),
		element("h2", {}, [text("🍅 トマト（Tomato）とは？")]),
		element("p", {}, [text("説明")]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "intro\n\n---\n\n## 🍅 トマト（Tomato）とは？\n\n説明");
});

test("blockquote with bold label", () => {
	const tree = element("div", {}, [
		element("blockquote", {}, [
			element("p", {}, [
				element("b", {}, [text("豆知識：")]),
				text(" 内容です。"),
			]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "> **豆知識：** 内容です。");
});

test("table with bold cells", () => {
	const table = element("table", {}, [
		element("thead", {}, [
			element("tr", {}, [
				element("td", {}, [text("栄養素")]),
				element("td", {}, [text("主な効果・効能")]),
			]),
		]),
		element("tbody", {}, [
			element("tr", {}, [
				element("td", {}, [element("b", {}, [text("リコピン")])]),
				element("td", {}, [text("強力な抗酸化作用。")]),
			]),
			element("tr", {}, [
				element("td", {}, [element("b", {}, [text("ビタミンC")])]),
				element("td", {}, [text("免疫力アップ。")]),
			]),
		]),
	]);
	const tree = element("div", {}, [table]);
	const md = htmlToMarkdown(tree);
	assert.equal(
		md,
		[
			"| 栄養素 | 主な効果・効能 |",
			"| --- | --- |",
			"| **リコピン** | 強力な抗酸化作用。 |",
			"| **ビタミンC** | 免疫力アップ。 |",
		].join("\n"),
	);
});

test("ordered list with bold lead and text", () => {
	const tree = element("div", {}, [
		element("ol", {}, [
			element("li", {}, [
				element("p", {}, [
					element("b", {}, [text("加熱して食べる")]),
					text(" リコピンは吸収率がアップ。"),
				]),
			]),
			element("li", {}, [
				element("p", {}, [
					element("b", {}, [text("油と一緒に摂る")]),
					text(" 脂溶性なので効率的。"),
				]),
			]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(
		md,
		[
			"1. **加熱して食べる** リコピンは吸収率がアップ。",
			"2. **油と一緒に摂る** 脂溶性なので効率的。",
		].join("\n"),
	);
});

test("raw math block is preserved", () => {
	const tree = element("div", {}, [
		element("span", { "data-md-raw": "$$\\nE=mc^2\\n$$" }, [text("ignored")]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "$$\\nE=mc^2\\n$$");
});

test("p containing block-level div renders each block separately", () => {
	// <p> が div などブロック要素を子に持つ場合（無効なHTMLだがブラウザは許容する）
	// 各ブロックが独立した段落として出力されること
	const tree = element("div", {}, [
		element("p", {}, [
			element("div", {}, [text("アイテム1の本文です。")]),
			element("div", {}, [text("アイテム2の本文です。")]),
			element("div", {}, [text("アイテム3の本文です。")]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(
		md,
		"アイテム1の本文です。\n\nアイテム2の本文です。\n\nアイテム3の本文です。",
	);
});

test("hide-from-message-actions attribute does not suppress text", () => {
	const tree = element("div", {}, [
		element("div", { "hide-from-message-actions": "" }, [text("表示テキスト")]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "表示テキスト");
});

test("display:none elements are excluded from output", () => {
	const tree = element("div", {}, [
		element("p", {}, [text("表示テキスト")]),
		element("span", { style: "display: none;" }, [text("非表示テキスト")]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "表示テキスト");
});

test("display:none inside inline context is excluded", () => {
	const tree = element("div", {}, [
		element("p", {}, [
			text("前 "),
			element("span", { style: "display: none;" }, [text("非表示")]),
			text(" 後"),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "前  後");
});

test("inline code is wrapped in backticks", () => {
	const tree = element("div", {}, [
		element("p", {}, [
			text("実行: "),
			element("code", {}, [text("npm install")]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "実行: `npm install`");
});

test("fenced code block from pre element", () => {
	const tree = element("div", {}, [
		element("pre", {}, [
			element("code", {}, [text("function hello() {\n  return 42;\n}")]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "```\nfunction hello() {\n  return 42;\n}\n```");
});

test("italic text", () => {
	const tree = element("div", {}, [
		element("p", {}, [
			text("これは "),
			element("em", {}, [text("強調")]),
			text(" です"),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "これは *強調* です");
});

test("link in paragraph", () => {
	const tree = element("div", {}, [
		element("p", {}, [
			text("詳細は "),
			element("a", { href: "https://example.com" }, [text("こちら")]),
			text(" を参照"),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "詳細は [こちら](https://example.com) を参照");
});

test("link with no text falls back to href", () => {
	const tree = element("div", {}, [
		element("p", {}, [element("a", { href: "https://example.com" }, [])]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "[https://example.com](https://example.com)");
});

test("anchor with no href renders as plain text", () => {
	const tree = element("div", {}, [
		element("p", {}, [element("a", {}, [text("リンクなし")])]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "リンクなし");
});

test("image renders as markdown image syntax", () => {
	const tree = element("div", {}, [
		element("img", { src: "https://example.com/img.png", alt: "説明" }, []),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "![説明](https://example.com/img.png)");
});

test("blockquote with nested block elements", () => {
	const tree = element("div", {}, [
		element("blockquote", {}, [
			element("p", {}, [text("一行目")]),
			element("p", {}, [text("二行目")]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "> 一行目\n>\n> 二行目");
});

test("nested unordered list", () => {
	const tree = element("div", {}, [
		element("ul", {}, [
			element("li", {}, [
				text("親"),
				element("ul", {}, [
					element("li", {}, [text("子1")]),
					element("li", {}, [text("子2")]),
				]),
			]),
		]),
	]);
	const md = htmlToMarkdown(tree);
	assert.equal(md, "- 親\n  - 子1\n  - 子2");
});
