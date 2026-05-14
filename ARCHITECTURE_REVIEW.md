# HermesMirror Architecture Review

## 1. Overview

HermesMirror is a fork of MagicMirror² v2.36.0 — a modular smart mirror platform built with Node.js + Electron. It runs in 3 modes: full Electron desktop, server-only (headless), and client-only (remote display).

**Tech stack:** Node.js (CommonJS), Electron, Express.js, Socket.IO, Nunjucks templating, Vitest

## 2. Entry Points (3 Operating Modes)

```
         ┌──────────────┐
         │   npm start  │  (electron.js)
         └──────┬───────┘
                │
    ┌───────────┴──────────┐
    │  Is address local?   │
    └───────────┬──────────┘
                │
      ┌─────────┴─────────┐
      │ YES               │ NO
      ▼                   ▼
┌──────────────┐   ┌──────────────┐
│ app.start()  │   │ createWindow │← clientonly path
│ + Server     │   │  only (no    │  (connects to
│ + Electron   │   │  local       │  remote server)
│   BrowserWin │   │  server)     │
└──────────────┘   └──────────────┘
```

| Mode | Entry | What happens |
|---|---|---|
| Full Electron | `js/electron.js` | `app.start()` starts server + node_helpers, then creates BrowserWindow pointing to localhost |
| Server-only | `serveronly/index.js` | `app.start()` starts server only (no Electron). Browser connects from another device |
| Client-only | `clientonly/index.js` | Fetches config from remote server via HTTP, then spawns Electron pointing to remote address |

## 3. Structural Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        HERMESMIRROR                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────── MAIN PROCESS (Node.js) ──────────────────┐ │
│  │                                                                  │ │
│  │  electron.js ──► app.js (singleton core)                        │ │
│  │                     │                                            │ │
│  │                     ├─► utils.loadConfig()                      │ │
│  │                     │   defaults.js + config/config.js           │ │
│  │                     │   + config.env substitution                │ │
│  │                     │                                            │ │
│  │                     ├─► loadModules()                            │ │
│  │                     │   for each config.modules:                 │ │
│  │                     │     require(node_helper.js)                │ │
│  │                     │     → new module → loaded() → start()     │ │
│  │                     │                                            │ │
│  │                     ├─► Server(configObj)                        │ │
│  │                     │   Express.js + Socket.IO                   │ │
│  │                     │   Endpoints: / /config /cors /version ...  │ │
│  │                     │   Static: js/ css/ modules/ translations/  │ │
│  │                     │   Middleware: helmet, ipWhitelist           │ │
│  │                     │                                            │ │
│  │                     └─► node_helpers[] ← io + app injected       │ │
│  │                         NodeHelper.setExpressApp(app)             │ │
│  │                         NodeHelper.setSocketIO(io)                │ │
│  │                         Namespace: io.of(moduleName)              │ │
│  │                                                                  │ │
│  └──────────────────────────────┬───────────────────────────────────┘ │
│                                 │                                      │
│                    ┌────────────┴────────────┐                        │
│                    │  Socket.IO (WebSocket)   │                        │
│                    │  Per-module namespaces   │                        │
│                    └────────────┬────────────┘                        │
│                                 │                                      │
│  ┌────────────────────── RENDERER PROCESS (Browser) ───────────────┐ │
│  │                                                                  │ │
│  │  index.html                                                     │ │
│  │    ├─ socket.io/socket.io.js  (Socket.IO client)                │ │
│  │    ├─ nunjucks.min.js         (templating)                      │ │
│  │    ├─ defaults.js             (client-side defaults)            │ │
│  │    ├─ vendor.js               (external lib paths)              │ │
│  │    ├─ defaultmodules.js       (known-module registry)           │ │
│  │    ├─ logger.js               (browser-aware logger)            │ │
│  │    ├─ translator.js           (i18n)                            │ │
│  │    ├─ class.js                (Class.extend inheritance)        │ │
│  │    ├─ module.js               (Module base class + register)    │ │
│  │    ├─ loader.js               (dynamic module loader)           │ │
│  │    ├─ socketclient.js         (MMSocket per-module socket)      │ │
│  │    ├─ animateCSS.js           (animation helpers)               │ │
│  │    ├─ positions.js            (discovered region positions)     │ │
│  │    └─ main.js                 (MM singleton + init)             │ │
│  │                                                                  │ │
│  │  MM.init():                                                     │ │
│  │    1. loadConfig()  ──► GET /config (JSON + function revival)   │ │
│  │    2. Translator.loadCoreTranslations()                          │ │
│  │    3. Loader.loadModules():                                     │ │
│  │       for each module in config:                                │ │
│  │         → loadFile(module.js)   (dynamic <script> injection)    │ │
│  │         → Module.create(name)   (from Module.definitions)       │ │
│  │         → bootstrapModule()     (scripts, styles, translations) │ │
│  │       → startModules()         (module.start())                 │ │
│  │       → MM.modulesStarted():                                   │ │
│  │          → createDomObjects()  (DOM wrappers + getDom())        │ │
│  │          → watch RELOAD socket                                  │ │
│  │                                                                  │
│  │  Per-module socket:                                             │ │
│  │    MMSocket(moduleName) ──► io("/moduleName")                   │ │
│  │    catch-all wildcard: socket.on("*", callback)                  │ │
│  │                                                                  │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 4. Module System

