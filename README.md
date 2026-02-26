# Chat Exporter

Chrome extension that exports Gemini conversations as HTML or Markdown.

## Usage

1. Open Chrome Extensions and choose "Load unpacked", then select this folder.
2. Open `https://gemini.google.com/` and a chat thread.
3. Click the extension icon, choose the scope and output, then click Export.

## Options

- Scope:
    - Latest: export only the latest turn.
    - All: export all visible turns.
    - Select: choose a specific turn from a dropdown (label shows the first 20 characters).
- Output:
    - Clipboard (default)
    - Download
- Format:
    - Markdown (default)
    - HTML
- Markdown style:
    - Role Numbering Style (default): `## Turn 1-1: User` / `## Turn 1-2: Gemini`
    - Turn Heading Style: `## Turn 1` + `### User` / `### Gemini`
    - The selected style is saved in popup UI.

## Notes

- Images and file attachments are not included.
- If Gemini changes its DOM structure, extraction may break.
