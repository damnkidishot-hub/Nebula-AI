const { app, BrowserWindow, ipcMain, Menu } = require('electron');

// Remove the native application menu (File/Edit/View/Window/Help).
Menu.setApplicationMenu(null);
const path = require('path');
const db = require('./src/db');
const auth = require('./src/auth');
const models = require('./src/models');
const openrouter = require('./src/openrouter');
const localModel = require('./src/localModel');
const agent = require('./src/agent');

// Pending agent approval resolvers, keyed by approvalId.
const pendingApprovals = new Map();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#161618',
    frame: false,            // no OS title bar / borders
    autoHideMenuBar: true,   // no menu bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
}

app.whenReady().then(() => {
  db.init();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- WINDOW CONTROLS ---------------- */
ipcMain.handle('win:minimize', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
ipcMain.handle('win:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
  return w.isMaximized();
});
ipcMain.handle('win:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
ipcMain.handle('win:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() || false);

/* ---------------- AUTH ---------------- */
ipcMain.handle('auth:register', (e, { username, password }) => auth.register(username, password));
ipcMain.handle('auth:login', (e, { username, password }) => auth.login(username, password));
ipcMain.handle('auth:profile', (e, { userId }) => auth.getProfile(userId));
ipcMain.handle('auth:updateProfile', (e, payload) => auth.updateProfile(payload));

/* ---------------- MODELS ---------------- */
ipcMain.handle('models:list', () => models.listModels());

/* ---------------- CHATS / MEMORY ---------------- */
ipcMain.handle('chat:list', (e, { userId }) => db.listChats(userId));
ipcMain.handle('chat:create', (e, { userId, title }) => db.createChat(userId, title));
ipcMain.handle('chat:rename', (e, { chatId, title }) => db.renameChat(chatId, title));
ipcMain.handle('chat:delete', (e, { chatId }) => db.deleteChat(chatId));
ipcMain.handle('chat:messages', (e, { chatId }) => db.getMessages(chatId));
ipcMain.handle('chat:addMessage', (e, { chatId, role, content }) => db.addMessage(chatId, role, content));
ipcMain.handle('chat:editMessage', (e, { messageId, content }) => db.updateMessage(messageId, content));
ipcMain.handle('chat:deleteMessage', (e, { messageId }) => db.deleteMessage(messageId));

/* ---------------- INFERENCE (streaming) ---------------- */
ipcMain.handle('infer:send', async (e, payload) => {
  const { requestId, modelName, mode, messages } = payload;
  const sender = e.sender;
  const model = models.getModel(modelName);
  if (!model) {
    sender.send('infer:error', { requestId, error: 'Model not found: ' + modelName });
    return { ok: false };
  }

  // System prompt depends on mode (agent vs normal)
  const systemPrompt = mode === 'agent'
    ? 'You are Nebula AI in AGENT mode. Plan tasks step by step and be proactive.'
    : 'You are Nebula AI, a helpful assistant.';

  const onToken = (token) => sender.send('infer:token', { requestId, token });

  try {
    let full = '';
    if (model.type === 'openrouter') {
      full = await openrouter.stream({ model, systemPrompt, messages, onToken });
    } else {
      full = await localModel.stream({ model, systemPrompt, messages, onToken });
    }
    sender.send('infer:done', { requestId, content: full });
    return { ok: true };
  } catch (err) {
    sender.send('infer:error', { requestId, error: String(err.message || err) });
    return { ok: false };
  }
});

/* ---------------- AGENT (multi-step tool use) ---------------- */
ipcMain.handle('agent:run', async (e, payload) => {
  const { requestId, modelName, messages, requireApproval } = payload;
  const sender = e.sender;
  const model = models.getModel(modelName);
  if (!model) {
    sender.send('agent:error', { requestId, error: 'Model not found: ' + modelName });
    return { ok: false };
  }

  const callbacks = {
    onThought: (token) => sender.send('agent:thought', { requestId, token }),
    onStep: (step) => sender.send('agent:step', { requestId, step }),
    onFinal: (content) => sender.send('agent:final', { requestId, content }),
    requestApproval: (info) => new Promise((resolve) => {
      const approvalId = requestId + ':' + Date.now();
      pendingApprovals.set(approvalId, resolve);
      sender.send('agent:approval', { requestId, approvalId, info });
    })
  };

  try {
    await agent.run({ model, messages, requireApproval, callbacks });
    return { ok: true };
  } catch (err) {
    sender.send('agent:error', { requestId, error: String(err.message || err) });
    return { ok: false };
  }
});

ipcMain.handle('agent:approve', (e, { approvalId, approved }) => {
  const resolve = pendingApprovals.get(approvalId);
  if (resolve) { resolve(!!approved); pendingApprovals.delete(approvalId); }
  return { ok: true };
});
