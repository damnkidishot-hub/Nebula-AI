const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized')
});

contextBridge.exposeInMainWorld('api', {
  // auth
  register: (data) => ipcRenderer.invoke('auth:register', data),
  login: (data) => ipcRenderer.invoke('auth:login', data),
  getProfile: (data) => ipcRenderer.invoke('auth:profile', data),
  updateProfile: (data) => ipcRenderer.invoke('auth:updateProfile', data),

  // models
  listModels: () => ipcRenderer.invoke('models:list'),

  // chats
  listChats: (data) => ipcRenderer.invoke('chat:list', data),
  createChat: (data) => ipcRenderer.invoke('chat:create', data),
  renameChat: (data) => ipcRenderer.invoke('chat:rename', data),
  deleteChat: (data) => ipcRenderer.invoke('chat:delete', data),
  getMessages: (data) => ipcRenderer.invoke('chat:messages', data),
  addMessage: (data) => ipcRenderer.invoke('chat:addMessage', data),

  // inference streaming
  send: (payload) => ipcRenderer.invoke('infer:send', payload),
  onToken: (cb) => ipcRenderer.on('infer:token', (e, d) => cb(d)),
  onDone: (cb) => ipcRenderer.on('infer:done', (e, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('infer:error', (e, d) => cb(d)),

  // agent mode
  runAgent: (payload) => ipcRenderer.invoke('agent:run', payload),
  approveAgent: (payload) => ipcRenderer.invoke('agent:approve', payload),
  onAgentThought: (cb) => ipcRenderer.on('agent:thought', (e, d) => cb(d)),
  onAgentStep: (cb) => ipcRenderer.on('agent:step', (e, d) => cb(d)),
  onAgentApproval: (cb) => ipcRenderer.on('agent:approval', (e, d) => cb(d)),
  onAgentFinal: (cb) => ipcRenderer.on('agent:final', (e, d) => cb(d)),
  onAgentError: (cb) => ipcRenderer.on('agent:error', (e, d) => cb(d))
});
