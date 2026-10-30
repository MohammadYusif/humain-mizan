# Third-party components (required disclosure, terms para 6)

No copyleft (GPL/AGPL/LGPL/SSPL). Re-run `uv run python scripts/check_licenses.py` after every Python dependency change and `npx license-checker --summary` (or review `npm ls`) after frontend changes. Exact versions: `uv.lock`, `frontend/package-lock.json`.

| Component | Licence | Used for | Restrictions |
|---|---|---|---|
| anthropic (Python SDK) | MIT | Claude API client | API terms of use |
| fastapi / starlette / uvicorn / pydantic / pydantic-settings | MIT / BSD-3 | API server | none |
| python-docx | MIT | reading uploaded .docx contracts | none |
| pypdf | BSD-3-Clause | reading the text layer of uploaded .pdf contracts | none |
| pypdfium2 (PDFium) | Apache-2.0 / BSD-3-Clause | rendering PDF pages for OCR | none |
| Tesseract OCR (Debian `tesseract-ocr`, Docker image) + pytesseract | Apache-2.0 | local OCR of scans, photos and Arabic PDFs | none |
| tessdata_best `ara` and `eng` models (pinned commit, checksummed in the Dockerfile) | Apache-2.0 | OCR language models | none |
| Pillow | MIT-CMU (HPND) | image handling for OCR | none |
| Typst (typst-py) | Apache-2.0 | typesetting the PDF redline and memo | none |
| IBM Plex Sans Arabic, IBM Plex Mono (TTF in `src/hack/assets/fonts`, from google/fonts) | SIL OFL 1.1 | fonts embedded in the PDF exports | keep `OFL.txt` with the fonts; no selling fonts alone |
| python-multipart | Apache-2.0 | file uploads | none |
| openai (Python SDK, optional extra) | Apache-2.0 | OpenAI-compatible local models (Ollama) | none |
| React, Vite, TypeScript | MIT / MIT / Apache-2.0 | web UI | none |
| Tailwind CSS, shadcn/ui, Radix UI, lucide-react, sonner | MIT / MIT / MIT / ISC / MIT | web UI components and styling | none |
| DM Sans, IBM Plex Sans Arabic, IBM Plex Mono (via @fontsource) | SIL OFL 1.1 | self-hosted fonts | keep the licence with the fonts; no selling fonts alone |
| Qwen3 14B (local comparison only, via Ollama) | Apache-2.0 | sovereign-mode experiment | model licence terms |
| Claude models (Anthropic API) | commercial API terms | the agent's model | API terms of use |
