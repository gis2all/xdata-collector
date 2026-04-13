# XData Collector Project Pitfalls

This file is the fact source for `xdata-collector-guardrails`.

Rules:
- Record only recurring pitfalls that affect implementation, debugging, startup, verification, or documentation.
- Write the learning here first, then decide whether it should be promoted into the global skill.
- Never store real cookies, tokens, or other sensitive values.
- Every item should include context, wrong approach, correct approach, impact, and related paths.

## Template

Use this structure for new entries:

```md
## PIT-XXX Title

**Context**:
**Wrong approach**:
**Correct approach**:
**Impact**:
**Related paths**:
```

Record by default:
- long-lived pitfalls that can break functionality
- pitfalls that can cause wrong startup or wrong verification
- pitfalls that can cause future collaborators to misread directories, entrypoints, ports, or product boundaries

Do not record by default:
- one-off logs
- private cookies, tokens, or account data
- temporary network failures
- accidental issues unrelated to long-term project boundaries

## PIT-001 Main directories have been consolidated

**Context**: when editing structure, documentation, or startup commands.
**Wrong approach**: treating `desktop-ui/`, `src/`, or `scripts/` as the main active directories.
**Correct approach**: use `web-ui/`, `backend/`, and `run/` as the current main directories.
**Impact**: directory changes, docs, debugging, entrypoint selection.
**Related paths**: `web-ui/`, `backend/`, `run/`

## PIT-002 Runtime entrypoints should come from run

**Context**: when starting services or updating run documentation.
**Wrong approach**: guessing old script names first, or using historical shims as the real entrypoints.
**Correct approach**: prefer `run/api.py`, `run/scheduler.py`, and `run/static_web_server.py`.
**Impact**: startup commands, docs, collaboration, debugging.
**Related paths**: `run/api.py`, `run/scheduler.py`, `run/static_web_server.py`

## PIT-003 Service roles and ports must stay explicit

**Context**: when restarting services or explaining the runtime layout.
**Wrong approach**: assuming every process is a port-based service, or thinking scheduler exposes an HTTP port.
**Correct approach**: API is `127.0.0.1:8765`, Dev UI is `127.0.0.1:5177`, Static UI is `127.0.0.1:5178`, and scheduler has no port and defaults to `tick-seconds=30`.
**Impact**: startup, shutdown, health checks, docs, debugging.
**Related paths**: `run/api.py`, `run/scheduler.py`, `run/static_web_server.py`, `web-ui/vite.config.*`

## PIT-004 Check X cookies before suspecting the UI

**Context**: when collection fails, health checks degrade, or results are empty.
**Wrong approach**: blaming the frontend or API first without validating `.env` cookies.
**Correct approach**: check `TWITTER_AUTH_TOKEN` and `TWITTER_CT0` in `.env` first, then inspect `/health`; `TWITTER_BROWSER` and `TWITTER_CHROME_PROFILE` are only helper fields.
**Impact**: manual search, jobs, health checks, debugging.
**Related paths**: `.env`, `.env.example`, `backend/collector_service.py`, `backend/twitter_cli.py`

## PIT-005 Windows dev server can leave child processes behind

**Context**: when restarting the frontend or troubleshooting port `5177`.
**Wrong approach**: stopping only the outer `npm` or PowerShell wrapper and assuming Vite has exited.
**Correct approach**: check for `node` / `vite` child processes and verify that port `5177` is really free.
**Impact**: frontend restart, port conflicts, manual testing.
**Related paths**: `web-ui/`, `runtime/logs/`

## PIT-006 Logs and temp files must not drift back to repo root

**Context**: when adding run scripts, redirecting logs, or doing smoke checks.
**Wrong approach**: writing logs and temp output back into the repository root.
**Correct approach**: keep logs in `runtime/logs/` and temp files in `runtime/tmp/`.
**Impact**: repository hygiene, collaboration, debugging.
**Related paths**: `runtime/logs/`, `runtime/tmp/`

## PIT-007 The main repo is X collection only

