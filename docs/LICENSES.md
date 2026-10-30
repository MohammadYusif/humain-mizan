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

## Real-world eval contracts (`evals/real/`)

Only the source list (URLs, SHA-256), our labels and results are in git. The contract texts are fetched by `scripts/fetch_real_contracts.py` into `data/real/` (git- and docker-ignored), used for internal evaluation only, unmodified at source and not redistributed. Ask the owners for written permission before publishing any of them.

- **CUAD v1** © The Atticus Project, CC BY 4.0 (Hendrycks et al., NeurIPS 2021, https://zenodo.org/records/4595826; files via https://huggingface.co/datasets/theatticusproject/cuad). The underlying contracts are public SEC EDGAR filings. We selected 6 contracts and mapped CUAD's clause annotations to our playbook rules.
- **CLAUDETTE ToS corpus**, CC BY 4.0 (Lippi et al. 2019; Galassi et al. 2024, https://github.com/nlp-unibo/Multilingual-Unfair-Clause-Detection). Zoom and Dropbox terms; annotations mapped to our rules. The terms themselves belong to Zoom and Dropbox.
- **SEC EDGAR exhibits**: Lucid Group (EV purchase agreement with the Saudi Ministry of Finance) and OMS Energy Technologies (Saudi Aramco purchase order terms). Public filings; text © the contracting parties.
- **Saudi Ministry of Finance unified model contracts** (etimad.sa), all rights reserved to the Ministry of Finance; and **EXPRO unified framework agreements** (expro.gov.sa), used under EXPRO's terms (personal copy and excerpts, no modification). Fetched 2026-10-30.
