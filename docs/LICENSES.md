# Third-party components (required disclosure, terms para 6)

No copyleft (GPL/AGPL/LGPL/SSPL). Re-run `uv run python scripts/check_licenses.py` after every Python dependency change and `npx license-checker --summary` (or review `npm ls`) after frontend changes. Exact versions: `uv.lock`, `frontend/package-lock.json`.

| Component | Licence | Used for | Restrictions |
|---|---|---|---|
| anthropic (Python SDK) | MIT | Claude API client | API terms of use |
| fastapi / starlette / uvicorn / pydantic / pydantic-settings | MIT / BSD-3 | API server | none |
| python-docx | MIT | reading uploaded .docx contracts | none |
| pypdf | BSD-3-Clause | reading uploaded .pdf contracts (text layer only) | none |
| python-multipart | Apache-2.0 | file uploads | none |
| openai (Python SDK, optional extra) | Apache-2.0 | OpenAI-compatible local models (Ollama) | none |
| React, Vite, TypeScript | MIT / MIT / Apache-2.0 | web UI | none |
| Tailwind CSS, shadcn/ui, Radix UI, lucide-react, sonner | MIT / MIT / MIT / ISC / MIT | web UI components and styling | none |
| DM Sans, IBM Plex Sans Arabic, IBM Plex Mono (via @fontsource) | SIL OFL 1.1 | self-hosted fonts | keep the licence with the fonts; no selling fonts alone |
| Qwen3 14B (local comparison only, via Ollama) | Apache-2.0 | sovereign-mode experiment | model licence terms |
| Claude models (Anthropic API) | commercial API terms | the agent's model | API terms of use |
