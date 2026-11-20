"use strict";
const electron = require("electron");
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  electron.ipcRenderer.on(channel, listener);
  return () => electron.ipcRenderer.removeListener(channel, listener);
}
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    app: process.env.npm_package_version ?? ""
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    update: (patch) => electron.ipcRenderer.invoke("settings:update", patch),
    onChanged: (cb) => subscribe("settings:changed", cb)
  },
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    toggleMaximize: () => electron.ipcRenderer.send("window:toggle-maximize"),
    close: () => electron.ipcRenderer.send("window:close"),
    isMaximized: () => electron.ipcRenderer.invoke("window:is-maximized"),
    onMaximizeChange: (cb) => subscribe("window:maximized", cb)
  },
  app: {
    getVersion: () => electron.ipcRenderer.invoke("app:version"),
    openExternal: (url) => electron.ipcRenderer.send("app:open-external", url),
    openPath: (target) => electron.ipcRenderer.send("app:open-path", target),
    focus: (command) => electron.ipcRenderer.send("app:focus", command),
    openConversation: (id) => electron.ipcRenderer.send("app:open-conversation", id)
  },
  clipboard: {
    write: (text) => electron.ipcRenderer.send("app:copy", text)
  },
  storage: {
    info: () => electron.ipcRenderer.invoke("storage:info"),
    openDataFolder: () => electron.ipcRenderer.send("storage:open-data"),
    openPhotos: () => electron.ipcRenderer.send("storage:open-photos"),
    clearPhotos: () => electron.ipcRenderer.invoke("storage:clear-photos")
  },
  update: {
    check: () => electron.ipcRenderer.invoke("update:check"),
    download: () => electron.ipcRenderer.invoke("update:download"),
    install: () => electron.ipcRenderer.invoke("update:install"),
    onAvailable: (cb) => subscribe("update:available", cb),
    onProgress: (cb) => subscribe("update:progress", cb),
    onReady: (cb) => subscribe("update:ready", cb),
    onError: (cb) => subscribe("update:error", cb)
  },
  providers: {
    test: (provider) => electron.ipcRenderer.invoke("providers:test", provider),
    openrouterAuth: () => electron.ipcRenderer.invoke("providers:openrouter-auth"),
    localModels: (baseUrl) => electron.ipcRenderer.invoke("providers:local-models", baseUrl),
    ollamaStatus: () => electron.ipcRenderer.invoke("providers:ollama-status"),
    ollamaInstall: () => electron.ipcRenderer.invoke("providers:ollama-install"),
    ollamaStart: () => electron.ipcRenderer.invoke("providers:ollama-start"),
    ollamaPull: (model) => electron.ipcRenderer.invoke("providers:ollama-pull", model),
    onOllamaProgress: (cb) => subscribe("ollama:progress", cb)
  },
  conversations: {
    list: () => electron.ipcRenderer.invoke("conversations:list"),
    get: (id) => electron.ipcRenderer.invoke("conversations:get", id),
    create: (input) => electron.ipcRenderer.invoke("conversations:create", input),
    rename: (id, title) => electron.ipcRenderer.invoke("conversations:rename", id, title),
    remove: (id) => electron.ipcRenderer.invoke("conversations:remove", id),
    clearAll: () => electron.ipcRenderer.invoke("conversations:clear"),
    deleteMessage: (conversationId, messageId) => electron.ipcRenderer.invoke("conversations:delete-message", conversationId, messageId),
    export: (id) => electron.ipcRenderer.invoke("conversations:export", id),
    onChanged: (cb) => subscribe("conversations:changed", cb)
  },
  saved: {
    list: () => electron.ipcRenderer.invoke("saved:list"),
    add: (input) => electron.ipcRenderer.invoke("saved:add", input),
    remove: (id) => electron.ipcRenderer.invoke("saved:remove", id),
    onChanged: (cb) => subscribe("saved:changed", cb)
  },
  memory: {
    list: () => electron.ipcRenderer.invoke("memory:list"),
    remove: (id) => electron.ipcRenderer.invoke("memory:remove", id),
    clear: () => electron.ipcRenderer.invoke("memory:clear"),
    onChanged: (cb) => subscribe("memory:changed", cb)
  },
  chat: {
    send: (payload) => electron.ipcRenderer.invoke("chat:send", payload),
    abort: (conversationId) => electron.ipcRenderer.invoke("chat:abort", conversationId),
    regenerate: (conversationId, surface) => electron.ipcRenderer.invoke("chat:regenerate", conversationId, surface),
    onStart: (cb) => subscribe("chat:start", cb),
    onDelta: (cb) => subscribe("chat:delta", cb),
    onDone: (cb) => subscribe("chat:done", cb),
    onError: (cb) => subscribe("chat:error", cb),
    onUserMessage: (cb) => subscribe("chat:user-message", cb)
  },
  capture: {
    screens: (quality) => electron.ipcRenderer.invoke("capture:screens", quality),
    windows: () => electron.ipcRenderer.invoke("capture:windows"),
    selectRegion: (displayId) => electron.ipcRenderer.invoke("capture:region", displayId),
    captureWindow: (sourceId) => electron.ipcRenderer.invoke("capture:window", sourceId),
    saveImage: (dataUrl, name) => electron.ipcRenderer.invoke("capture:save-image", dataUrl, name),
    pickImages: () => electron.ipcRenderer.invoke("capture:pick-images")
  },
  agent: {
    prepare: (input) => electron.ipcRenderer.invoke("agent:prepare", input),
    plan: (id, lang) => electron.ipcRenderer.invoke("agent:plan", id, lang),
    run: (id, lang) => electron.ipcRenderer.invoke("agent:run", id, lang),
    cancel: () => electron.ipcRenderer.invoke("agent:cancel"),
    onStep: (cb) => subscribe("agent:step", cb),
    onRun: (cb) => subscribe("agent:run", cb)
  },
  notify: (payload) => electron.ipcRenderer.send("app:notify", payload),
  hotkeys: {
    onError: (cb) => subscribe("app:hotkey-error", cb)
  },
  commands: {
    on: (cb) => subscribe("app:command", cb),
    onOpenConversation: (cb) => subscribe("app:open-conversation", cb)
  },
  float: {
    toggle: () => electron.ipcRenderer.invoke("float:toggle"),
    hide: () => electron.ipcRenderer.invoke("float:hide"),
    setCollapsed: (collapsed) => electron.ipcRenderer.invoke("float:set-collapsed", collapsed),
    onVisibility: (cb) => subscribe("float:visibility", cb),
    onCollapsed: (cb) => subscribe("float:collapsed", cb)
  }
};
electron.contextBridge.exposeInMainWorld("chelp", api);
electron.contextBridge.exposeInMainWorld("chelpOverlay", {
  context: () => electron.ipcRenderer.invoke("overlay:context"),
  complete: (rect) => electron.ipcRenderer.send("overlay:complete", rect),
  cancel: () => electron.ipcRenderer.send("overlay:cancel")
});
