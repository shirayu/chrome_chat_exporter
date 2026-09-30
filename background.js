// Runs downloads outside the popup so they survive the popup closing
// (e.g. when the "Save As" dialog steals focus).

// Chunked to keep String.fromCharCode's argument count below the engine limit.
const BASE64_CHUNK_SIZE = 0x8000;

function toBase64(text) {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
	}
	return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== "chat-export-download") return false;
	const { data, mimeType, filename } = message;
	const url = `data:${mimeType};base64,${toBase64(data)}`;
	chrome.downloads
		.download({ url, filename, saveAs: true })
		.then((id) => sendResponse({ ok: true, id }))
		.catch((error) => sendResponse({ ok: false, error: String(error) }));
	return true;
});
