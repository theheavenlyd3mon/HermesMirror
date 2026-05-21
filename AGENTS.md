# HermesMirror

**Type:** MagicMirror² fork — modular smart mirror platform
**Origin:** https://github.com/MagicMirrorOrg/MagicMirror
**Local path:** `/Users/noctis/projects/HermesMirror`
**GitHub (fork):** `theheavenlyd3mon/HermesMirror`
**Upstream remote:** `upstream` (MagicMirrorOrg/MagicMirror)

## Tech stack

- Node.js (JavaScript, CommonJS modules)
- Electron (desktop shell)
- Vitest (test runner)
- ESLint + Prettier + Stylelint + Markdownlint (linting)
- EditorConfig (`.editorconfig`)
- Husky (git hooks)

## Key commands

| Command | What it does |
|---|---|
| `npm test` | Full test suite (vitest) |
| `npm run test:js` | ESLint only |
| `npm run test:css` | Stylelint only |
| `npm run test:e2e` | E2E tests (Playwright) |
| `npm run lint:js --fix` | Auto-fix JS lint |
| `npm run lint:css --fix` | Auto-fix CSS |
| `npm run lint:prettier` | Format everything |
| `npm run config:check` | Validate config |
| `npm run server` | Start headless server |

## Branch strategy

- `master` — main development branch
- Upstream tracked via `upstream/master`
- No `main` branch — the fork uses `master`

## Conventions

- **Indentation:** Tabs (not spaces)
- **Line endings:** LF
- **Style:** Follow existing patterns in the codebase; ESLint/Prettier config is authoritative
- **Tests:** Vitest, only run on changed logic — no need to run full suite for docs/readme edits
- **Commits:** Descriptive messages referencing the change area (e.g. "module: add calendar refresh", "fix: config check crash")
- **Pushing:** Always verify with `git push --dry-run` first

## Agent notes

When working on this project, always `cd /Users/noctis/projects/HermesMirror` — do not use `~/` paths as Hermes sandboxes `$HOME`. All file references in this repo should use absolute paths or relative paths from the project root.

### ⚠️ DO NOT launch Electron

`npm start` launches the Electron desktop app full-screen (via `electron js/electron.js`). Never use this for testing.

**Use these headless alternatives instead:**

| Command | Purpose |
|---|---|
| `npm test` or `npm run test:unit` | Run the vitest test suite (no GUI) |
| `npm run server` | Start HTTP server only for dev testing |
| `npm run config:check` | Validate config.js |
| `npm run lint:js` | ESLint check |
| `npm run lint:css` | Stylelint check |

A kanban fix task that triggers the Electron GUI will be reclaimed. Use `npm run server` or `npm test` to verify changes.

## Roadmap

### Phase 1 — Core modules (✅ COMPLETE — 2026-05-15)

**Status:** All 3 modules built, tested (headless), and pushed to GitHub (`9596514e`).

| Module | Lines | Status | Notes |
|--------|-------|--------|-------|
| **hermes-bridge** | 253+1343 bytes | ✅ Complete | Backoff fix applied (`retryDelay` from 1s→30s cap). Pushes gateway URL from config. |
| **hermes-dashboard** | 146+118 CSS | ✅ Complete | 7 notification types handled, color-coded, card rendering, `maxTasks` config respected. |
| **hermes-status** | 184+46 CSS | ✅ Complete | 5 visual states correct, ambient bar, Calm Tech Level 1, pulse animation smooth. |
| **Kanban API plugin** | ~100 lines Python | ✅ Complete | `~/.hermes/plugins/kanban-api/` — standalone aiohttp server on port 8643. Zero core Hermes changes. Survives `hermes update`. |

**Known gaps:**
- `.gitignore` line 58 (`/modules/*`) ignores ALL modules — force-add needed on future adds (already tracked)
- Repo description updated ✓ — "HermesMirror — a modular smart mirror platform with deep Hermes Agent integration. Forked from MagicMirror²."
  - PAT lacks `administration` scope for repo metadata API changes; use GitHub Settings UI for future updates
- README.md rewritten for HermesMirror branding — pushed
- Homepage: not set — could point to hermes-agent docs or a project site if desired

### Phase 1.5 — Testing & CI (in progress)
- [x] **Unit tests for board-utils** — `diffBoardState()`, `statusToEvent()`, `clamp()` — 25 tests
- [x] **Unit tests for dashboard** — notification handling, `_upsertTask()`, `_renderCard()`, sorting, filtering, empty state — 38 tests
- [x] **Unit tests for status** — state machine, `_recomputeCounts()`, notifications, DOM rendering — 35 tests
- [ ] **Unit tests for backoff logic** — fetch failure → 1s → 2s → 4s → ... → 30s cap
- [ ] **GitHub Actions CI** — run tests on push
- [ ] **ESLint: our modules** — add explicit config for hermes-* modules

**Bug found by tests:** dashboard sort used `||` which treated `blocked` (value `0`) as falsy, causing blocked tasks to sort last. Fixed with `??`.

### Phase 2 — hermes-chat (text interface on mirror)
- [ ] Research: MMM-AssistantMk2, MMM-GoogleAssistant, MMM-Hotword patterns
- [ ] Design: module architecture (mic input → Hermes gateway → LLM response → text/voice output)
- [ ] Implement: hermes-chat module (voice wake-word optional, text input as MVP)
- [ ] Bridge integration: chat module receives gateway responses, displays on mirror
- [ ] Security: user-facing input sanitization, gateway auth (if needed)

### Phase 3 — Platform improvements
- **YAML config** — replace config.js with YAML
- **CSS variable theming** — dark/light mode, theme switching
- **Docker-first deployment** — single binary/container

## Pre-push checklist

Before pushing to the fork:

1. **Force-add modules** — `git add -f modules/hermes-*` (bypass `.gitignore`)
2. **Verify config** — `git add config/config.js.sample` (changes already present)
3. **Commit** — `git commit -m "Phase 1: Hermes bridge, dashboard, status modules"`
4. **Push** — `git push --dry-run` first, then `git push origin master`

## Test results

| Test | Status | Notes |
|------|--------|-------|
| Unit tests | ✅ 357/358 pass | 1 pre-existing failure: systeminfo expects "platform: linux" on macOS (not ours) |
| config:check | ✅ Clean | No syntax or structure errors |
| ESLint | ⚠️ 12 errors | All pre-existing: 6 console statements in _validate_bridge.js (removed), 3 calendar fade refs, 1 weather CalendarUtils ref |
| Stylelint | ✅ Clean (after BEM fix) | BEM selector whitelist applied |
| Syntax check | ✅ Clean | node_helper.js and both dashboard JS files pass `node -c` |

## Research sources

- HERMES-ARCHITECTURE.md — module design (architect, 857 lines)
- ARCHITECTURE_REVIEW.md — MagicMirror² v2.36.0 structure (415 lines)
- smart-mirror-research-brief.md — UI, hardware, calm tech, design patterns (23KB)
- research-brief.md — ecosystem, modules, use cases, Hermes integration (15KB)
