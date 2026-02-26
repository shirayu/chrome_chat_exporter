const statusEl = document.getElementById("status");
const exportClipboardBtn = document.getElementById("export-clipboard");
const exportDownloadBtn = document.getElementById("export-download");
const turnSelectRow = document.getElementById("turn-select-row");
const turnSelect = document.getElementById("turn-select");
const MARKDOWN_STYLE_STORAGE_KEY = "markdownStyle";

function applyI18n() {
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		if (!key) return;
		const message = chrome.i18n.getMessage(key);
		if (message) {
			el.textContent = message;
		}
	});
}

function getScope() {
	const selected = document.querySelector("input[name=scope]:checked");
	return selected ? selected.value : "current";
}

function getSelectedTurnIndex() {
	const value = turnSelect.value;
	return value ? Number.parseInt(value, 10) : null;
}

function getFormat() {
	const selected = document.querySelector("input[name=format]:checked");
	return selected ? selected.value : "md";
}

function getMarkdownStyle() {
	const selected = document.querySelector("input[name=markdownStyle]:checked");
	return selected ? selected.value : "legacy";
}

async function restoreMarkdownStyle() {
	try {
		const stored = await chrome.storage.local.get(MARKDOWN_STYLE_STORAGE_KEY);
		const value = stored?.[MARKDOWN_STYLE_STORAGE_KEY];
		if (value !== "gemini" && value !== "legacy") return;
		const input = document.querySelector(
			`input[name=markdownStyle][value="${value}"]`,
		);
		if (input) {
			input.checked = true;
		}
	} catch (error) {
		console.error("[Gemini Export] failed to restore markdown style", error);
	}
}

async function persistMarkdownStyle() {
	try {
		await chrome.storage.local.set({
			[MARKDOWN_STYLE_STORAGE_KEY]: getMarkdownStyle(),
		});
	} catch (error) {
		console.error("[Gemini Export] failed to save markdown style", error);
	}
}

async function getActiveTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return tab;
}

function setStatus(text, isWarn = false) {
	statusEl.textContent = text;
	statusEl.classList.toggle("warn", isWarn);
}

async function ensureContentScript(tabId) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			files: ["content.js"],
		});
		console.debug("[Gemini Export] content script injected");
		return true;
	} catch (error) {
		console.error("[Gemini Export] content script inject failed", error);
		return false;
	}
}

async function requestExport(format, output) {
	try {
		const tab = await getActiveTab();
		if (!tab || !tab.id) {
			setStatus(chrome.i18n.getMessage("statusNoTab"), true);
			return;
		}

		const request = {
			type: "EXPORT_GEMINI_CHAT",
			scope: getScope(),
			turnIndex: getSelectedTurnIndex(),
			markdownStyle: getMarkdownStyle(),
		};
		console.debug("[Gemini Export] sendMessage payload", request);

		const injected = await ensureContentScript(tab.id);
		if (!injected) {
			setStatus(chrome.i18n.getMessage("statusInjectFailed"), true);
			return;
		}

		const response = await chrome.tabs.sendMessage(tab.id, request);
		console.debug("[Gemini Export] response", response);

		if (!response || !response.ok) {
			if (response?.error) {
				console.error("[Gemini Export] content error", response.error);
			}
			setStatus(chrome.i18n.getMessage("statusPageNotReady"), true);
			return;
		}

		const payload = response.data;
		const isHtml = format === "html";
		const data = isHtml ? payload.html : payload.markdown;
		const extension = isHtml ? "html" : "md";
		const blob = new Blob([data], {
			type: isHtml ? "text/html" : "text/markdown",
		});
		const url = URL.createObjectURL(blob);

		const targetOutput = output === "download" ? "download" : "clipboard";
		if (targetOutput === "clipboard") {
			await navigator.clipboard.writeText(data);
			setStatus(chrome.i18n.getMessage("statusCopied"), false);
			return;
		}

		const scope = getScope();
		const scopeLabel =
			scope === "current" ? "current" : scope === "select" ? "select" : "all";
		const filename = `gemini_${scopeLabel}_${Date.now()}.${extension}`;

		await chrome.downloads.download({ url, filename, saveAs: true });
		setStatus(chrome.i18n.getMessage("statusDownloadStarted"), false);
	} catch (_error) {
		console.error("[Gemini Export] export failed", _error);
		setStatus(chrome.i18n.getMessage("statusExportFailed"), true);
	}
}

async function loadTurnOptions(tabId) {
	try {
		const injected = await ensureContentScript(tabId);
		if (!injected) return;
		const response = await chrome.tabs.sendMessage(tabId, {
			type: "LIST_GEMINI_TURNS",
		});
		if (!response || !response.ok) return;
		const turns = response.data.turns || [];
		turnSelect.innerHTML = "";
		if (turns.length === 0) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = chrome.i18n.getMessage("turnListEmpty");
			turnSelect.appendChild(option);
			return;
		}
		turns.forEach((turn) => {
			const option = document.createElement("option");
			option.value = String(turn.index);
			option.textContent = turn.label;
			turnSelect.appendChild(option);
		});
	} catch (error) {
		console.error("[Gemini Export] failed to load turn list", error);
	}
}

function toggleTurnSelect() {
	const scope = getScope();
	turnSelectRow.hidden = scope !== "select";
}

document.querySelectorAll("input[name=scope]").forEach((radio) => {
	radio.addEventListener("change", toggleTurnSelect);
});
document.querySelectorAll("input[name=markdownStyle]").forEach((radio) => {
	radio.addEventListener("change", () => {
		persistMarkdownStyle();
	});
});

exportClipboardBtn.addEventListener("click", () =>
	requestExport(getFormat(), "clipboard"),
);
exportDownloadBtn.addEventListener("click", () =>
	requestExport(getFormat(), "download"),
);

Promise.all([restoreMarkdownStyle(), getActiveTab()]).then(([, tab]) => {
	applyI18n();
	if (
		tab &&
		typeof tab.url === "string" &&
		tab.url.startsWith("https://gemini.google.com/")
	) {
		setStatus(chrome.i18n.getMessage("statusReady"), false);
		loadTurnOptions(tab.id);
	} else {
		setStatus(chrome.i18n.getMessage("statusOpenGemini"), true);
	}
	toggleTurnSelect();
});
