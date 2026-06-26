const user = getSession();
if (!user) location.href = 'login.html';

let state = {
  chatId: null,
  messages: [],
  models: [],
  model: localStorage.getItem('nebula_model') || null,
  mode: localStorage.getItem('nebula_mode') || 'normal',
  requireApproval: localStorage.getItem('nebula_approval') !== 'off',
  streaming: false
};

const $ = (id) => document.getElementById(id);

// Each phase is isolated so one failure never leaves the UI (esp. the input) dead.
async function init(){
  const safe = async (fn, label) => { try { await fn(); } catch (e) { console.error('init ' + label + ' failed:', e); } };
  await safe(renderProfile, 'profile');
  await safe(loadModels, 'models');
  await safe(loadChats, 'chats');
  await safe(renderMessages, 'messages');
  // bindUI MUST run even if something above failed, so typing/sending works.
  bindUI();
  await safe(bindStreaming, 'streaming');
  await safe(bindAgent, 'agent');
  if (window.fillIcons) window.fillIcons();
}

function renderProfile(){
  $('profileName').textContent = user.displayName || user.username;
  const av = $('avatar');
  if (user.avatar){ av.innerHTML = `<img src="${user.avatar}" alt="">`; }
  else { av.textContent = (user.displayName || user.username || 'U')[0].toUpperCase(); }
  $('editName').value = user.displayName || '';
  $('editAvatar').value = user.avatar || '';
}

async function loadModels(){
  state.models = await window.api.listModels();
  const menu = $('modelMenu');
  menu.innerHTML = '';
  if (!state.models.length){
    menu.innerHTML = '<div>No models. Add json files to /models</div>';
  }
  state.models.forEach(m => {
    const d = document.createElement('div');
    d.textContent = `${m.name}  (${m.type})`;
    d.dataset.name = m.name;
    if (m.name === state.model) d.classList.add('sel');
    d.onclick = () => { selectModel(m.name); $('modelSwitcher').classList.remove('open'); };
    menu.appendChild(d);
  });
  if (!state.model && state.models[0]) selectModel(state.models[0].name);
  else updateModelLabel();
}
function selectModel(name){
  state.model = name;
  localStorage.setItem('nebula_model', name);
  document.querySelectorAll('#modelMenu div').forEach(d => d.classList.toggle('sel', d.dataset.name === name));
  updateModelLabel();
}
function updateModelLabel(){ $('modelLabel').textContent = state.model || 'Select model'; if (typeof checkCapability === 'function') checkCapability(); }

function selectMode(mode){
  state.mode = mode;
  localStorage.setItem('nebula_mode', mode);
  $('modeLabel').textContent = mode === 'agent' ? 'Agent' : 'Normal';
  document.querySelectorAll('#modeMenu div').forEach(d => d.classList.toggle('sel', d.dataset.mode === mode));
  const apt = $('approvalToggle'); if (apt) apt.style.display = mode === 'agent' ? '' : 'none';
  checkCapability();
}

// Warn when agent mode is on but the selected model likely can't call tools
// via the native function-calling path. (It will still work via the text
// protocol, but results may be less reliable.)
function checkCapability(){
  const warn = $('capWarn');
  if (!warn) return;
  const m = state.models.find(x => x.name === state.model);
  const risky = state.mode === 'agent' && m && !m.toolsLikely;
  warn.style.display = risky ? 'flex' : 'none';
}

async function loadChats(){
  const chats = await window.api.listChats({ userId: user.id });
  const list = $('chatList');
  list.innerHTML = '';
  chats.forEach(c => {
    const item = document.createElement('div');
    item.className = 'chat-item' + (c.id === state.chatId ? ' active' : '');
    item.innerHTML = `<span>${escapeHtml(c.title)}</span><span class="del">&times;</span>`;
    item.onclick = (e) => { if (!e.target.classList.contains('del')) openChat(c.id); };
    item.querySelector('.del').onclick = async (e) => {
      e.stopPropagation();
      await window.api.deleteChat({ chatId: c.id });
      if (state.chatId === c.id){ state.chatId = null; state.messages = []; renderMessages(); }
      loadChats();
    };
    list.appendChild(item);
  });
}

async function openChat(chatId){
  state.chatId = chatId;
  state.messages = await window.api.getMessages({ chatId });
  renderMessages();
  loadChats();
}

