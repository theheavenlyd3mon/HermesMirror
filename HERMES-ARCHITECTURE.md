# HermesMirror — Hermes Agent Integration Architecture

> Design document. No code changes. Follows existing MagicMirror² patterns.
> References: [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md)

---

## Table of Contents

1. [Event Bridge Schema](#1-event-bridge-schema)
2. [Module Contract](#2-module-contract)
3. [Module Inventory](#3-module-inventory)
4. [Socket Integration](#4-socket-integration)
5. [Config Format](#5-config-format)
6. [Data Flow Diagrams](#6-data-flow-diagrams)

---

## 1. Event Bridge Schema

### 1.1 Architecture Decision

A **single centralized bridge module** (`hermes-bridge`) polls the Hermes Agent gateway
REST API and distributes kanban events to all hermes display modules.

**Why centralized:**
- One HTTP connection to the gateway (not N per module)
- One polling interval to tune (not N independent timers)
- One place to handle gateway unavailability (retry/backoff/reconnect)
- Display modules remain pure consumers with no gateway awareness

### 1.2 Socket.IO Namespace

The bridge communicates with its client half through the **standard per-module
namespace** — no new infrastructure needed.

```
Namespace: io.of("hermes-bridge")
```

This follows the existing pattern: `MMSocket("hermes-bridge")` on the client
connects to `io("/hermes-bridge")` on the server.

### 1.3 Event Types

All events are emitted by the bridge's node_helper via
`sendSocketNotification()`. The bridge client receives them via
`socketNotificationReceived()` and broadcasts them to all modules via
`MM.sendNotification()`.

| Notification Name | Payload | Occurrence |
|---|---|---|
| `HERMES_KANBAN_TASK_CREATED` | `{ task_id, title, assignee, status, created_at }` | New kanban task created |
| `HERMES_KANBAN_TASK_DISPATCHED` | `{ task_id, title, assignee, status, started_at, run_id }` | Task claimed by worker |
| `HERMES_KANBAN_TASK_COMPLETED` | `{ task_id, title, assignee, status, completed_at, summary }` | Task marked done |
| `HERMES_KANBAN_TASK_BLOCKED` | `{ task_id, title, assignee, status, block_reason, blocked_at }` | Task blocked on human input |
| `HERMES_KANBAN_TASK_ARCHIVED` | `{ task_id, title, assignee, status, archived_at }` | Task archived |
| `HERMES_BOARD_STATE` | `{ tasks: [...], updated_at }` | Full board snapshot (initial load + periodic refresh) |
| `HERMES_GATEWAY_STATUS` | `{ connected: boolean, error: string|null, last_ok_at }` | Gateway connectivity status |

### 1.4 Payload Shape

All task event payloads share a common envelope:

```typescript
// Conceptual — runtime is plain JS objects, no TypeScript
type HermesTaskEvent = {
  // Event metadata
  event: string;                  // e.g. "task-completed"
  timestamp: string;              // ISO 8601, bridge receipt time

  // Task identity
  task_id: string;                // e.g. "t_91c0a5ee"
  title: string;
  assignee: string;               // Profile name

  // Status
  status: "ready" | "running" | "done" | "blocked" | "archived";
  created_at: number;             // Unix epoch

  // Optional — present for dispatched tasks
  started_at?: number;
  run_id?: number;

  // Optional — present for completed tasks
  completed_at?: number;
  summary?: string;

  // Optional — present for blocked tasks
  block_reason?: string;
  blocked_at?: number;
};
```

The `HERMES_BOARD_STATE` payload is a bulk snapshot:

```typescript
type HermesBoardState = {
  tasks: HermesTaskEvent[];       // All non-archived tasks
  updated_at: number;             // Unix epoch
};
```

### 1.5 Notification Routing

```
                  ┌──────────────┐
                  │ Hermes       │
                  │ Gateway API  │
                  │ :8642        │
                  └──────┬───────┘
                         │ HTTP GET /api/kanban
                         │ (polling)
                         ▼
┌──────────────────────────────────────────────────┐
│  hermes-bridge/node_helper.js  (SERVER)          │
│                                                  │
│  polls gateway every N seconds                   │
│  diffs against last known state                  │
│  emits individual task events + board snapshots  │
│  via sendSocketNotification()                    │
│  → io.of("hermes-bridge").emit(...)              │
└──────────────────────┬───────────────────────────┘
                       │ Socket.IO
                       ▼
┌──────────────────────────────────────────────────┐
│  hermes-bridge/hermes-bridge.js  (CLIENT)        │
│                                                  │
│  receives via socketNotificationReceived()       │
│  broadcasts to all modules:                      │
│    this.sendNotification("HERMES_KANBAN_*", p)   │
│  → MM.sendNotification(...)                      │
└──────┬───────────────┬───────────────┬───────────┘
       │               │               │
       ▼               ▼               ▼
  ┌─────────┐   ┌──────────┐   ┌───────────┐
  │dashboard│   │  status  │   │   chat     │
  │         │   │          │   │           │
  │ notif-  │   │ notif-   │   │ notif-    │
  │ Received│   │ Received │   │ Received  │
  └─────────┘   └──────────┘   └───────────┘
```

---

## 2. Module Contract

### 2.1 Registration

Hermes modules follow the standard `Module.register()` pattern:

```js
// modules/hermes-dashboard/hermes-dashboard.js
Module.register("hermes-dashboard", {
  defaults: {
    maxTasks: 10,
    showCompleted: false,
    refreshInterval: 30
  },

  start() {
    Log.info("Starting hermes-dashboard module");
    this.tasks = [];
    this.gatewayStatus = null;
  },

  getDom() {
    // returns DOM element
  },

  notificationReceived(notification, payload, sender) {
    // handle HERMES_KANBAN_* notifications
  }
});
```

### 2.2 Required Lifecycle Hooks

| Hook | Required | Contract |
|---|---|---|
| `start()` | Yes | Initialize state, no DOM creation |
| `getDom()` | Yes | Return DOM element or Promise<DOM> |
| `notificationReceived(notification, payload)` | Yes | Handle HERMES_KANBAN_* notifications |
| `getTemplate()` | Optional | Nunjucks template string or filename |
| `getStyles()` | Optional | Array of CSS files to load |
| `getScripts()` | Optional | Array of JS files to load |
| `suspend()` | Optional | Called when module hidden |
| `resume()` | Optional | Called when module shown |

### 2.3 Notification Contract

Hermes modules MUST handle these notifications in `notificationReceived()`:

| Notification | Action |
|---|---|
| `HERMES_KANBAN_TASK_CREATED` | Add task to local state, update DOM |
| `HERMES_KANBAN_TASK_DISPATCHED` | Update task status to running |
| `HERMES_KANBAN_TASK_COMPLETED` | Update task status to done, show summary |
| `HERMES_KANBAN_TASK_BLOCKED` | Mark task blocked, show reason |
| `HERMES_KANBAN_TASK_ARCHIVED` | Remove task from display |
| `HERMES_BOARD_STATE` | Replace entire local state (initial load) |
| `HERMES_GATEWAY_STATUS` | Show/hide connectivity indicator |

### 2.4 Push vs Pull

| Direction | Mechanism | Use case |
|---|---|---|
| **Push** | `notificationReceived()` | All kanban events arrive as push notifications from the bridge |
| **Pull** | `sendSocketNotification()` → node_helper | Chat: send message to gateway. Smarthome: query HA |

Display-only modules (dashboard, status) are push-only consumers. Interactive
modules (chat, smarthome) use the standard client→server socket path for
outbound requests.

### 2.5 Node Helper Requirement

| Module | Has node_helper? | Purpose |
|---|---|---|
| hermes-bridge | Yes | Poll Hermes gateway, emit events |
| hermes-dashboard | No | Pure display consumer |
| hermes-status | No | Pure display consumer |
| hermes-chat | Yes | Relay messages to Hermes gateway API |
| hermes-smarthome | Yes | Relay commands to Home Assistant REST API |

### 2.6 Hermes-Namespaced Notifications

All inter-module notifications use a `HERMES_` prefix to avoid collisions with
existing MagicMirror notifications. Modules should only act on `HERMES_*`
notifications they explicitly handle. Unknown HERMES notifications should be
silently ignored (not logged as errors).

---

## 3. Module Inventory

### 3.1 hermes-bridge (infrastructure module)

**File:** `modules/hermes-bridge/`

| File | Purpose |
|---|---|
| `hermes-bridge.js` | Client: receives socket events, broadcasts to all modules |
| `node_helper.js` | Server: polls Hermes gateway, diffs state, emits events |
| `README.md` | Installation + config docs |

**Responsibilities:**
- Poll `GET {gatewayUrl}/api/kanban/board` every `refreshInterval` seconds
- Diff current board state against previous to detect new/dispatched/completed tasks
- Emit individual task events for each change
- Emit `HERMES_BOARD_STATE` snapshot every N polls (full refresh)
- Track gateway connectivity, emit `HERMES_GATEWAY_STATUS`
- Retry with exponential backoff on gateway failure (1s, 2s, 4s, max 30s)
- Validate payloads before forwarding (never forward malformed data)

**Client-side behavior:**
- Receives socket notifications from its node_helper
- Re-broadcasts all kanban events as `MM.sendNotification("HERMES_KANBAN_*", payload)`
- Stores nothing — purely a relay

**Note:** The bridge module does not render DOM (returns empty div).
It should be placed in a non-visible region (e.g., `position: "fullscreen_below"`)
or the config could support disabling its DOM wrapper. For simplicity in
initial design, place it in a hidden region.

### 3.2 hermes-dashboard

**File:** `modules/hermes-dashboard/hermes-dashboard.js`

**Purpose:** Live kanban board — renders tasks as cards grouped by status
(ready, running, blocked).

**Features:**
- Card per task showing: title, assignee, status badge
- Color-coded status: ready=blue, running=yellow, done=green, blocked=red
- Auto-updates on every kanban event (no polling from this module)
- Maximum task count (`maxTasks` config, default 10)
- Option to show/hide completed tasks (`showCompleted`, default false)
- Subtle animation on task status change (CSS transition on card)

**Config defaults:**
```js
defaults: {
  maxTasks: 10,
  showCompleted: false,
  cardWidth: "300px"   // CSS value
}
```

**DOM structure:**
```
.hermes-dashboard
  .hermes-card.hermes-card--ready
    .hermes-card__title
    .hermes-card__assignee
    .hermes-card__status
```

### 3.3 hermes-status

**File:** `modules/hermes-status/hermes-status.js`

**Purpose:** Ambient color bar indicating agent activity level.
Minimal visual — a colored strip across the top or bottom region.

**Features:**
- Single horizontal bar, full width of region
- Color transitions based on agent activity:
  - Idle (no tasks) → dim grey/transparent
  - Active (tasks running) → warm amber pulsing
  - Blocked (tasks need input) → attention red
  - All done → cool green
- Smooth CSS transition between states (2s ease)
- Optional subtle pulse animation when tasks are running

**Config defaults:**
```js
defaults: {
  height: "4px",
  pulseSpeed: 2000,       // ms for pulse cycle
  showGatewayStatus: true // dim when gateway unreachable
}
```

**DOM structure:**
```
.hermes-status
  .hermes-status__bar.hermes-status__bar--active
```

### 3.4 hermes-chat

**File:** `modules/hermes-chat/`

| File | Purpose |
|---|---|
| `hermes-chat.js` | Client: text input + response display |
| `node_helper.js` | Server: proxies messages to Hermes gateway API |

**Purpose:** Text input on the mirror that sends prompts to Hermes and displays
responses.

**Features:**
- Text input field at bottom of module region
- Message history (scrolling, newest at bottom)
- Send button or Enter key to submit
- Loading indicator while awaiting response
- Response appears as a message bubble
- `maxHistory` config (default 20 messages)
- Messages stored in-memory only (not persisted)

**Gateway interaction:**
- Client sends `sendSocketNotification("HERMES_CHAT_SEND", { message })`
- Node helper POSTs to `{gatewayUrl}/api/chat` with `{ message, session_id }`
- Node helper returns `HERMES_CHAT_RESPONSE` with `{ message, response, timestamp }`
- Session ID generated on first message, reused for conversation context

**Config defaults:**
```js
defaults: {
  placeholder: "Ask Hermes...",
  maxHistory: 20,
  gatewayUrl: ""  // Falls back to global hermes.gatewayUrl
}
```

### 3.5 hermes-smarthome (optional, future phase)

**File:** `modules/hermes-smarthome/`

| File | Purpose |
|---|---|
| `hermes-smarthome.js` | Client: entity list + control toggles |
| `node_helper.js` | Server: Home Assistant REST client |

**Purpose:** Display and control Home Assistant entities on the mirror.

**Features:**
- Entity list with state (on/off, temperature, etc.)
- Toggle switches for binary entities (lights, switches)
- Pulls state from HA REST API
- Sends commands via HA REST API
- Configurable entity filter (`entities` array in config)

**Config defaults:**
```js
defaults: {
  haUrl: "",           // Home Assistant URL
  haToken: "",         // Long-lived access token
  entities: [],        // Array of entity_id strings to display
  refreshInterval: 60  // State poll interval (seconds)
}
```

---

## 4. Socket Integration

### 4.1 Bridge File Location

The bridge lives as a standard module — **no changes to core files** (`js/server.js`,
`js/app.js`, `js/node_helper.js`):

```
modules/hermes-bridge/
  ├── hermes-bridge.js     ← client side (Module.register)
  ├── node_helper.js       ← server side (NodeHelper.create)
  └── README.md
```

It is loaded like any other module via `config.modules[]`.

### 4.2 Gateway Polling Mechanism

The bridge node_helper polls the Hermes gateway REST API:

```
Endpoint:  GET {gatewayUrl}/api/kanban/board
Auth:      None (gateway is localhost-only by default)
Response:  {
             tasks: [...],
             updated_at: <unix_epoch>
           }
```

**Polling cycle:**

```
┌────────────────────────────────────────────────────────────┐
│  hermes-bridge node_helper start()                         │
│                                                            │
│  1. Initial fetch → store last_state                      │
│  2. Emit HERMES_BOARD_STATE (full snapshot)                │
│  3. setInterval(fetchAndDiff, refreshInterval * 1000)      │
│                                                            │
│  fetchAndDiff():                                           │
│    4. GET /api/kanban/board                                │
│    5. If error → emit HERMES_GATEWAY_STATUS(connected:false)│
│       → backoff, retry                                     │
│    6. Diff current vs last_state:                          │
│       - Tasks in current not in last → TASK_CREATED        │
│       - Tasks in both, status changed → TASK_*             │
│       - Tasks in last not in current → TASK_ARCHIVED       │
│    7. Emit individual events                               │
│    8. store last_state = current                           │
│    9. Every 5th poll → emit HERMES_BOARD_STATE (heartbeat) │
└────────────────────────────────────────────────────────────┘
```

**Diff algorithm (pseudocode):**

```js
function diffBoardState(previous, current) {
  const prevMap = new Map(previous.tasks.map(t => [t.task_id, t]));
  const currMap = new Map(current.tasks.map(t => [t.task_id, t]));
  const events = [];

  for (const [id, task] of currMap) {
    const prev = prevMap.get(id);
    if (!prev) {
      events.push({ type: "HERMES_KANBAN_TASK_CREATED", task });
    } else if (prev.status !== task.status) {
      const eventType = statusToEvent(task.status);
      events.push({ type: eventType, task });
    }
  }

  for (const id of prevMap.keys()) {
    if (!currMap.has(id)) {
      events.push({ type: "HERMES_KANBAN_TASK_ARCHIVED", task: prevMap.get(id) });
    }
  }

  return events;
}

function statusToEvent(status) {
  return {
    "running": "HERMES_KANBAN_TASK_DISPATCHED",
    "done": "HERMES_KANBAN_TASK_COMPLETED",
    "blocked": "HERMES_KANBAN_TASK_BLOCKED",
  }[status] || null;
}
```

### 4.3 Gateway API Contract (Hermes Agent side)

The bridge expects the Hermes Agent to expose:

```
GET /api/kanban/board
Response 200:
{
  "tasks": [
    {
      "task_id": "t_91c0a5ee",
      "title": "design: HermesMirror module architecture",
      "assignee": "architect",
      "status": "running",
      "created_at": 1778701530,
      "started_at": 1778701545,
      "run_id": 53,
      "completed_at": null,
      "summary": null,
      "block_reason": null
    }
  ],
  "updated_at": 1778701600
}
```

This is the existing Hermes kanban database schema, exposed via a gateway
endpoint. No new Hermes Agent code needed if the gateway already serves this.
If not, the endpoint is a read-only SQL query against `~/.hermes/kanban.db`.

### 4.4 Forwarding to Mirror Socket.IO

Standard NodeHelper pattern — no new mechanism:

```js
// modules/hermes-bridge/node_helper.js (conceptual)
start() {
  this.lastState = null;
  this.pollInterval = setInterval(
    () => this.fetchAndDiff(),
    this.config.refreshInterval * 1000
  );
  this.fetchAndDiff(); // immediate first fetch
}

async fetchAndDiff() {
  try {
    const current = await this.fetchBoard();
    if (this.lastState) {
      const events = diffBoardState(this.lastState, current);
      for (const ev of events) {
        this.sendSocketNotification(ev.type, ev.task);
      }
    } else {
      this.sendSocketNotification("HERMES_BOARD_STATE", current);
    }
    this.lastState = current;
    this.sendSocketNotification("HERMES_GATEWAY_STATUS", {
      connected: true, error: null, last_ok_at: Date.now()
    });
  } catch (err) {
    this.sendSocketNotification("HERMES_GATEWAY_STATUS", {
      connected: false, error: err.message, last_ok_at: this.lastOkAt
    });
  }
}
```

### 4.5 Gateway Unavailability

- On fetch failure: emit `HERMES_GATEWAY_STATUS(connected: false)`
- Display modules show a subtle "offline" indicator (dimmed, grey dot)
- Retry with exponential backoff: 1s, 2s, 4s, 8s, 16s, cap at 30s
- On recovery: emit `HERMES_GATEWAY_STATUS(connected: true)` + full
  `HERMES_BOARD_STATE`
- No stored events are lost — the full snapshot on reconnect catches up

---

## 5. Config Format

### 5.1 Top-Level Hermes Config

New section in `config/config.js`:

```js
// config/config.js
module.exports = {
  // ... existing config ...

  hermes: {
    gatewayUrl: "http://127.0.0.1:8642",
    enabled: true,
    refreshInterval: 30,   // seconds between gateway polls
  },

  modules: [
    // Hermes bridge — infrastructure, place in hidden region
    {
      module: "hermes-bridge",
      position: "fullscreen_below",  // invisible, no DOM
      config: {
        gatewayUrl: "http://127.0.0.1:8642",  // override global
        refreshInterval: 30
      }
    },

    // Dashboard — kanban task cards
    {
      module: "hermes-dashboard",
      position: "top_right",
      config: {
        maxTasks: 10,
        showCompleted: false
      }
    },

    // Status — ambient activity bar
    {
      module: "hermes-status",
      position: "top_bar",
      config: {
        height: "4px",
        showGatewayStatus: true
      }
    },

    // Chat — text input + response
    {
      module: "hermes-chat",
      position: "bottom_right",
      config: {
        placeholder: "Ask Hermes...",
        maxHistory: 20
      }
    },

    // Home Assistant (future)
    // {
    //   module: "hermes-smarthome",
    //   position: "bottom_left",
    //   config: {
    //     haUrl: "http://homeassistant.local:8123",
    //     haToken: "${HA_TOKEN}",
    //     entities: ["light.living_room", "switch.coffee_maker"]
    //   }
    // }
  ]
};
```

### 5.2 Config Property Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `hermes.gatewayUrl` | string | `"http://127.0.0.1:8642"` | Hermes Agent gateway base URL |
| `hermes.enabled` | boolean | `true` | Master kill-switch for all Hermes modules |
| `hermes.refreshInterval` | number | `30` | Default poll interval in seconds |

Module-level config overrides global where specified.

### 5.3 Config Validation

The bridge module should validate on `start()`:

1. `gatewayUrl` is a valid HTTP URL
2. `refreshInterval` is a positive integer
3. Gateway is reachable (warn if not, don't crash)

---

## 6. Data Flow Diagrams

### 6.1 Startup Sequence

```
SERVER                          CLIENT
──────                          ──────

app.start()
  → loadConfig()
    → hermes section in config
  → loadModules([..., "hermes-bridge", ...])
    → require(hermes-bridge/node_helper.js)
    → new HermesBridgeHelper()
    → helper.loaded()
    → helper.setExpressApp(app)
    → helper.setSocketIO(io)
      → io.of("hermes-bridge").on("connection", ...)
    → helper.start()
      → this.fetchAndDiff()              ──── HTTP GET ──→ Hermes Gateway
      → first board state received       ←── JSON ───────
      → sendSocketNotification(
          "HERMES_BOARD_STATE", state)

                                  MM.init()
                                    → loadConfig() (GET /config)
                                    → Loader.loadModules()
                                      → loadFile(hermes-bridge.js)
                                      → Module.create("hermes-bridge")
                                    → startModules()
                                      → bridge.start()
                                        → socket()
                                          → MMSocket("hermes-bridge")
                                          → io("/hermes-bridge")
                                        → bridge connects to namespace

                                  ← io("hermes-bridge").emit(
                                      "HERMES_BOARD_STATE", state)
                                  bridge.socketNotificationReceived(
                                    "HERMES_BOARD_STATE", state)
                                  bridge.sendNotification(
                                    "HERMES_BOARD_STATE", state)

                                  All other hermes modules that
                                  registered notificationReceived()
                                  receive the board state:

                                  dashboard.notificationReceived(...)
                                    → update local state
                                    → updateDom()

                                  status.notificationReceived(...)
                                    → update activity state
                                    → updateDom()
```

### 6.2 Task Lifecycle Event Flow

```
Hermes Gateway                    HermesMirror
─────────────                    ────────────
                                  hermes-bridge polls every N seconds:

GET /api/kanban/board            → detect new task "t_abc123"
                                  → sendSocketNotification(
                                      "HERMES_KANBAN_TASK_CREATED", {...})

                                  bridge client receives:
                                  → sendNotification(
                                      "HERMES_KANBAN_TASK_CREATED", {...})

                                  dashboard receives:
                                  → add card to DOM

                                  status receives:
                                  → bar turns amber (tasks running)

[task dispatched by dispatcher]

Next poll cycle:
GET /api/kanban/board            → detect status change: ready→running
                                  → sendSocketNotification(
                                      "HERMES_KANBAN_TASK_DISPATCHED", {...})

                                  bridge client receives:
                                  → sendNotification(...)

                                  dashboard: card status → "running" badge
                                  status: bar pulse animation starts

[worker calls kanban_complete]

Next poll cycle:
GET /api/kanban/board            → detect status change: running→done
                                  → sendSocketNotification(
                                      "HERMES_KANBAN_TASK_COMPLETED", {...})

                                  bridge client receives:
                                  → sendNotification(...)

                                  dashboard: card → green "done" badge
                                    (removed if showCompleted: false)
                                  status: bar → green (if all tasks done)
```

### 6.3 Chat Message Flow

```
CLIENT (hermes-chat)              SERVER (hermes-chat node_helper)
───────────────────              ─────────────────────────────────

User types "hello" → Enter

sendSocketNotification(
  "HERMES_CHAT_SEND",
  { message: "hello" }
)
                                  socketNotificationReceived(
                                    "HERMES_CHAT_SEND", payload)
                                  → POST {gatewayUrl}/api/chat
                                    { message: "hello", session_id }
                                  ← response from gateway

                                  sendSocketNotification(
                                    "HERMES_CHAT_RESPONSE",
                                    { message: "hello",
                                      response: "Hi! How can I help?",
                                      timestamp: ... })

socketNotificationReceived(
  "HERMES_CHAT_RESPONSE", payload)
→ append to message history
→ updateDom()
→ scroll to bottom
```

### 6.4 Module Dependency Graph

```
config/config.js
  └── modules: [...]
        │
        ├── hermes-bridge ──────── depends on: hermes.gatewayUrl
        │     │
        │     └── broadcasts HERMES_KANBAN_* notifications
        │           │
        │           ├──▶ hermes-dashboard  (consumes only)
        │           ├──▶ hermes-status     (consumes only)
        │           └──▶ hermes-chat       (consumes + sends)
        │
        └── hermes-chat ───────── depends on: hermes.gatewayUrl
              │                          (for its own node_helper)
              └── sends HERMES_CHAT_SEND → node_helper → gateway
```

---

## Appendix A: File Changes Summary

| Action | File | Purpose |
|---|---|---|
| Create | `modules/hermes-bridge/hermes-bridge.js` | Bridge client (relay) |
| Create | `modules/hermes-bridge/node_helper.js` | Gateway poller + event emitter |
| Create | `modules/hermes-bridge/README.md` | Module documentation |
| Create | `modules/hermes-dashboard/hermes-dashboard.js` | Kanban card display |
| Create | `modules/hermes-dashboard/hermes-dashboard.css` | Card styles |
| Create | `modules/hermes-dashboard/README.md` | Module documentation |
| Create | `modules/hermes-status/hermes-status.js` | Activity bar |
| Create | `modules/hermes-status/hermes-status.css` | Bar styles |
| Create | `modules/hermes-status/README.md` | Module documentation |
| Create | `modules/hermes-chat/hermes-chat.js` | Chat UI |
| Create | `modules/hermes-chat/node_helper.js` | Gateway chat proxy |
| Create | `modules/hermes-chat/hermes-chat.css` | Chat styles |
| Create | `modules/hermes-chat/README.md` | Module documentation |
| **None** | `js/server.js` | **No changes** |
| **None** | `js/app.js` | **No changes** |
| **None** | `js/node_helper.js` | **No changes** |
| **None** | `js/module.js` | **No changes** |
| **None** | `js/socketclient.js` | **No changes** |

## Appendix B: Architectural Decisions Log

| Decision | Rationale |
|---|---|
| Centralized bridge module | One gateway connection, one polling cycle, one diff engine |
| Standard per-module namespace (not shared `/hermes`) | Zero changes to node_helper.js or socketclient.js |
| Client-side redistribution via `sendNotification()` | Uses existing MM module-to-module broadcast |
| Poll-based (not webhook push) | Simpler initial implementation; no reverse connectivity needed. Webhook can be added later as an optimization |
| No server.js changes | Bridge is a standard module, discovered and loaded like any other |
| `HERMES_` notification prefix | Prevents collision with existing MagicMirror notifications |
| hermes-bridge in hidden region | Module system requires a position; "fullscreen_below" is off-screen |
| Diff-based events (not full snapshot every poll) | Reduces DOM updates for modules that animate on change |
| Periodic full snapshot (every 5th poll) | Catch-up mechanism for missed events or page reload |

## Appendix C: Future Enhancements (Out of Scope)

- **Webhook mode:** Hermes Agent POSTs events to mirror HTTP endpoint instead of polling
- **WebSocket direct:** Bridge connects to Hermes gateway WebSocket for true push
- **Shared `/hermes` namespace:** Custom MMSocket variant that connects to a shared namespace instead of per-module. Reduces one hop in the notification chain
- **Persistent chat history:** Save chat messages to local file or Hermes memory
- **Voice module:** Microphone → STT → Hermes gateway → TTS response
- **Ollama local LLM:** Direct LLM integration without Hermes gateway
- **Touch-optimized UI:** Larger hit targets, swipe gestures for the physical mirror