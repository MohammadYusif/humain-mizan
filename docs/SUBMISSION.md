# Submission checklist

- [ ] Submitted via the platform's designated channel before the deadline (note time zone); each team member accepted terms
- [ ] Repo private; no .env, keys, brief or datasets committed (`git ls-files | grep -E "\.env|data/"` is empty)
- [ ] `uv run pytest` green; `uv run python scripts/check_licenses.py` clean; docs/LICENSES.md complete
- [ ] README: what it does, how to run (`docker compose up --build`), architecture, results table, limitations
- [ ] `hack eval` results saved and quoted in README / pitch
- [ ] Demo video recorded, no confidential data visible
- [ ] Fresh-clone test: clone, copy .env, `docker compose up --build`, UI works
- [ ] Nothing submitted gets deleted or altered afterwards