async function ensureChat(firstMessage){
  if (state.chatId) return state.chatId;
  const title = firstMessage.slice(0, 40) || 'New chat';
  const chat = await window.api.createChat({ userId: user.id, title });
  state.chatId = chat.id;
  await loadChats();
  return chat.id;
}

function renderMessages(){
  const box = $('messages');
  if (!state.messages.length){
    box.innerHTML = `<div class="empty"><h2>What can I help with?</h2></div>`;
    return;
  }
  box.innerHTML = '';
  state.messages.forEach(m => box.appendChild(messageRow(m.role, m.content)));
  scrollDown();
}

function messageRow(role, content){
  const row = document.createElement('div');
  row.className = 'msg-row ' + (role === 'user' ? 'user' : 'ai');
  const av = document.createElement('div');
  av.className = 'av';
  av.innerHTML = role === 'user' ? (user.displayName||'U')[0].toUpperCase() : '&#9883;';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = role === 'user' ? `<p>${escapeHtml(content)}</p>` : renderMarkdown(content);
  row.appendChild(av); row.appendChild(bubble);
  return row;
}

function scrollDown(){ const b = $('messages'); b.scrollTop = b.scrollHeight; }

let currentRequest = null;
let currentBubble = null;
let currentBuffer = '';

function bindStreaming(){
  window.api.onToken(({ requestId, token }) => {
    if (requestId !== currentRequest || !currentBubble) return;
    currentBuffer += token;
    currentBubble.innerHTML = renderMarkdown(currentBuffer);
    scrollDown();
  });
  window.api.onDone(async ({ requestId, content }) => {
    if (requestId !== currentRequest || !currentBubble) return;
    const final = content || currentBuffer;
    currentBubble.innerHTML = renderMarkdown(final);
    await window.api.addMessage({ chatId: state.chatId, role: 'assistant', content: final });
    state.messages.push({ role: 'assistant', content: final });
    finishStreaming();
  });
  window.api.onError(({ requestId, error }) => {
    if (requestId !== currentRequest || !currentBubble) return;
    currentBubble.innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(error)}</p>`;
    finishStreaming();
  });
}

function finishStreaming(){
  if (currentBubble) currentBubble.classList.remove('streaming');
  setGenerating(false);
  currentRequest = null; currentBubble = null; currentBuffer = '';
}

function setGenerating(on){
  state.streaming = on;
  const b = $('sendBtn');
  b.classList.toggle('stop', on);
  b.innerHTML = on ? (window.ICONS ? window.ICONS.stop : '&#9632;') : (window.ICONS ? window.ICONS.send : '&#8593;');
  b.disabled = false; // never leave the button/input disabled
}

// Stop the current generation. Detaches UI callbacks by clearing currentRequest
// so any further streamed tokens/steps for the old request are ignored.
function stopGenerating(){
  if (currentBubble){
    currentBubble.classList.remove('streaming');
    if (!currentBuffer) currentBubble.innerHTML = '<p style="color:var(--muted)">Stopped.</p>';
  }
  if (agentContainer){
    const f = agentContainer.querySelector('.agent-final');
    if (f && !f.innerHTML) f.innerHTML = '<p style="color:var(--muted)">Stopped.</p>';
    agentContainer = null;
  }
  currentRequest = null;
  setGenerating(false);
}

async function send(){
  const input = $('input');
  const text = input.value.trim();
  if (state.streaming) return; // (stop handled separately)
  if (!text) return;
  if (!state.model){ alert('Select a model first (add json files to /models)'); return; }

  await ensureChat(text);
  input.value = ''; input.style.height = 'auto';

  const wasEmpty = state.messages.length === 0;
  state.messages.push({ role: 'user', content: text });
  await window.api.addMessage({ chatId: state.chatId, role: 'user', content: text });
  if (wasEmpty) renderMessages();
  else $('messages').appendChild(messageRow('user', text));

  const convo = state.messages.map(m => ({ role: m.role, content: m.content }));
  currentRequest = Date.now() + '-' + Math.random().toString(16).slice(2);
  currentBuffer = '';
  setGenerating(true);

  if (state.mode === 'agent') { runAgentTurn(convo); return; }

  const aiRow = messageRow('assistant', '');
  aiRow.querySelector('.bubble').innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  $('messages').appendChild(aiRow);
  currentBubble = aiRow.querySelector('.bubble');
  currentBubble.classList.add('streaming');
  scrollDown();

  await window.api.send({ requestId: currentRequest, modelName: state.model, mode: state.mode, messages: convo });
}

/* ---------------- AGENT TURN ---------------- */
let agentContainer = null;

function runAgentTurn(convo){
  reasonBuffer = '';
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.innerHTML = `<div class="av">${window.ICONS ? window.ICONS.spark : ''}</div>`;
  const body = document.createElement('div');
  body.className = 'bubble';
  // reasoning (live) + steps (hidden until a tool runs) + final answer
  body.innerHTML = '<div class="agent-reason" hidden></div>'+
    '<div class="agent-steps" hidden></div>'+
    '<div class="agent-final"><div class="typing"><span></span><span></span><span></span></div></div>';
  row.appendChild(body);
  $('messages').appendChild(row);
  agentContainer = body;
  scrollDown();

  window.api.runAgent({
    requestId: currentRequest,
    modelName: state.model,
    messages: convo,
    requireApproval: state.requireApproval
  });
}

function iconFor(tool){
  const map = { read_file:'file', write_file:'edit', create_file:'plus', delete_file:'trash',
                list_dir:'folder', run_command:'terminal' };
  return (window.ICONS && window.ICONS[map[tool]]) || (window.ICONS ? window.ICONS.cpu : '');
}

// Short, human-readable summary of a tool's main argument for the card header.
function argSummary(tool, args){
  if (!args) return '';
  let s = '';
  if (tool === 'run_command') s = args.command || '';
  else s = args.path || '';
  if (!s) return '';
  if (s.length > 60) s = s.slice(0, 57) + '...';
  return `<span class="tc-arg">${escapeHtml(s)}</span>`;
}

let reasonBuffer = '';
function bindAgent(){
  window.api.onAgentThought(({ requestId, token }) => {
    if (requestId !== currentRequest || !agentContainer) return;
    const r = agentContainer.querySelector('.agent-reason');
    const final = agentContainer.querySelector('.agent-final');
    if (final) final.innerHTML = ''; // remove the typing dots once tokens arrive
    reasonBuffer += token;
    r.hidden = false;
    r.innerHTML = renderMarkdown(reasonBuffer);
    scrollDown();
  });

  window.api.onAgentStep(({ requestId, step }) => {
    if (requestId !== currentRequest || !agentContainer) return;
    const steps = agentContainer.querySelector('.agent-steps');
    steps.hidden = false;
    if (step.phase === 'plan'){
      const card = document.createElement('div');
      card.className = 'tool-card pending';
      card.dataset.tool = step.tool;
      card.innerHTML = `<div class="tc-head"><span class="tc-ico">${iconFor(step.tool)}</span>`+
        `<b>${escapeHtml(step.tool)}</b>${argSummary(step.tool, step.args)}<span class="tc-spin"></span></div>`+
        `<div class="tc-result" hidden></div>`;
      steps.appendChild(card);
    } else if (step.phase === 'result'){
      const cards = steps.querySelectorAll('.tool-card');
      const card = cards[cards.length - 1];
      if (card){
        card.classList.remove('pending');
        card.classList.add(step.denied ? 'denied' : 'done');
        const r = card.querySelector('.tc-result');
        if (step.result && String(step.result).trim()){ r.hidden = false; r.textContent = step.result; }
      }
    }
    scrollDown();
  });

  window.api.onAgentApproval(({ requestId, approvalId, info }) => {
    if (requestId !== currentRequest || !agentContainer) return;
    const steps = agentContainer.querySelector('.agent-steps');
    const cards = steps.querySelectorAll('.tool-card');
    const last = cards[cards.length - 1];
    const argStr = info.args ? escapeHtml(JSON.stringify(info.args, null, 2)) : '';
    const prompt = document.createElement('div');
    prompt.className = 'approval';
    prompt.innerHTML = `<div class="ap-msg"><b>${escapeHtml(info.tool)}</b> wants to run</div>`+
      (argStr ? `<pre class="ap-args">${argStr}</pre>` : '')+
      `<div class="ap-btns"><button class="ap-no">Deny</button><button class="ap-yes">Allow</button></div>`;
    (last || steps).appendChild(prompt);
    prompt.querySelector('.ap-yes').onclick = () => { window.api.approveAgent({ approvalId, approved: true }); prompt.remove(); };
    prompt.querySelector('.ap-no').onclick = () => { window.api.approveAgent({ approvalId, approved: false }); prompt.remove(); };
    scrollDown();
  });

  window.api.onAgentFinal(async ({ requestId, content }) => {
    if (requestId !== currentRequest || !agentContainer) return;
    const reason = agentContainer.querySelector('.agent-reason');
    const text = content || reasonBuffer || '';
    if (reason){ reason.hidden = true; reason.innerHTML = ''; }
    agentContainer.querySelector('.agent-final').innerHTML = text ? renderMarkdown(text) : '';
    await window.api.addMessage({ chatId: state.chatId, role: 'assistant', content: text });
    state.messages.push({ role: 'assistant', content: text });
    agentContainer = null; reasonBuffer = '';
    setGenerating(false);
    scrollDown();
  });

  window.api.onAgentError(({ requestId, error }) => {
    if (requestId !== currentRequest || !agentContainer) return;
    agentContainer.querySelector('.agent-final').innerHTML = `<p style="color:var(--danger)">Agent error: ${escapeHtml(error)}</p>`;
    agentContainer = null;
    setGenerating(false);
  });
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nebula_theme', theme);
  const t = $('themeToggle');
  if (t){
    t.querySelector('.ico').innerHTML = window.ICONS ? (theme === 'light' ? window.ICONS.sun : window.ICONS.moon) : '';
    t.querySelector('.lbl').textContent = theme === 'light' ? 'Light mode' : 'Dark mode';
  }
}

function applySidebar(collapsed){
  document.getElementById('sidebar').classList.toggle('collapsed', collapsed);
  document.querySelector('.app').classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('nebula_sidebar', collapsed ? 'collapsed' : 'open');
}

function bindUI(){
  $('newChat').onclick = () => { state.chatId = null; state.messages = []; renderMessages(); loadChats(); };

  // theme
  applyTheme(localStorage.getItem('nebula_theme') || 'dark');
  $('themeToggle').onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
  };

  // collapsible sidebar
  applySidebar(localStorage.getItem('nebula_sidebar') === 'collapsed');
  $('collapseBtn').onclick = () => applySidebar(true);
  $('expandBtn').onclick = () => applySidebar(false);

  $('modelSwitcher').querySelector('.pill').onclick = () => toggleMenu('modelSwitcher');
  $('modeSwitcher').querySelector('.pill').onclick = () => toggleMenu('modeSwitcher');
  $('modeMenu').querySelectorAll('div').forEach(d => d.onclick = () => { selectMode(d.dataset.mode); $('modeSwitcher').classList.remove('open'); });

  // agent approval toggle
  const apt = $('approvalToggle');
  if (apt){
    const sync = () => {
      const safe = state.requireApproval;
      apt.classList.toggle('on', safe);
      apt.classList.toggle('danger', !safe);
      apt.querySelector('.pill-ico').innerHTML = window.ICONS ? (safe ? window.ICONS.lock : window.ICONS.unlock) : '';
      apt.querySelector('.lbl').textContent = safe ? 'Ask first' : 'Auto-run';
      apt.title = safe ? 'Asks before each action' : 'Runs actions WITHOUT asking';
    };
    sync();
    apt.onclick = () => {
      if (state.requireApproval && !confirm('Turn OFF approvals?\n\nThe agent will read, edit, delete files and run commands WITHOUT asking. Only do this if you trust the model and task.')) return;
      state.requireApproval = !state.requireApproval;
      localStorage.setItem('nebula_approval', state.requireApproval ? 'on' : 'off');
      sync();
    };
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.switcher')) document.querySelectorAll('.switcher').forEach(s => s.classList.remove('open'));
  });
  selectMode(state.mode);

  const input = $('input');
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); } });
  $('sendBtn').onclick = () => { if (state.streaming) stopGenerating(); else send(); };

  $('profileBtn').onclick = () => $('profileModal').classList.add('open');
  $('profileModal').onclick = (e) => { if (e.target.id === 'profileModal') e.currentTarget.classList.remove('open'); };
  $('logoutBtn').onclick = () => { clearSession(); location.href = 'login.html'; };
  $('saveProfile').onclick = async () => {
    const res = await window.api.updateProfile({ userId: user.id, displayName: $('editName').value, avatar: $('editAvatar').value });
    if (res.ok){ Object.assign(user, res.user); saveSession(user); renderProfile(); $('profileModal').classList.remove('open'); }
  };
}

function toggleMenu(id){
  const el = $(id);
  const willOpen = !el.classList.contains('open');
  document.querySelectorAll('.switcher').forEach(s => s.classList.remove('open'));
  if (willOpen) el.classList.add('open');
}

init();