### 4.1 Two-Sided Modules

Every module has **two halves** that communicate via Socket.IO:

| Side | File | Base Class | Location | Runs in |
|---|---|---|---|---|
| Client | `modulename.js` | `Module` | `modules/` or `defaultmodules/` | Browser |
| Server | `node_helper.js` | `NodeHelper` | same module folder | Node.js |

### 4.2 Class Hierarchy

```
Class (class.js — John Resig prototypal inheritance)
 ├── Module (module.js)        → client-side base
 │    └── custom module JS     → Module.register("name", {...})
 └── NodeHelper (node_helper.js) → server-side base
      └── custom node_helper   → module.exports = NodeHelper.create({...})
```

### 4.3 Registration and Instantiation

**Client-side:**
```
1. Module file loaded via <script> injection (Loader.loadFile)
2. File calls: Module.register("modulename", { defaults, start, getDom, ... })
3. Stored in: Module.definitions["modulename"]
4. Loader calls: Module.create("modulename")
   → cloneObject(definition) → Module.extend(cloned) → new ModuleClass()
```

**Server-side:**
```
1. app.loadModule() calls: require("path/to/node_helper.js")
2. Helper exports: NodeHelper.create({...}) → NodeHelper.extend(definition)
3. Instance: new Module()
4. m.setName(), m.setPath()
5. m.loaded() → lifecycle hook
6. Later: m.setExpressApp(app), m.setSocketIO(io), m.start()
```

### 4.4 Default Module Registry

`defaultmodules/defaultmodules.js` exports an array of 8 built-in module names:
alert, calendar, clock, compliments, helloworld, newsfeed, updatenotification, weather

When a module name appears in this list, both server and client resolve its path to `defaultmodules/` instead of `modules/`, allowing the `modules/` directory to shadow defaults.

## 5. Module Lifecycle

```
SERVER (app.js)                       CLIENT (main.js + loader.js)
─────────────────                     ──────────────────────────────
config parsed
defaultModules list loaded
                                     index.html loads all core JS
for each config.modules:             
  require(node_helper.js)            MM.init()
  → new instance                     
  → m.loaded()                         loadConfig() ← GET /config
                                     

  m.setExpressApp(app)                Loader.loadModules()
  m.setSocketIO(io)                     for each module:
  → io.of(name).on("connection")          loadFile(module.js)
    → socket.onAny(...)                   Module.create(name)
                                           bootstrapModule():
  m.setExpressApp:                          loadScripts()
    app.use("/name", static)                loadStyles()
  m.setSocketIO:                            loadTranslations()
    io.of(name) namespace                 
                                          startModules():
                                            for each: module.start()
                                          MM.modulesStarted()
  m.start()                                 → createDomObjects()
  (Promise.allSettled)                        → for each: getDom()
                                               → append to DOM region
                                            
  SERVER READY                             CLIENT READY
```

## 6. IPC (Inter-Process Communication)

Communication between module client and server halves uses **Socket.IO namespaces**.

```
┌────────────────────────────┐     ┌─────────────────────────────┐
│  CLIENT (Renderer)         │     │  SERVER (Main Process)       │
│                            │     │                              │
│  Module.sendSocketNotif()  │────▶│  io.of("modname")            │
│    → this.socket().emit()  │     │    socket.onAny() →          │
│                            │     │    node_helper.              │
│                            │     │    socketNotificationRcvd()  │
│                            │     │                              │
│  Module.socket()           │◀────│  node_helper.                │
│    → MMSocket.on("*")      │     │    sendSocketNotification()  │
│    → socketNotificationRcvd│     │    → io.of("name").emit()    │
└────────────────────────────┘     └─────────────────────────────┘
```

