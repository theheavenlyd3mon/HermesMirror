# Hermes Bridge

Infrastructure module that polls the Hermes Agent gateway and distributes
kanban events to all Hermes display modules via `MM.sendNotification()`.

**This module renders no visible DOM.** It relays events only.

## Installation

Copy the module folder into your MagicMirror `modules/` directory:

```
modules/hermes-bridge/
├── hermes-bridge.js      # client relay (Module.register)
├── node_helper.js        # gateway poller + diff engine
└── README.md
```

No `npm install` required — zero external dependencies.

## Configuration

Add to `config/config.js` modules array. Place in a hidden region:

```js
{
	module: "hermes-bridge",
	position: "fullscreen_below",
	config: {
		gatewayUrl: "http://127.0.0.1:8642",
		refreshInterval: 30
	}
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `gatewayUrl` | string | `"http://127.0.0.1:8642"` | Hermes Agent gateway base URL |
| `refreshInterval` | number | `30` | Poll interval in seconds |

## Events Emitted

The bridge broadcasts these notifications to all modules:

| Notification | Payload | When |
|---|---|---|
| `HERMES_KANBAN_TASK_CREATED` | Task object | New task appears on board |
| `HERMES_KANBAN_TASK_DISPATCHED` | Task object | Task claimed by worker |
| `HERMES_KANBAN_TASK_COMPLETED` | Task object | Task marked done |
| `HERMES_KANBAN_TASK_BLOCKED` | Task object | Task blocked on human input |
| `HERMES_KANBAN_TASK_ARCHIVED` | Task object | Task archived |
| `HERMES_BOARD_STATE` | `{ tasks, updated_at }` | Initial load + every 5th poll |
| `HERMES_GATEWAY_STATUS` | `{ connected, error, last_ok_at }` | Every poll |

## How It Works

1. Client sends config to node_helper on `DOM_OBJECTS_CREATED`
2. Node helper polls `GET {gatewayUrl}/api/kanban/board` every N seconds
3. Diffs current board against previous state to detect changes
4. Emits individual task events + periodic full board snapshots
5. Client receives events and re-broadcasts them to all modules via `sendNotification()`
6. Display modules (dashboard, status, chat) consume these events

On gateway failure, the bridge emits `HERMES_GATEWAY_STATUS(connected: false)` and retries with exponential backoff (1s → 2s → 4s → max 30s).

## Dependencies

None. Uses only Node.js built-in `fetch()` and the standard MagicMirror `NodeHelper` base class.