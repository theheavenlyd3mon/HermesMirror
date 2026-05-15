const NodeHelper = require("node_helper");
const Log = require("logger");

/**
 * Diff two board states and return individual task events.
 * @param {object|null} previous - Last known board state { tasks: [...], updated_at }
 * @param {object} current - Current board state { tasks: [...], updated_at }
 * @returns {Array<{type: string, payload: object}>}
 */
function diffBoardState(previous, current) {
	const prevMap = new Map();
	const currMap = new Map();
	const events = [];

	if (previous && previous.tasks) {
		for (const t of previous.tasks) {
			prevMap.set(t.task_id, t);
		}
	}

	for (const t of current.tasks) {
		currMap.set(t.task_id, t);
	}

	for (const [id, task] of currMap) {
		const prev = prevMap.get(id);
		if (!prev) {
			events.push({ type: "HERMES_KANBAN_TASK_CREATED", payload: task });
		} else if (prev.status !== task.status) {
			const eventType = statusToEvent(task.status);
			if (eventType) {
				events.push({ type: eventType, payload: task });
			}
		}
	}

	for (const id of prevMap.keys()) {
		if (!currMap.has(id)) {
			const archived = { ...prevMap.get(id), status: "archived" };
			events.push({ type: "HERMES_KANBAN_TASK_ARCHIVED", payload: archived });
		}
	}

	return events;
}

/**
 * Map kanban status to event type.
 * @param {string} status
 * @returns {string|null}
 */
function statusToEvent(status) {
	switch (status) {
		case "running":
			return "HERMES_KANBAN_TASK_DISPATCHED";
		case "done":
			return "HERMES_KANBAN_TASK_COMPLETED";
		case "blocked":
			return "HERMES_KANBAN_TASK_BLOCKED";
		default:
			return null;
	}
}

/**
 * Clamp a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
	return Math.min(max, Math.max(min, val));
}

module.exports = NodeHelper.create({
	config: {},

	/** Last known board state from gateway. null until first successful fetch. */
	lastState: null,

	/** Current poll interval in ms (varies with backoff). */
	currentInterval: null,

	/** The setInterval handle for the poll timer. */
	pollTimer: null,

	/** Count of completed polls since last board state heartbeat. */
	pollCount: 0,

	/** Timestamp of last successful gateway contact. */
	lastOkAt: null,

	/** Base poll interval in ms (from config). */
	baseInterval: null,

	/** Current retry delay in ms for backoff after gateway fetch failures. Reset to null on success. */
	retryDelay: null,

	start() {
		Log.log(`Starting node helper for: ${this.name}`);

		// Use config from MM framework if available, or fall back to defaults.
		// This allows the bridge to work in headless/server-only mode where
		// no browser client sends CONFIG via socket.
		const config = this.config && this.config.gatewayUrl ? this.config : {
			gatewayUrl: "http://127.0.0.1:8643",
			refreshInterval: 30
		};

		this._initPolling(config);
	},

	/**
	 * Initialize polling with the given config.
	 * Extracted so it can be called from start() and from CONFIG notification.
	 * @param {object} cfg - Module configuration with gatewayUrl and refreshInterval
	 */
	_initPolling(cfg) {
		this.config = cfg;

		if (!this.config.gatewayUrl) {
			Log.error(`[${this.name}] No gatewayUrl configured — polling disabled`);
			return;
		}

		if (!this.config.refreshInterval || this.config.refreshInterval < 1) {
			Log.warn(`[${this.name}] refreshInterval ${this.config.refreshInterval} invalid, using default 30s`);
			this.config.refreshInterval = 30;
		}

		this.baseInterval = this.config.refreshInterval * 1000;
		this.currentInterval = this.baseInterval;
		this.lastState = null;
		this.pollCount = 0;

		Log.log(`[${this.name}] Starting gateway poll: ${this.config.gatewayUrl} every ${this.config.refreshInterval}s`);

		// Clear existing timer if restarting
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}

		// Immediate first fetch, then interval
		this.fetchAndDiff();
		this.pollTimer = setInterval(() => {
			this.fetchAndDiff();
		}, this.baseInterval);
	},

	/**
	 * Receive config from client on DOM_OBJECTS_CREATED.
	 * Updates config and re-initializes polling if bridge was running
	 * with default config from start().
	 * @param {string} notification
	 * @param {object} payload
	 */
	socketNotificationReceived(notification, payload) {
		if (notification === "CONFIG") {
			this._initPolling(payload);
		}
	},

	/**
	 * Stop the poll timer on shutdown.
	 */
	stop() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		Log.log(`Stopping node helper for: ${this.name}`);
	},

	/**
	 * Fetch the current board from gateway, diff against lastState,
	 * and emit events.
	 */
	async fetchAndDiff() {
		const url = `${this.config.gatewayUrl}/api/kanban/board`;

		let response;
		try {
			response = await fetch(url);
		} catch (err) {
			this.handleFetchError(err);
			return;
		}

		if (!response.ok) {
			this.handleFetchError(new Error(`Gateway returned ${response.status}: ${response.statusText}`));
			return;
		}

		let current;
		try {
			current = await response.json();
		} catch (err) {
			this.handleFetchError(new Error(`Invalid JSON from gateway: ${err.message}`));
			return;
		}

		// Validate payload shape
		if (!current || !Array.isArray(current.tasks)) {
			this.handleFetchError(new Error("Invalid board payload: missing tasks array"));
			return;
		}

		// Success — reset backoff
		this.currentInterval = this.baseInterval;
		this.retryDelay = null;
		this.pollCount++;
		this.lastOkAt = Date.now();

		// Emit gateway connected
		this.sendSocketNotification("HERMES_GATEWAY_STATUS", {
			connected: true,
			error: null,
			last_ok_at: this.lastOkAt
		});

		if (this.lastState) {
			// Diff against previous state
			const events = diffBoardState(this.lastState, current);
			for (const ev of events) {
				this.sendSocketNotification(ev.type, ev.payload);
			}
		} else {
			// First poll — send full board state
			this.sendSocketNotification("HERMES_BOARD_STATE", {
				tasks: current.tasks,
				updated_at: current.updated_at || Date.now()
			});
		}

		// Store for next diff
		this.lastState = current;

		// Heartbeat: full board state every 5th poll
		if (this.pollCount % 5 === 0) {
			this.sendSocketNotification("HERMES_BOARD_STATE", {
				tasks: current.tasks,
				updated_at: current.updated_at || Date.now()
			});
		}
	},

	/**
	 * Handle fetch failure with exponential backoff.
	 * @param {Error} err
	 */
	handleFetchError(err) {
		Log.error(`[${this.name}] Gateway fetch failed: ${err.message}`);

		// Emit disconnected status
		this.sendSocketNotification("HERMES_GATEWAY_STATUS", {
			connected: false,
			error: err.message,
			last_ok_at: this.lastOkAt
		});

		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, cap at 30s
		if (this.retryDelay === null) {
			this.retryDelay = 1000;
		} else {
			this.retryDelay = Math.min(this.retryDelay * 2, 30000);
		}

		Log.warn(`[${this.name}] Backoff: retrying in ${this.retryDelay / 1000}s`);

		// Clear existing timer and schedule retry
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}

		setTimeout(() => {
			this.fetchAndDiff();
			// Resume normal interval after retry
			this.pollTimer = setInterval(() => {
				this.fetchAndDiff();
			}, this.baseInterval);
		}, this.retryDelay);
	}
});