**Client-side MMSocket** (js/socketclient.js):
- Connects to `io("/modulename")` 
- Monkey-patches Socket.IO's `onevent` to duplicate every event to a `*` wildcard handler
- This gives a catch-all: any notification from server triggers `socketNotificationReceived()`

**Server-side NodeHelper** (js/node_helper.js):
- `setSocketIO(io)`: Creates `io.of(this.name)` namespace, registers `socket.onAny()` for all client messages
- `sendSocketNotification()`: `this.io.of(this.name).emit(notification, payload)`

**Module-to-Module (client-side only):**
- `Module.sendNotification(notif, payload)`: Calls `MM.sendNotification()` which broadcasts to all other Module instances on the client
- This is NOT socket-based — it's direct in-memory on the client side

## 7. Config System

### 7.1 Config Pipeline

```
defaults.js (hardcoded)
      │
      ▼
config/config.js (user JS, CommonJS exports)
      │
      ▼
config/config.env (optional — ${VAR} substitution into process.env)
      │
      ▼
utils.loadConfig():
  1. Read config.js as string
  2. Substitute ${ENV_VAR} from process.env
  3. requireFromString(configContent) → user config object
  4. Object.assign({}, defaults, userConfig) → merged
  5. Write config/basepath.js (for client basePath)
  6. Lint config with ESLint
  7. Validate module positions with Ajv schema
      │
      ▼
global.config (server-side)
      │
      ▼
GET /config endpoint:
  JSON.stringify with __mmFunction tagging for function values
      │
      ▼
config variable (client-side, via fetch + JSON.parse with function reviver)
```

### 7.2 Key Config Properties

| Property | Default | Purpose |
|---|---|---|
| address | localhost | Bind address |
| port | 8080 | HTTP port |
| basePath | / | URL prefix for reverse proxy |
| ipWhitelist | [127.0.0.1, ::1] | IP access control |
| language | en | UI language |
| logLevel | [INFO, LOG, WARN, ERROR] | Active log levels |
| foreignModulesDir | modules | Path for user modules |
| defaultModulesDir | defaultmodules | Path for built-in modules |
| hideConfigSecrets | false | Redact SECRET_ env vars |
| modules | [...] | Module instances array |
| checkServerInterval | 30000 | Server liveness poll (ms) |
| reloadAfterServerRestart | false | Auto-reload on server restart |

## 8. Server Architecture

### 8.1 Express.js Server (js/server.js)

```
Express App
├── helmet(config.httpHeaders)       ← security headers
├── ipAccessControl(ipWhitelist)     ← IP filtering middleware
├── Static file serving:
│   ├── /js/*                        ← __dirname (js/)
│   ├── /config/*                    ← config/
│   ├── /css/*                       ← css/
│   ├── /defaultmodules/*            ← defaultmodules/
│   ├── /modules/*                   ← modules/
│   ├── /translations/*             ← translations/
│   └── /node_modules/@fontsource/*  ← vendor fonts
├── GET /config   → JSON config (with __mmFunction serialization)
├── GET /cors     → CORS proxy (SSRF-protected)
├── GET /version  → version string
├── GET /startup  → server start timestamp
├── GET /env      → environment variables for client
├── GET /reload   → triggers io.emit("RELOAD") for watch mode
└── GET /         → index.html (with #VERSION#/#TESTMODE# substitution)
```

### 8.2 Socket.IO Configuration

- CORS: origin `*` (all origins allowed)
- Engine.IO v3 backward compatibility (`allowEIO3: true`)
- Ping interval: 120s, ping timeout: 120s
- Per-module namespaces: `io.of(moduleName)`
- RELOAD event on default namespace for watch mode

## 9. Electron Shell (js/electron.js)

### 9.1 BrowserWindow Configuration

- Fullscreen, frameless, transparent, no shadow
- Dark theme (`darkTheme: true`)
- Black background
- `contextIsolation: true, nodeIntegration: false` (security best practice)
- GPU disabled by default (`ELECTRON_ENABLE_GPU=1` to override)
- Loads `http[s]://[address]:[port]`

### 9.2 Lifecycle Hooks

