Module.register("hermes-status", {
	// Module config defaults
	defaults: {
		height: "4px",
		pulseSpeed: 2000,
		showGatewayStatus: true
	},

	start () {
		Log.info(`Starting module: ${this.name}`);

		// Task state tracking
		this.tasks = new Map(); // task_id -> { status }
		this.gatewayConnected = true;

		// Aggregated counts
		this.activeTasks = 0;
		this.blockedTasks = 0;
		this.doneTasks = 0;
	},

	/**
	 * Compute aggregated counts from the task map.
	 */
	_recomputeCounts () {
		this.activeTasks = 0;
		this.blockedTasks = 0;
		this.doneTasks = 0;

		for (const [, task] of this.tasks) {
			switch (task.status) {
				case "running":
					this.activeTasks++;
					break;
				case "blocked":
					this.blockedTasks++;
					break;
				case "done":
					this.doneTasks++;
					break;
			}
		}
	},

	/**
	 * Determine the current visual state label.
	 * @returns {"idle"|"active"|"blocked"|"done"|"disconnected"} current visual state
	 */
	_getState () {
		if (this.config.showGatewayStatus && !this.gatewayConnected && (this.activeTasks > 0 || this.blockedTasks > 0)) {
			return "disconnected";
		}
		if (this.blockedTasks > 0) {
			return "blocked";
		}
		if (this.activeTasks > 0) {
			return "active";
		}
		if (this.doneTasks > 0 && this.activeTasks === 0 && this.blockedTasks === 0) {
			return "done";
		}
		return "idle";
	},

	notificationReceived (notification, payload) {
		// Only handle hermes events
		if (!notification.startsWith("HERMES_")) {
			return;
		}

		switch (notification) {
			case "HERMES_BOARD_STATE": {
				// Full board snapshot — replace all state
				this.tasks.clear();
				if (payload && Array.isArray(payload.tasks)) {
					for (const task of payload.tasks) {
						if (task.task_id && task.status) {
							this.tasks.set(task.task_id, { status: task.status });
						}
					}
				}
				this._recomputeCounts();
				this.updateDom();
				break;
			}

			case "HERMES_KANBAN_TASK_CREATED": {
				if (payload && payload.task_id && payload.status) {
					this.tasks.set(payload.task_id, { status: payload.status });
				}
				this._recomputeCounts();
				this.updateDom();
				break;
			}

			case "HERMES_KANBAN_TASK_DISPATCHED": {
				if (payload && payload.task_id) {
					this.tasks.set(payload.task_id, { status: "running" });
				}
				this._recomputeCounts();
				this.updateDom();
				break;
			}

			case "HERMES_KANBAN_TASK_COMPLETED": {
				if (payload && payload.task_id) {
					this.tasks.set(payload.task_id, { status: "done" });
				}
				this._recomputeCounts();
				this.updateDom();
				break;
			}

			case "HERMES_KANBAN_TASK_BLOCKED": {
				if (payload && payload.task_id) {
					this.tasks.set(payload.task_id, { status: "blocked" });
				}
				this._recomputeCounts();
				this.updateDom();
				break;
			}

			case "HERMES_KANBAN_TASK_ARCHIVED": {
				if (payload && payload.task_id) {
					this.tasks.delete(payload.task_id);
				}
				this._recomputeCounts();
				this.updateDom();
				break;
			}

			case "HERMES_GATEWAY_STATUS": {
				if (payload && typeof payload.connected === "boolean") {
					this.gatewayConnected = payload.connected;
				}
				this.updateDom();
				break;
			}
		}
	},

	getDom () {
		const state = this._getState();

		const wrapper = document.createElement("div");
		wrapper.classList.add("hermes-status");

		const bar = document.createElement("div");
		bar.classList.add("hermes-status__bar");
		bar.classList.add(`hermes-status__bar--${state}`);

		// Apply configurable height
		bar.style.height = this.config.height;

		// Apply per-state colors inline (CSS transitions handle the shift)
		switch (state) {
			case "idle":
				bar.style.backgroundColor = "#333";
				bar.style.opacity = "0.3";
				break;
			case "active":
				bar.style.animationDuration = `${this.config.pulseSpeed}ms`;
				bar.style.backgroundColor = "#f39c12";
				bar.style.opacity = "1.0";
				break;
			case "blocked":
				bar.style.backgroundColor = "#e74c3c";
				bar.style.opacity = "1.0";
				break;
			case "done":
				bar.style.backgroundColor = "#27ae60";
				bar.style.opacity = "1.0";
				break;
			case "disconnected":
				bar.style.animationDuration = `${this.config.pulseSpeed}ms`;
				bar.style.backgroundColor = "#e74c3c";
				bar.style.opacity = "0.5";
				break;
		}

		wrapper.appendChild(bar);
		return wrapper;
	}
});
