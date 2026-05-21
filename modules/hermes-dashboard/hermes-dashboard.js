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
		visible.sort((a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4));

		// Cap at maxTasks
		visible = visible.slice(0, this.config.maxTasks);

		if (visible.length === 0) {
			wrapper.appendChild(this._renderEmpty());
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
	 * Render the empty state with a checkmark icon.
	 */
	_renderEmpty () {
		const container = document.createElement("div");
		container.className = "hermes-dashboard-empty";

		const icon = document.createElement("div");
		icon.className = "hermes-dashboard-empty-icon";
		icon.textContent = "✓";

		const text = document.createElement("div");
		text.className = "hermes-dashboard-empty-text";
		text.textContent = "All clear";

		const sub = document.createElement("div");
		sub.className = "hermes-dashboard-empty-sub";
		sub.textContent = "no active tasks";

		container.appendChild(icon);
		container.appendChild(text);
		container.appendChild(sub);

		return container;
	},

	/**
	 * Get a status icon (emoji) for a given task status.
	 * @param {string} status
	 * @returns {string}
	 */
	_statusIcon (status) {
		switch (status) {
			case "blocked": return "🚫";
			case "running": return "🔄";
			case "ready":   return "⚡";
			case "done":    return "✅";
			default:        return "○";
		}
	},

	/**
	 * Get the priority level (1-3) for a task, defaulting to 2.
	 * @param {object} task
	 * @returns {number}
	 */
	_priorityLevel (task) {
		const p = parseInt(task.priority, 10);
		if (p === 1) return 1;
		if (p === 2) return 2;
		return 3;
	},

	/**
	 * Get the priority CSS class for a priority level.
	 * @param {number} level 1-3
	 * @returns {string}
	 */
	_priorityClass (level) {
		switch (level) {
			case 1: return "hermes-card-priority-high";
			case 2: return "hermes-card-priority-medium";
			default: return "hermes-card-priority-low";
		}
	},

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
	 * Render a single task as a card DOM element — Glass + Glow style.
	 * @param task
	 */
	_renderCard (task) {
		const card = document.createElement("div");
		card.className = `hermes-card hermes-card-${task.status}`;

		// Header row: title + icon badge
		const header = document.createElement("div");
		header.className = "hermes-card-header";

		const title = document.createElement("div");
		title.className = "hermes-card-title";
		title.textContent = task.title || "(untitled)";

		const icon = document.createElement("span");
		icon.className = "hermes-card-icon";
		icon.textContent = this._statusIcon(task.status);

		header.appendChild(title);
		header.appendChild(icon);
		card.appendChild(header);

		// Meta row: assignee (with priority dot) + status label
		const meta = document.createElement("div");
		meta.className = "hermes-card-meta";

		const assignee = document.createElement("span");
		assignee.className = "hermes-card-assignee";

		if (task.assignee) {
			const priority = this._priorityLevel(task);
			const dot = document.createElement("span");
			dot.className = `hermes-card-priority-dot ${this._priorityClass(priority)}`;
			assignee.appendChild(dot);
			assignee.appendChild(document.createTextNode(task.assignee));
		} else {
			assignee.textContent = "\u2014";
		}

		const statusLabel = document.createElement("span");
		statusLabel.className = "hermes-card-meta-status";
		statusLabel.textContent = task.status;

		meta.appendChild(assignee);
		meta.appendChild(statusLabel);
		card.appendChild(meta);

		return card;
	}
});