- `window-all-closed`: Recreate window (Electron). In test mode, quit.
- `activate`: Recreate window if null (macOS dock click)
- `before-quit`: Call `core.stop()` to gracefully stop all node_helpers + server. Force-quit after 3s timeout.
- `certificate-error`: Auto-accept all certs (for self-signed HTTPS)

### 9.3 Dev Mode

- Pass `dev` argument: opens DevTools
- In test mode (`mmTestMode`): uses separate DevTools window

## 10. Key Files by Layer

### Core Infrastructure
| File | Purpose |
|---|---|
| js/class.js | Prototypal inheritance (Class.extend) |
| js/logger.js | Universal logger (Node.js + browser) |
| js/vendor.js | External dependency path map |
| js/translator.js | i18n translation system |
| js/animateCSS.js | Animate.css integration |
| js/defaults.js | System default configuration |

### Server Layer
| File | Purpose |
|---|---|
| js/app.js | Core application singleton (start/stop) |
| js/server.js | Express.js + Socket.IO server |
| js/server_functions.js | HTTP endpoints, CORS proxy, env vars |
| js/ip_access_control.js | IP whitelist middleware |
| js/node_helper.js | Server-side module base class |
| js/utils.js | Config loading, validation, position discovery |
| serveronly/index.js | Headless server entry point |
| serveronly/watcher.js | File watcher for hot reload |

### Client Layer
| File | Purpose |
|---|---|
| index.html | Browser entry point, region layout |
| js/module.js | Client-side module base class (Module) |
| js/loader.js | Dynamic module loader (script injection) |
| js/socketclient.js | Per-module Socket.IO client (MMSocket) |
| js/main.js | MM singleton — DOM orchestration, notifications |
| js/electron.js | Electron main process |
| clientonly/index.js | Remote client entry point |

### User-Facing Directories
| Directory | Purpose |
|---|---|
| modules/ | User-installed third-party modules |
| defaultmodules/ | Built-in modules (alert, calendar, clock, etc.) |
| config/ | User configuration (config.js, config.env, custom.css) |
| css/ | Core stylesheets |
| translations/ | Core i18n files |

## 11. Architectural Observations

### Strengths
1. **Clean separation:** Server-side (NodeHelper) and client-side (Module) halves communicate only via Socket.IO. No shared state.
2. **Extensibility:** Modules register at runtime via `Module.register()`. Third-party modules go in `modules/` directory — no build step needed.
3. **3 operating modes:** The same codebase serves desktop (Electron), headless server, and remote client — reduces code duplication.
4. **Security defaults:** contextIsolation=true, nodeIntegration=false, IP whitelist, Helmet headers, SSRF-protected CORS proxy.
5. **Config safety:** `hideConfigSecrets` redacts SECRET_ env vars from the /config endpoint. Function serialization with `__mmFunction` tagging.

### Architectural Patterns
- **Singleton core:** `app.js` exports `new App()` — a single instance per process
- **IIFE module pattern:** Client JS files use `(function() { ... }())` to create closure scope, avoid global pollution
- **Plugin registry:** `Module.definitions = {}` acts as a runtime plugin registry
- **Fan-out lifecycle:** Both server and client use `Promise.allSettled()` to start modules, logging individual failures without crashing the whole system

### Potential Concerns
1. **No TypeScript:** Everything is plain JavaScript (CommonJS). Type safety relies on ESLint + documentation.
2. **Dynamic script injection:** `Loader.loadFile()` creates `<script>` elements dynamically. This makes module loading order-dependent on DOM-ready timing.
3. **Global namespace reliance:** `MM`, `Module`, `Loader`, `config`, `Log`, `Translator` are global variables in the browser. No module bundler.
4. **Socket.IO catch-all pattern:** The wildcard event duplication in `socketclient.js` intercepts EVERY event — could be noisy.
5. **Server config exposed to client:** The entire merged config (minus redacted secrets) is sent to every client via GET /config.

## 12. Data Flow Summary

```
Config:  config.js → loadConfig() → global.config → GET /config → client config

Server→Client data:  node_helper.fetch() → sendSocketNotification() → 
                     io.of(name).emit() → MMSocket.on("*") → 
                     module.socketNotificationReceived() → module.updateDom()

Client→Server data:  module.sendSocketNotification() → MMSocket.emit() → 
                     io.of(name).socket.onAny() → node_helper.socketNotificationReceived()

Module→Module:       module.sendNotification() → MM.sendNotification() → 
                     module.notificationReceived() (in-memory, client-side only)
```