function saveSession(user){ localStorage.setItem('nebula_user', JSON.stringify(user)); }
function getSession(){ try{ return JSON.parse(localStorage.getItem('nebula_user')); }catch(_){ return null; } }
function clearSession(){ localStorage.removeItem('nebula_user'); }

function initLogin(){
  if (getSession()) { location.href = 'chat.html'; return; }
  const form = document.getElementById('form');
  const err = document.getElementById('error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await window.api.login({ username, password });
    if (res.ok) { saveSession(res.user); location.href = 'chat.html'; }
    else err.textContent = res.error;
  });
}

function initRegister(){
  const form = document.getElementById('form');
  const err = document.getElementById('error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await window.api.register({ username, password });
    if (res.ok) { saveSession(res.user); location.href = 'chat.html'; }
    else err.textContent = res.error;
  });
}
