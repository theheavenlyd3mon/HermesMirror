/* Hermes Dashboard — Kanban task display module */

Module.register("hermes-dashboard", {

	// Default module config
	defaults: {
		maxTasks: 10,
		showCompleted: false,
		animationSpeed: 300
	},

	/**
	 * Initialize module state.
	 */
	start () {
		Log.info("Starting module: hermes-dashboard");
		this.tasks = [];
		this.gatewayStatus = null;
	},

	/**
	 * Register the CSS file for this module.
	 */
	getStyles () {
		return [this.file("hermes-dashboard.css")];
	},

	/**
	 * Handle incoming notifications from the hermes-bridge.
	 * Rebuilds task state and re-renders DOM on every event.
	 * @param notification
	 * @param payload
	 */
	notificationReceived (notification, payload) {
		switch (notification) {
			case "HERMES_BOARD_STATE":
				this.tasks = (payload.tasks || []).slice();
				break;
			case "HERMES_KANBAN_TASK_CREATED":
				this._upsertTask(payload);
				break;
			case "HERMES_KANBAN_TASK_DISPATCHED":
			case "HERMES_KANBAN_TASK_COMPLETED":
			case "HERMES_KANBAN_TASK_BLOCKED":
				this._upsertTask(payload);
				break;
			case "HERMES_KANBAN_TASK_ARCHIVED":
				this.tasks = this.tasks.filter((t) => t.task_id !== payload.task_id);
				break;
			case "HERMES_GATEWAY_STATUS":
				this.gatewayStatus = payload;
				break;
			default:
				// Silently ignore unknown HERMES_* notifications
				return;
		}

		this.updateDom(this.config.animationSpeed || 0);
	},

	/**
	 * Build and return the dashboard DOM element.
	 */
	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "hermes-dashboard";

		if (this.gatewayStatus && !this.gatewayStatus.connected) {
			const offline = document.createElement("div");
			offline.className = "hermes-dashboard-offline";
			offline.innerHTML = "● Gateway offline";
			wrapper.appendChild(offline);
		}

		// Filter tasks by visibility rules
		let visible = this.tasks.filter((task) => {
			if (task.status === "done" && !this.config.showCompleted) return false;
			if (task.status === "archived") return false;
			return true;
		});

		// Sort: blocked first, then running, then ready, then done
		const statusOrder = { blocked: 0, running: 1, ready: 2, done: 3 };
		visible.sort((a, b) => (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4));

		// Cap at maxTasks
		visible = visible.slice(0, this.config.maxTasks);

		if (visible.length === 0) {
			const empty = document.createElement("div");
			empty.className = "hermes-dashboard-empty";
			empty.innerHTML = "All clear — no active tasks";
			wrapper.appendChild(empty);
			return wrapper;
		}

		for (const task of visible) {
			wrapper.appendChild(this._renderCard(task));
		}

		return wrapper;
	},

	// ------------------------------------------------------------------
	// Private helpers
	// ------------------------------------------------------------------

	/**
	 * Insert or update a task in the local tasks array by task_id.
	 * @param payload
	 */
	_upsertTask (payload) {
		const idx = this.tasks.findIndex((t) => t.task_id === payload.task_id);
		if (idx >= 0) {
			this.tasks[idx] = payload;
		} else {
			this.tasks.push(payload);
		}
	},

	/**
	 * Render a single task as a card DOM element.
	 * @param task
	 */
	_renderCard (task) {
		const card = document.createElement("div");
		card.className = `hermes-card hermes-card-${task.status}`;

		const title = document.createElement("div");
		title.className = "hermes-card-title";
		title.textContent = task.title || "(untitled)";

		const assignee = document.createElement("div");
		assignee.className = "hermes-card-assignee";
		assignee.textContent = task.assignee || "";

		const status = document.createElement("div");
		status.className = `hermes-card-status hermes-card-status-${task.status}`;
		status.textContent = task.status;

		card.appendChild(title);
		card.appendChild(assignee);
		card.appendChild(status);

		return card;
	}
});
