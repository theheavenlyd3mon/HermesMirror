// @vitest-environment jsdom

describe("hermes-dashboard", () => {
	let dashboard;

	beforeEach(() => {
		// Mock global dependencies
		global.Module = {
			register: vi.fn((name, moduleDefinition) => {
				dashboard = moduleDefinition;
			})
		};
		global.Log = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		};

		// Load the module
		require("../../../../modules/hermes-dashboard/hermes-dashboard");

		// Setup module instance
		dashboard.config = { ...dashboard.defaults };
		dashboard.name = "hermes-dashboard";
		dashboard.file = vi.fn((path) => `modules/hermes-dashboard/${path}`);
		dashboard.updateDom = vi.fn();
		dashboard.start();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("start", () => {
		it("should initialize empty tasks array", () => {
			expect(dashboard.tasks).toEqual([]);
		});

		it("should initialize gatewayStatus as null", () => {
			expect(dashboard.gatewayStatus).toBeNull();
		});
	});

	describe("notificationReceived", () => {
		it("should handle HERMES_BOARD_STATE by replacing tasks", () => {
			const tasks = [
				{ task_id: "1", title: "A", status: "ready" },
				{ task_id: "2", title: "B", status: "running" }
			];
			dashboard.notificationReceived("HERMES_BOARD_STATE", { tasks });

			expect(dashboard.tasks).toHaveLength(2);
			expect(dashboard.updateDom).toHaveBeenCalledWith(300);
		});

		it("should handle HERMES_BOARD_STATE with null tasks", () => {
			dashboard.notificationReceived("HERMES_BOARD_STATE", {});
			expect(dashboard.tasks).toEqual([]);
		});

		it("should handle HERMES_KANBAN_TASK_CREATED", () => {
			dashboard.notificationReceived("HERMES_KANBAN_TASK_CREATED", {
				task_id: "1",
				title: "New",
				status: "ready"
			});

			expect(dashboard.tasks).toHaveLength(1);
			expect(dashboard.tasks[0].title).toBe("New");
		});

		it("should handle HERMES_KANBAN_TASK_DISPATCHED", () => {
			dashboard.tasks = [{ task_id: "1", status: "ready" }];
			dashboard.notificationReceived("HERMES_KANBAN_TASK_DISPATCHED", {
				task_id: "1",
				status: "running"
			});

			expect(dashboard.tasks[0].status).toBe("running");
		});

		it("should handle HERMES_KANBAN_TASK_COMPLETED", () => {
			dashboard.tasks = [{ task_id: "1", status: "running" }];
			dashboard.notificationReceived("HERMES_KANBAN_TASK_COMPLETED", {
				task_id: "1",
				status: "done"
			});

			expect(dashboard.tasks[0].status).toBe("done");
		});

		it("should handle HERMES_KANBAN_TASK_BLOCKED", () => {
			dashboard.tasks = [{ task_id: "1", status: "running" }];
			dashboard.notificationReceived("HERMES_KANBAN_TASK_BLOCKED", {
				task_id: "1",
				status: "blocked"
			});

			expect(dashboard.tasks[0].status).toBe("blocked");
		});

		it("should handle HERMES_KANBAN_TASK_ARCHIVED by removing task", () => {
			dashboard.tasks = [
				{ task_id: "1", status: "done" },
				{ task_id: "2", status: "running" }
			];
			dashboard.notificationReceived("HERMES_KANBAN_TASK_ARCHIVED", {
				task_id: "1"
			});

			expect(dashboard.tasks).toHaveLength(1);
			expect(dashboard.tasks[0].task_id).toBe("2");
		});

		it("should handle HERMES_GATEWAY_STATUS", () => {
			dashboard.notificationReceived("HERMES_GATEWAY_STATUS", {
				connected: true,
				url: "http://localhost:8643"
			});

			expect(dashboard.gatewayStatus.connected).toBe(true);
		});

		it("should ignore unknown notifications", () => {
			dashboard.notificationReceived("UNKNOWN_EVENT", {});
			expect(dashboard.updateDom).not.toHaveBeenCalled();
		});
	});

	describe("_upsertTask", () => {
		it("should insert a new task", () => {
			dashboard._upsertTask({ task_id: "1", title: "New" });
			expect(dashboard.tasks).toHaveLength(1);
		});

		it("should update an existing task", () => {
			dashboard.tasks = [{ task_id: "1", title: "Old", status: "ready" }];
			dashboard._upsertTask({ task_id: "1", title: "Updated", status: "running" });

			expect(dashboard.tasks).toHaveLength(1);
			expect(dashboard.tasks[0].title).toBe("Updated");
			expect(dashboard.tasks[0].status).toBe("running");
		});
	});

	describe("_statusIcon", () => {
		it("should return correct icons for each status", () => {
			expect(dashboard._statusIcon("blocked")).toBe("🚫");
			expect(dashboard._statusIcon("running")).toBe("🔄");
			expect(dashboard._statusIcon("ready")).toBe("⚡");
			expect(dashboard._statusIcon("done")).toBe("✅");
		});

		it("should return default icon for unknown status", () => {
			expect(dashboard._statusIcon("custom")).toBe("○");
		});
	});

	describe("_priorityLevel", () => {
		it("should return 1 for high priority", () => {
			expect(dashboard._priorityLevel({ priority: 1 })).toBe(1);
		});

		it("should return 2 for medium priority", () => {
			expect(dashboard._priorityLevel({ priority: 2 })).toBe(2);
		});

		it("should return 3 (default) when no priority set", () => {
			expect(dashboard._priorityLevel({})).toBe(3);
		});

		it("should return 3 for unknown priority", () => {
			expect(dashboard._priorityLevel({ priority: 99 })).toBe(3);
		});

		it("should parse string priorities", () => {
			expect(dashboard._priorityLevel({ priority: "1" })).toBe(1);
			expect(dashboard._priorityLevel({ priority: "2" })).toBe(2);
		});
	});

	describe("_priorityClass", () => {
		it("should return correct CSS classes", () => {
			expect(dashboard._priorityClass(1)).toBe("hermes-card-priority-high");
			expect(dashboard._priorityClass(2)).toBe("hermes-card-priority-medium");
			expect(dashboard._priorityClass(3)).toBe("hermes-card-priority-low");
		});

		it("should return low priority class for unknown levels", () => {
			expect(dashboard._priorityClass(99)).toBe("hermes-card-priority-low");
		});
	});

	describe("_renderEmpty", () => {
		it("should return an element with correct class", () => {
			const el = dashboard._renderEmpty();
			expect(el.className).toBe("hermes-dashboard-empty");
		});

		it("should contain icon, text, and sub elements", () => {
			const el = dashboard._renderEmpty();
			expect(el.children).toHaveLength(3);
			expect(el.children[0].className).toBe("hermes-dashboard-empty-icon");
			expect(el.children[1].className).toBe("hermes-dashboard-empty-text");
			expect(el.children[2].className).toBe("hermes-dashboard-empty-sub");
		});

		it("should show checkmark icon", () => {
			const el = dashboard._renderEmpty();
			expect(el.children[0].textContent).toBe("✓");
		});
	});

	describe("_renderCard", () => {
		it("should create a card with status class", () => {
			const card = dashboard._renderCard({ task_id: "1", title: "Test", status: "running" });
			expect(card.className).toContain("hermes-card");
			expect(card.className).toContain("hermes-card-running");
		});

		it("should show (untitled) when no title", () => {
			const card = dashboard._renderCard({ task_id: "1", status: "ready" });
			const title = card.querySelector(".hermes-card-title");
			expect(title.textContent).toBe("(untitled)");
		});

		it("should render header with title and icon", () => {
			const card = dashboard._renderCard({ task_id: "1", title: "Fix bug", status: "blocked" });
			const header = card.querySelector(".hermes-card-header");
			const title = header.querySelector(".hermes-card-title");
			const icon = header.querySelector(".hermes-card-icon");

			expect(title.textContent).toBe("Fix bug");
			expect(icon.textContent).toBe("🚫");
		});

		it("should render meta row with assignee and status", () => {
			const card = dashboard._renderCard({
				task_id: "1",
				title: "Test",
				status: "running",
				assignee: "coder"
			});
			const meta = card.querySelector(".hermes-card-meta");
			const assignee = meta.querySelector(".hermes-card-assignee");
			const statusLabel = meta.querySelector(".hermes-card-meta-status");

			expect(assignee.textContent).toContain("coder");
			expect(statusLabel.textContent).toBe("running");
		});

		it("should show em-dash when no assignee", () => {
			const card = dashboard._renderCard({ task_id: "1", title: "Test", status: "ready" });
			const assignee = card.querySelector(".hermes-card-assignee");
			expect(assignee.textContent).toBe("\u2014");
		});

		it("should include priority dot when assignee is set", () => {
			const card = dashboard._renderCard({
				task_id: "1",
				title: "Test",
				status: "running",
				assignee: "coder",
				priority: 1
			});
			const dot = card.querySelector(".hermes-card-priority-dot");
			expect(dot).not.toBeNull();
			expect(dot.className).toContain("hermes-card-priority-high");
		});
	});

	describe("getDom", () => {
		it("should render empty state when no tasks", () => {
			const dom = dashboard.getDom();
			expect(dom.querySelector(".hermes-dashboard-empty")).not.toBeNull();
		});

		it("should render offline indicator when gateway disconnected", () => {
			dashboard.gatewayStatus = { connected: false };
			const dom = dashboard.getDom();
			expect(dom.querySelector(".hermes-dashboard-offline")).not.toBeNull();
		});

		it("should not render offline indicator when gateway connected", () => {
			dashboard.gatewayStatus = { connected: true };
			const dom = dashboard.getDom();
			expect(dom.querySelector(".hermes-dashboard-offline")).toBeNull();
		});

		it("should filter out done tasks when showCompleted is false", () => {
			dashboard.config.showCompleted = false;
			dashboard.tasks = [
				{ task_id: "1", title: "Active", status: "running" },
				{ task_id: "2", title: "Done", status: "done" }
			];
			const dom = dashboard.getDom();
			const cards = dom.querySelectorAll(".hermes-card");
			expect(cards).toHaveLength(1);
		});

		it("should show done tasks when showCompleted is true", () => {
			dashboard.config.showCompleted = true;
			dashboard.tasks = [
				{ task_id: "1", title: "Active", status: "running" },
				{ task_id: "2", title: "Done", status: "done" }
			];
			const dom = dashboard.getDom();
			const cards = dom.querySelectorAll(".hermes-card");
			expect(cards).toHaveLength(2);
		});

		it("should filter out archived tasks", () => {
			dashboard.tasks = [
				{ task_id: "1", title: "Active", status: "running" },
				{ task_id: "2", title: "Archived", status: "archived" }
			];
			const dom = dashboard.getDom();
			const cards = dom.querySelectorAll(".hermes-card");
			expect(cards).toHaveLength(1);
		});

		it("should sort blocked first, then running, then ready", () => {
			dashboard.tasks = [
				{ task_id: "1", title: "Ready", status: "ready" },
				{ task_id: "2", title: "Blocked", status: "blocked" },
				{ task_id: "3", title: "Running", status: "running" }
			];
			const dom = dashboard.getDom();
			const cards = dom.querySelectorAll(".hermes-card");
			expect(cards).toHaveLength(3);
			// blocked=0, running=1, ready=2 in statusOrder
			expect(cards[0].className).toContain("hermes-card-blocked");
			expect(cards[1].className).toContain("hermes-card-running");
			expect(cards[2].className).toContain("hermes-card-ready");
		});

		it("should cap visible tasks at maxTasks", () => {
			dashboard.config.maxTasks = 2;
			dashboard.tasks = [
				{ task_id: "1", title: "A", status: "running" },
				{ task_id: "2", title: "B", status: "running" },
				{ task_id: "3", title: "C", status: "running" }
			];
			const dom = dashboard.getDom();
			const cards = dom.querySelectorAll(".hermes-card");
			expect(cards).toHaveLength(2);
		});
	});
});
