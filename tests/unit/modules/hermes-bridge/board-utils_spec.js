const { diffBoardState, statusToEvent, clamp } = require("../../../../modules/hermes-bridge/board-utils");

describe("board-utils", () => {
	describe("diffBoardState", () => {
		it("should return empty array when both states have no tasks", () => {
			expect(diffBoardState(null, { tasks: [] })).toEqual([]);
		});

		it("should return empty array when states are identical", () => {
			const tasks = [{ task_id: "1", title: "Test", status: "ready" }];
			expect(diffBoardState({ tasks }, { tasks })).toEqual([]);
		});

		it("should emit TASK_CREATED for new tasks", () => {
			const prev = { tasks: [] };
			const curr = { tasks: [{ task_id: "1", title: "New task", status: "ready" }] };
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_CREATED");
			expect(events[0].payload.task_id).toBe("1");
		});

		it("should emit TASK_DISPATCHED when status changes to running", () => {
			const prev = { tasks: [{ task_id: "1", status: "ready" }] };
			const curr = { tasks: [{ task_id: "1", status: "running" }] };
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_DISPATCHED");
		});

		it("should emit TASK_COMPLETED when status changes to done", () => {
			const prev = { tasks: [{ task_id: "1", status: "running" }] };
			const curr = { tasks: [{ task_id: "1", status: "done" }] };
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_COMPLETED");
		});

		it("should emit TASK_BLOCKED when status changes to blocked", () => {
			const prev = { tasks: [{ task_id: "1", status: "running" }] };
			const curr = { tasks: [{ task_id: "1", status: "blocked" }] };
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_BLOCKED");
		});

		it("should emit TASK_ARCHIVED when a task disappears from current state", () => {
			const prev = { tasks: [{ task_id: "1", title: "Gone", status: "done" }] };
			const curr = { tasks: [] };
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_ARCHIVED");
			expect(events[0].payload.status).toBe("archived");
		});

		it("should not emit event for unknown status transitions", () => {
			const prev = { tasks: [{ task_id: "1", status: "ready" }] };
			const curr = { tasks: [{ task_id: "1", status: "custom" }] };
			const events = diffBoardState(prev, curr);

			expect(events).toEqual([]);
		});

		it("should handle multiple tasks in a single diff", () => {
			const prev = {
				tasks: [
					{ task_id: "1", status: "ready" },
					{ task_id: "2", status: "running" }
				]
			};
			const curr = {
				tasks: [
					{ task_id: "1", status: "running" },
					{ task_id: "2", status: "done" },
					{ task_id: "3", status: "ready" }
				]
			};
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(3);
			expect(events.map((e) => e.type).sort()).toEqual([
				"HERMES_KANBAN_TASK_COMPLETED",
				"HERMES_KANBAN_TASK_CREATED",
				"HERMES_KANBAN_TASK_DISPATCHED"
			]);
		});

		it("should handle null previous state (first fetch)", () => {
			const curr = {
				tasks: [
					{ task_id: "1", status: "ready" },
					{ task_id: "2", status: "running" }
				]
			};
			const events = diffBoardState(null, curr);

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_CREATED");
			expect(events[1].type).toBe("HERMES_KANBAN_TASK_CREATED");
		});

		it("should handle previous state with null tasks array", () => {
			const prev = { tasks: null };
			const curr = { tasks: [{ task_id: "1", status: "ready" }] };
			const events = diffBoardState(prev, curr);

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("HERMES_KANBAN_TASK_CREATED");
		});

		it("should shallow-copy archived task payload (no mutation)", () => {
			const original = { task_id: "1", title: "Done", status: "done" };
			const prev = { tasks: [original] };
			const curr = { tasks: [] };
			const events = diffBoardState(prev, curr);

			expect(events[0].payload.status).toBe("archived");
			expect(original.status).toBe("done"); // original unchanged
		});
	});

	describe("statusToEvent", () => {
		it("should map running to TASK_DISPATCHED", () => {
			expect(statusToEvent("running")).toBe("HERMES_KANBAN_TASK_DISPATCHED");
		});

		it("should map done to TASK_COMPLETED", () => {
			expect(statusToEvent("done")).toBe("HERMES_KANBAN_TASK_COMPLETED");
		});

		it("should map blocked to TASK_BLOCKED", () => {
			expect(statusToEvent("blocked")).toBe("HERMES_KANBAN_TASK_BLOCKED");
		});

		it("should return null for ready", () => {
			expect(statusToEvent("ready")).toBeNull();
		});

		it("should return null for unknown status", () => {
			expect(statusToEvent("custom")).toBeNull();
		});

		it("should return null for empty string", () => {
			expect(statusToEvent("")).toBeNull();
		});
	});

	describe("clamp", () => {
		it("should return value when within range", () => {
			expect(clamp(5, 0, 10)).toBe(5);
		});

		it("should return min when value is below range", () => {
			expect(clamp(-5, 0, 10)).toBe(0);
		});

		it("should return max when value is above range", () => {
			expect(clamp(15, 0, 10)).toBe(10);
		});

		it("should return min when value equals min", () => {
			expect(clamp(0, 0, 10)).toBe(0);
		});

		it("should return max when value equals max", () => {
			expect(clamp(10, 0, 10)).toBe(10);
		});

		it("should work with negative ranges", () => {
			expect(clamp(0, -10, -1)).toBe(-1);
		});

		it("should work with floats", () => {
			expect(clamp(1.5, 0, 2)).toBe(1.5);
			expect(clamp(3.7, 0, 2)).toBe(2);
		});
	});
});
