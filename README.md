# ![HermesMirror](.github/header.png)

<p style="text-align: center">
  <a href="https://choosealicense.com/licenses/mit">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
 </a>
 <img src="https://img.shields.io/github/actions/workflow/status/theheavenlyd3mon/HermesMirror/automated-tests.yaml?branch=master" alt="GitHub Actions">
 <img src="https://img.shields.io/github/v/tag/theheavenlyd3mon/HermesMirror" alt="Version">
</p>

**HermesMirror** is a modular smart mirror platform — a fork of [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) with deep [Hermes Agent](https://hermes-agent.nousresearch.com) integration. Turn any mirror into an intelligent ambient display that shows your tasks, agent activity, weather, calendar, and more — all driven by your personal AI agent stack.

## Hermes Integration

HermesMirror comes with three built-in modules that connect your mirror to the Hermes kanban system:

| Module | Role | Status |
|---|---|---|
| **hermes-bridge** | Infrastructure — polls the [Kanban API plugin](https://github.com/theheavenlyd3mon/HermesMirror) and distributes task events to all display modules via Socket.IO. Renders nothing. | ✅ Live |
| **hermes-dashboard** | Kanban task board — shows active, running, and blocked tasks with status badges and assignee labels. | ✅ Live |
| **hermes-status** | Ambient status bar — thin colored bar at the top of the mirror. Green = all clear, amber = active tasks, red = blocked or disconnected. | ✅ Live |

### Architecture

```
Kanban API Plugin (8643) ─── hermes-bridge ── Socket.IO ──► Browser
       ▲ polls every 30s        │                            │
       │                        ├── hermes-dashboard          │
  ┌────┴────┐                   └── hermes-status             │
  │kanban.db│                    (display modules)            │
  └─────────┘                                                ▼
                                                      Your Mirror!
```

## Documentation

Full MagicMirror² documentation is available at [docs.magicmirror.builders](https://docs.magicmirror.builders). Hermes-specific setup and configuration guides are being added to the HermesMirror wiki.

## Key Commands

| Command | Purpose |
|---|---|
| `npm run server` | Start headless HTTP server (no Electron) |
| `npm test` | Run vitest test suite |
| `npm run config:check` | Validate config.js |
| `npm run lint:js` | ESLint check |
| `npm run lint:css` | Stylelint check |

## License

MIT — same as MagicMirror². Free to use, modify, and share.
