/**
 * Pure functions for board state diffing and task event mapping.
 * No MagicMirror dependencies — testable anywhere.
 */

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

module.exports = { diffBoardState, statusToEvent, clamp };
