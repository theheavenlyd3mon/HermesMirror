# hermes-status — Ambient Activity Bar

A Calm Tech Level 1 module for HermesMirror. Displays a single
color-transitioning horizontal bar that indicates your Hermes agent's
kanban board state without words, numbers, or interruption.

## Visual States

| Color | State | What it means |
|---|---|---|
| Dim grey | Idle | No tasks running or blocked. The bar is barely visible. |
| Warm amber (pulsing) | Active | One or more tasks are running. Something is happening. |
| Attention red | Blocked | One or more tasks need human input. Look at the board. |
| Cool green | Done | All tasks are complete. Nothing is running or blocked. |
| Dim red (pulsing) | Disconnected | Gateway unreachable while tasks are pending. |

The bar uses a 2-second smooth color transition so state changes
are visible but not jarring.

## Config

Add to `config.js`:

```js
{
  module: "hermes-status",
  position: "top_bar",
  config: {
    height: "4px",
    pulseSpeed: 2000,
    showGatewayStatus: true
  }
}
```

| Option | Default | Description |
|---|---|---|
| `height` | `"4px"` | CSS height of the bar |
| `pulseSpeed` | `2000` | Pulse animation duration in ms |
| `showGatewayStatus` | `true` | Dim and pulse red when gateway unreachable |

## Dependencies

- `hermes-bridge` module must be installed and configured. The bridge
  polls the Hermes gateway and emits notifications this module consumes.

## Calm Tech

This module is Calm Tech Level 1 — periphery only, zero text, never
interrupts. The bar occupies minimal screen real estate and uses color
as its only signal. It is designed to be visible in peripheral vision
without demanding attention.
