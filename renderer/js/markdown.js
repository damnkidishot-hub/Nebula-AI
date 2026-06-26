// Minimal, safe markdown renderer with code canvas support.
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Returns HTML string. Fenced code blocks become a "code canvas".
function renderMarkdown(text){
  let out = '';
  const parts = String(text).split(/```/);
  for (let i = 0; i < parts.length; i++){
    if (i % 2 === 1){
      const nl = parts[i].indexOf('\n');
      let lang = '', code = parts[i];
      if (nl !== -1){ lang = parts[i].slice(0, nl).trim(); code = parts[i].slice(nl + 1); }
      out += codeCanvas(lang || 'code', code.replace(/\n$/, ''));
    } else {
      out += renderInline(parts[i]);
    }
  }
  return out;
}

function codeCanvas(lang, code){
  const html = (typeof window !== 'undefined' && window.highlightCode)
    ? window.highlightCode(code, lang) : escapeHtml(code);
  return `<div class="code-canvas"><div class="head"><span>${escapeHtml(lang)}</span>`+
    `<span class="copy" onclick="copyCode(this)">\u29C9 Copy</span></div>`+
    `<pre><code>${html}</code></pre></div>`;
}

function renderInline(md){
  let html = escapeHtml(md);
  html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  html = html.replace(/^####\s?(.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s?(.*)$/gm, '<h3>$1</h3>');
  html = html.split(/\n{2,}/).map(p => p.trim() ? `<p>${p.replace(/\n/g,'<br>')}</p>` : '').join('');
  return html;
}

function copyCode(el){
  const code = el.closest('.code-canvas').querySelector('code').innerText;
  navigator.clipboard.writeText(code);
  const old = el.textContent; el.textContent = 'Copied!';
  setTimeout(() => el.textContent = old, 1200);
}