**Context**: when describing product scope, health checks, or dashboard semantics.
**Wrong approach**: reintroducing Notion or downstream sync behavior into the main repo narrative.
**Correct approach**: the repo owns X search, rule filtering, SQLite persistence, local API, scheduler, and result browsing; health checks should focus on `summary`, `db`, and `x`.
**Impact**: README, CLAUDE, dashboard, backend API, debugging.
**Related paths**: `backend/collector_service.py`, `web-ui/src/pages/DashboardPage.tsx`, `README.md`, `CLAUDE.md`

## PIT-008 PowerShell mojibake does not always mean the file is broken

**Context**: when inspecting Chinese README files, HTML, or JSON in PowerShell.
**Wrong approach**: assuming terminal mojibake means the file itself is corrupted.
**Correct approach**: verify the file with Python using UTF-8 reads; distinguish display-chain issues from real file corruption.
**Impact**: document repair, page title checks, static file debugging.
**Related paths**: `README.md`, `CLAUDE.md`, `web-ui/index.html`, `web-ui/dist/index.html`

## PIT-009 Verify before claiming the change is done

**Context**: after changing entrypoints, naming, docs, or startup flow.
**Wrong approach**: relying only on diff inspection and then declaring success.
**Correct approach**: run `python -m pytest -c tests/pytest.ini tests` and `cd web-ui && npm run build`; for runtime changes also check `/health`, `5177`, and `5178` responses.
**Impact**: regression safety, trust, debugging cost.
**Related paths**: `tests/pytest.ini`, `web-ui/package.json`, `run/api.py`, `run/static_web_server.py`

## PIT-010 Shutdown must be checked by both process and port

**Context**: when stopping API, scheduler, Dev UI, or Static UI before restart or rename work.
**Wrong approach**: killing only a wrapper process or trusting that a closed window means the service is gone.
**Correct approach**: confirm both the process state and port state for `8765`, `5177`, and `5178`; on Windows, pay extra attention to `node` / `vite` children.
**Impact**: renames, restarts, port-conflict debugging.
**Related paths**: `run/api.py`, `run/scheduler.py`, `run/static_web_server.py`, `web-ui/`, `runtime/logs/`

## PIT-011 Dependency bootstrap has moved to bootstrap.py

**Context**: when preparing local dependencies, fixing missing `twitter-cli`, or updating setup docs.
**Wrong approach**: treating platform-specific scripts as the primary install path or forgetting to document dependency bootstrap.
**Correct approach**: use `python run/bootstrap.py` directly; it installs `twitter-cli` and `agent-browser` by default and does not accept extra arguments.
**Impact**: machine setup, README, runtime debugging.
**Related paths**: `run/bootstrap.py`, `backend/twitter_cli.py`, `README.md`

## PIT-012 PowerShell UTF8 ? JSON ??? BOM

**Context**: when editing `package.json`, lockfiles, or other JSON config files on Windows with PowerShell.  
**Wrong approach**: using `Set-Content -Encoding UTF8` and assuming the output is a BOM-free UTF-8 file.  
**Correct approach**: for JSON and other strict config files, prefer rewriting with Python `utf-8` or another BOM-free writer; if a file suddenly becomes invalid after a small text change, check for a UTF-8 BOM first.  
**Impact**: frontend build, config parsing, npm and Vite behavior.  
**Related paths**: `web-ui/package.json`, `web-ui/package-lock.json`


## PIT-013 services.py 只管理开发主链路

**Context**: when starting or stopping all services through the runtime controller.
**Wrong approach**: assuming `run/services.py` also manages `run/static_web_server.py` or any build-preview process by default.
**Correct approach**: treat `run/services.py` as the controller for API, Scheduler, and Dev UI only; keep `run/static_web_server.py` as a separate preview tool.
**Impact**: startup expectations, docs, troubleshooting, port checks.
**Related paths**: `run/services.py`, `run/static_web_server.py`, `run/README.md`, `README.md`

## Documentation Encoding Pitfall

- Scenario: writing Chinese Markdown content through Windows PowerShell here-strings.
- Wrong approach: piping Chinese literal text from a PowerShell here-string into `python -` or direct PowerShell file writers.
- Correct approach: modify UTF-8 files with Python directly; if terminal encoding is unstable, use ASCII or Unicode escapes for inserted content.
- Impact: `README.md`, `CLAUDE.md`, JSON/config templates, and other repo docs can be corrupted into `?` characters.
- Related paths: `README.md`, `CLAUDE.md`, `.learnings/project-pitfalls.md`
