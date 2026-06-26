// Zero-dependency JSON file database. No native modules, no compilation.
// Stores everything in <userData>/nebula-db.json.
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let filePath;
let data = { users: [], chats: [], messages: [], seq: { users: 0, chats: 0, messages: 0 } };

function init() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, 'nebula-db.json');
  if (fs.existsSync(filePath)) {
    try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (_) { /* corrupt file -> start fresh */ }
  } else {
    save();
  }
  // ensure shape
  data.users = data.users || [];
  data.chats = data.chats || [];
  data.messages = data.messages || [];
  data.seq = data.seq || { users: 0, chats: 0, messages: 0 };
}

function save() {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function nextId(kind) { data.seq[kind] = (data.seq[kind] || 0) + 1; return data.seq[kind]; }

/* ---- users (used by auth.js) ---- */
function findUserByUsername(username) {
  return data.users.find(u => u.username === username) || null;
}
function findUserById(id) {
  return data.users.find(u => u.id === id) || null;
}
function insertUser({ username, password, displayName }) {
  const user = { id: nextId('users'), username, password, display_name: displayName, avatar: null, created_at: new Date().toISOString() };
  data.users.push(user);
  save();
  return user;
}
function updateUser(id, fields) {
  const u = findUserById(id);
  if (!u) return null;
  if (fields.displayName != null) u.display_name = fields.displayName;
  if (fields.avatar != null) u.avatar = fields.avatar;
  save();
  return u;
}

/* ---- chats ---- */
function listChats(userId) {
  return data.chats.filter(c => c.user_id === userId).sort((a, b) => b.id - a.id);
}
function createChat(userId, title) {
  const chat = { id: nextId('chats'), user_id: userId, title: title || 'New chat', created_at: new Date().toISOString() };
  data.chats.push(chat);
  save();
  return chat;
}
function renameChat(chatId, title) {
  const c = data.chats.find(x => x.id === chatId);
  if (c) { c.title = title; save(); }
  return { ok: true };
}
function deleteChat(chatId) {
  data.messages = data.messages.filter(m => m.chat_id !== chatId);
  data.chats = data.chats.filter(c => c.id !== chatId);
  save();
  return { ok: true };
}

/* ---- messages = memory ---- */
function getMessages(chatId) {
  return data.messages.filter(m => m.chat_id === chatId).sort((a, b) => a.id - b.id);
}
function addMessage(chatId, role, content) {
  const msg = { id: nextId('messages'), chat_id: chatId, role, content, created_at: new Date().toISOString() };
  data.messages.push(msg);
  save();
  return msg;
}
function updateMessage(messageId, content) {
  const m = data.messages.find(x => x.id === messageId);
  if (!m) return { ok: false };
  m.content = content;
  m.edited_at = new Date().toISOString();
  save();
  return { ok: true, message: m };
}
function deleteMessage(messageId) {
  const before = data.messages.length;
  data.messages = data.messages.filter(m => m.id !== messageId);
  save();
  return { ok: data.messages.length < before };
}

module.exports = {
  init,
  findUserByUsername, findUserById, insertUser, updateUser,
  listChats, createChat, renameChat, deleteChat,
  getMessages, addMessage, updateMessage, deleteMessage
};
