# Hermes Dashboard

Live kanban board for your agent team — renders running tasks as color-coded
cards on your MagicMirror.

## Features

- Cards grouped by status: **ready** (blue), **running** (amber), **done**
  (green), **blocked** (red)
- Auto-updates on every kanban event via `HERMES_KANBAN_*` notifications
- Configurable task cap and completed-task visibility
- Subtle CSS transitions on status changes
- Gateway offline indicator

## Config

Add to `config/config.js`:

```js
{
  module: "hermes-dashboard",
  position: "top_right",
  config: {
    maxTasks: 10,           // Max cards to show
    showCompleted: false    // Hide done tasks by default
  }
}
```

**Requires:** `hermes-bridge` module (distributes kanban events from the Hermes
gateway).

## Screenshot

<!-- TODO: replace with actual screenshot -->
![Dashboard screenshot placeholder](screenshot.png)
