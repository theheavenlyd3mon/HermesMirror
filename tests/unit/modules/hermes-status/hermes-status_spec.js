// @vitest-environment jsdom

describe("hermes-status", () => {
	let statusModule;

	beforeEach(() => {
		global.Module = {
			register: vi.fn((name, moduleDefinition) => {
				statusModule = moduleDefinition;
			})
		};
		global.Log = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		};

		require("../../../../modules/hermes-status/hermes-status");

		statusModule.config = { ...statusModule.defaults };
		statusModule.name = "hermes-status";
		statusModule.file = vi.fn((path) => `modules/hermes-status/${path}`);
		statusModule.updateDom = vi.fn();
		statusModule.start();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("start", () => {
		it("should initialize empty tasks map", () => {
			expect(statusModule.tasks).toBeInstanceOf(Map);
			expect(statusModule.tasks.size).toBe(0);
		});

		it("should initialize gatewayConnected as true", () => {
			expect(statusModule.gatewayConnected).toBe(true);
		});

		it("should initialize counts at zero", () => {
			expect(statusModule.activeTasks).toBe(0);
			expect(statusModule.blockedTasks).toBe(0);
			expect(statusModule.doneTasks).toBe(0);
		});
	});

	describe("_recomputeCounts", () => {
		it("should count running tasks as active", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule.tasks.set("2", { status: "running" });
			statusModule._recomputeCounts();

			expect(statusModule.activeTasks).toBe(2);
			expect(statusModule.blockedTasks).toBe(0);
		});

		it("should count blocked tasks", () => {
			statusModule.tasks.set("1", { status: "blocked" });
			statusModule._recomputeCounts();

			expect(statusModule.blockedTasks).toBe(1);
		});

		it("should count done tasks", () => {
			statusModule.tasks.set("1", { status: "done" });
			statusModule.tasks.set("2", { status: "done" });
			statusModule.tasks.set("3", { status: "done" });
			statusModule._recomputeCounts();

			expect(statusModule.doneTasks).toBe(3);
		});

		it("should handle mixed statuses", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule.tasks.set("2", { status: "blocked" });
			statusModule.tasks.set("3", { status: "done" });
			statusModule.tasks.set("4", { status: "ready" });
			statusModule._recomputeCounts();

			expect(statusModule.activeTasks).toBe(1);
			expect(statusModule.blockedTasks).toBe(1);
			expect(statusModule.doneTasks).toBe(1);
		});

		it("should reset counts when called again", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule._recomputeCounts();
			expect(statusModule.activeTasks).toBe(1);

			statusModule.tasks.clear();
			statusModule._recomputeCounts();
			expect(statusModule.activeTasks).toBe(0);
		});
	});

	describe("_getState", () => {
		it("should return idle when no tasks", () => {
			expect(statusModule._getState()).toBe("idle");
		});

		it("should return active when running tasks exist", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("active");
		});

		it("should return blocked when blocked tasks exist (even with active)", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule.tasks.set("2", { status: "blocked" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("blocked");
		});

		it("should return done when only done tasks remain", () => {
			statusModule.tasks.set("1", { status: "done" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("done");
		});

		it("should return disconnected when gateway offline with active tasks", () => {
			statusModule.gatewayConnected = false;
			statusModule.tasks.set("1", { status: "running" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("disconnected");
		});

		it("should return disconnected when gateway offline with blocked tasks", () => {
			statusModule.gatewayConnected = false;
			statusModule.tasks.set("1", { status: "blocked" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("disconnected");
		});

		it("should return done when gateway offline but only done tasks", () => {
			statusModule.gatewayConnected = false;
			statusModule.tasks.set("1", { status: "done" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("done");
		});

		it("should prefer blocked over active", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule.tasks.set("2", { status: "blocked" });
			statusModule._recomputeCounts();
			expect(statusModule._getState()).toBe("blocked");
		});
	});

	describe("notificationReceived", () => {
		it("should ignore non-HERMES notifications", () => {
			statusModule.notificationReceived("RANDOM_EVENT", {});
			expect(statusModule.updateDom).not.toHaveBeenCalled();
		});

		it("should handle HERMES_BOARD_STATE", () => {
			statusModule.notificationReceived("HERMES_BOARD_STATE", {
				tasks: [
					{ task_id: "1", status: "running" },
					{ task_id: "2", status: "done" }
				]
			});

			expect(statusModule.tasks.size).toBe(2);
			expect(statusModule.activeTasks).toBe(1);
			expect(statusModule.doneTasks).toBe(1);
			expect(statusModule.updateDom).toHaveBeenCalled();
		});

		it("should replace state on HERMES_BOARD_STATE (not merge)", () => {
			statusModule.tasks.set("old", { status: "running" });
			statusModule.notificationReceived("HERMES_BOARD_STATE", {
				tasks: [{ task_id: "new", status: "ready" }]
			});

			expect(statusModule.tasks.has("old")).toBe(false);
			expect(statusModule.tasks.has("new")).toBe(true);
		});

		it("should handle HERMES_KANBAN_TASK_CREATED", () => {
			statusModule.notificationReceived("HERMES_KANBAN_TASK_CREATED", {
				task_id: "1",
				status: "running"
			});

			expect(statusModule.tasks.get("1")).toEqual({ status: "running" });
		});

		it("should handle HERMES_KANBAN_TASK_DISPATCHED", () => {
			statusModule.tasks.set("1", { status: "ready" });
			statusModule.notificationReceived("HERMES_KANBAN_TASK_DISPATCHED", {
				task_id: "1"
			});

			expect(statusModule.tasks.get("1").status).toBe("running");
		});

		it("should handle HERMES_KANBAN_TASK_COMPLETED", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule.notificationReceived("HERMES_KANBAN_TASK_COMPLETED", {
				task_id: "1"
			});

			expect(statusModule.tasks.get("1").status).toBe("done");
		});

		it("should handle HERMES_KANBAN_TASK_BLOCKED", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule.notificationReceived("HERMES_KANBAN_TASK_BLOCKED", {
				task_id: "1"
			});

			expect(statusModule.tasks.get("1").status).toBe("blocked");
		});

		it("should handle HERMES_KANBAN_TASK_ARCHIVED", () => {
			statusModule.tasks.set("1", { status: "done" });
			statusModule.notificationReceived("HERMES_KANBAN_TASK_ARCHIVED", {
				task_id: "1"
			});

			expect(statusModule.tasks.has("1")).toBe(false);
		});

		it("should handle HERMES_GATEWAY_STATUS", () => {
			statusModule.notificationReceived("HERMES_GATEWAY_STATUS", {
				connected: false
			});

			expect(statusModule.gatewayConnected).toBe(false);
		});

		it("should safely handle null payload on BOARD_STATE", () => {
			expect(() => {
				statusModule.notificationReceived("HERMES_BOARD_STATE", null);
			}).not.toThrow();
		});

		it("should safely handle missing task_id on TASK_CREATED", () => {
			expect(() => {
				statusModule.notificationReceived("HERMES_KANBAN_TASK_CREATED", { status: "ready" });
			}).not.toThrow();
		});
	});

	describe("getDom", () => {
		it("should return a wrapper with hermes-status class", () => {
			const dom = statusModule.getDom();
			expect(dom.classList.contains("hermes-status")).toBe(true);
		});

		it("should contain a bar element", () => {
			const dom = statusModule.getDom();
			const bar = dom.querySelector(".hermes-status__bar");
			expect(bar).not.toBeNull();
		});

		it("should apply idle state by default", () => {
			const dom = statusModule.getDom();
			const bar = dom.querySelector(".hermes-status__bar");
			expect(bar.classList.contains("hermes-status__bar--idle")).toBe(true);
			expect(bar.style.backgroundColor).toBe("rgb(51, 51, 51)");
		});

		it("should apply active state with orange color", () => {
			statusModule.tasks.set("1", { status: "running" });
			statusModule._recomputeCounts();
			const dom = statusModule.getDom();
			const bar = dom.querySelector(".hermes-status__bar");

			expect(bar.classList.contains("hermes-status__bar--active")).toBe(true);
			expect(bar.style.backgroundColor).toBe("rgb(243, 156, 18)");
		});

		it("should apply blocked state with red color", () => {
			statusModule.tasks.set("1", { status: "blocked" });
			statusModule._recomputeCounts();
			const dom = statusModule.getDom();
			const bar = dom.querySelector(".hermes-status__bar");

			expect(bar.classList.contains("hermes-status__bar--blocked")).toBe(true);
			expect(bar.style.backgroundColor).toBe("rgb(231, 76, 60)");
		});

		it("should apply done state with green color", () => {
			statusModule.tasks.set("1", { status: "done" });
			statusModule._recomputeCounts();
			const dom = statusModule.getDom();
			const bar = dom.querySelector(".hermes-status__bar");

			expect(bar.classList.contains("hermes-status__bar--done")).toBe(true);
			expect(bar.style.backgroundColor).toBe("rgb(39, 174, 96)");
		});

		it("should apply configurable height", () => {
			statusModule.config.height = "8px";
			const dom = statusModule.getDom();
			const bar = dom.querySelector(".hermes-status__bar");
			expect(bar.style.height).toBe("8px");
		});
	});
});
