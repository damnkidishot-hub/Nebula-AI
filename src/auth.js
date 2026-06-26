const bcrypt = require('bcryptjs');
const db = require('./db');

function register(username, password) {
  username = (username || '').trim();
  if (!username || !password) return { ok: false, error: 'Username and password required' };
  if (db.findUserByUsername(username)) return { ok: false, error: 'Username already taken' };
  const hash = bcrypt.hashSync(password, 10);
  const user = db.insertUser({ username, password: hash, displayName: username });
  return { ok: true, user: { id: user.id, username, displayName: username, avatar: null } };
}

function login(username, password) {
  const row = db.findUserByUsername((username || '').trim());
  if (!row) return { ok: false, error: 'User not found' };
  if (!bcrypt.compareSync(password, row.password)) return { ok: false, error: 'Wrong password' };
  return { ok: true, user: { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar } };
}

function getProfile(userId) {
  const row = db.findUserById(userId);
  if (!row) return { ok: false, error: 'Not found' };
  return { ok: true, user: { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar } };
}

function updateProfile({ userId, displayName, avatar }) {
  db.updateUser(userId, { displayName, avatar });
  return getProfile(userId);
}

module.exports = { register, login, getProfile, updateProfile };
