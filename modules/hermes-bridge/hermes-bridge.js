/* Hermes Bridge — infrastructure module that polls the Hermes gateway
 * and distributes kanban events to all Hermes display modules.
 *
 * This module renders no visible DOM. Place it in a hidden region
 * (e.g., position: "fullscreen_below") in config.js.
 */

Module.register("hermes-bridge", {
	defaults: {
		gatewayUrl: "http://127.0.0.1:8643",
		refreshInterval: 30
	},

	start () {
		Log.info(`Starting module: ${this.name}`);
	},

	/**
	 * Invisible DOM — this module is infrastructure, not display.
	 * @returns {HTMLElement}
	 */
	getDom () {
		const wrapper = document.createElement("div");
		wrapper.style.display = "none";
		return wrapper;
	},

	/**
	 * Send config to node_helper once DOM is created, so it can start polling.
	 * @param {string} notification
	 */
	notificationReceived (notification) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.sendSocketNotification("CONFIG", this.config);
		}
	},

	/**
	 * Receive events from node_helper and re-broadcast to all modules.
	 * All notifications use the HERMES_ prefix.
	 * @param {string} notification
	 * @param {*} payload
	 */
	socketNotificationReceived (notification, payload) {
		// Forward all HERMES_* notifications to every module
		this.sendNotification(notification, payload);
	}
});
