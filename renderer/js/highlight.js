// Self-contained, per-language syntax highlighter (no external deps, offline).
// Pick rules by the code-fence language; falls back to a generic tokenizer.
(function(){
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  const KW = {
    javascript: ['function','return','const','let','var','if','else','for','while','do','switch','case','break','continue','new','class','extends','super','this','import','from','export','default','async','await','try','catch','finally','throw','typeof','instanceof','in','of','yield','static','get','set','void','delete','null','undefined','true','false'],
    typescript: ['function','return','const','let','var','if','else','for','while','do','switch','case','break','continue','new','class','extends','super','this','import','from','export','default','async','await','try','catch','finally','throw','typeof','instanceof','in','of','yield','static','get','set','void','delete','null','undefined','true','false','interface','type','enum','implements','public','private','protected','readonly','namespace','as','keyof','number','string','boolean','any','unknown','never'],
    python: ['def','return','if','elif','else','for','while','break','continue','class','import','from','as','pass','lambda','None','True','False','and','or','not','is','in','with','global','nonlocal','try','except','finally','raise','assert','yield','async','await','self','del'],
    json: ['true','false','null'],
    bash: ['if','then','else','elif','fi','for','while','do','done','case','esac','function','return','echo','export','local','read','exit','cd','source'],
    java: ['public','private','protected','class','interface','extends','implements','static','final','void','int','long','float','double','boolean','char','new','return','if','else','for','while','switch','case','break','continue','try','catch','finally','throw','throws','import','package','this','super','null','true','false','abstract','enum'],
    cpp: ['int','float','double','char','bool','void','class','struct','enum','public','private','protected','const','static','return','if','else','for','while','switch','case','break','continue','new','delete','namespace','using','template','typename','nullptr','true','false','auto','include'],
    go: ['func','package','import','var','const','type','struct','interface','return','if','else','for','range','switch','case','break','continue','defer','go','chan','map','nil','true','false','string','int','error'],
    rust: ['fn','let','mut','const','struct','enum','impl','trait','pub','use','mod','return','if','else','for','while','loop','match','break','continue','self','Some','None','Ok','Err','true','false','async','await']
  };
  const ALIAS = { js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript', py:'python', sh:'bash', shell:'bash', zsh:'bash', 'c++':'cpp', c:'cpp', cc:'cpp', golang:'go', rs:'rust' };

  function tokenize(code, keywords){
    let i = 0; const n = code.length; let out = '';
    const push = (cls, t) => out += `<span class="tok-${cls}">${escapeHtml(t)}</span>`;
    const plain = (t) => out += escapeHtml(t);
    while (i < n){
      const c = code[i]; const two = code.slice(i, i+2);
      if (two === '//' ){ let j=i; while(j<n&&code[j]!=='\n')j++; push('comment',code.slice(i,j)); i=j; continue; }
      if (two === '/*'){ let j=code.indexOf('*/',i); j=j===-1?n:j+2; push('comment',code.slice(i,j)); i=j; continue; }
      if (c === '#'){ let j=i; while(j<n&&code[j]!=='\n')j++; push('comment',code.slice(i,j)); i=j; continue; }
      if (c==='"'||c==="'"||c==='`'){ let j=i+1; while(j<n){ if(code[j]==='\\'){j+=2;continue;} if(code[j]===c){j++;break;} j++; } push('string',code.slice(i,j)); i=j; continue; }
      if (/[0-9]/.test(c) || (c==='.'&&/[0-9]/.test(code[i+1]||''))){ let j=i; while(j<n&&/[0-9a-fA-FxX._]/.test(code[j]))j++; push('number',code.slice(i,j)); i=j; continue; }
      if (/[A-Za-z_$@]/.test(c)){ let j=i; while(j<n&&/[A-Za-z0-9_$@]/.test(code[j]))j++; const w=code.slice(i,j); const after=code[j];
        if (keywords.has(w)) push('keyword',w); else if (after==='(') push('func',w); else plain(w); i=j; continue; }
      if (/[+\-*/%=<>!&|^~?:.,;(){}\[\]]/.test(c)){ push('punct',c); i++; continue; }
      plain(c); i++;
    }
    return out;
  }

  // HTML/XML highlighter (tags + attributes)
  function tokenizeHtml(code){
    return escapeHtml(code)
      .replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g, '$1<span class="tok-keyword">$2</span>')
      .replace(/([a-zA-Z-]+)(=)(&quot;.*?&quot;|".*?"|'.*?')/g, '<span class="tok-func">$1</span>$2<span class="tok-string">$3</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>');
  }

  // CSS highlighter (selectors, properties, values)
  function tokenizeCss(code){
    return escapeHtml(code)
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
      .replace(/([a-z-]+)(\s*:\s*)([^;{}]+)(;?)/gi, '<span class="tok-func">$1</span>$2<span class="tok-string">$3</span>$4')
      .replace(/([.#]?[a-zA-Z0-9_-]+)(\s*\{)/g, '<span class="tok-keyword">$1</span>$2');
  }

  function highlight(code, lang){
    const key = ALIAS[(lang||'').toLowerCase()] || (lang||'').toLowerCase();
    if (key === 'html' || key === 'xml') return tokenizeHtml(code);
    if (key === 'css' || key === 'scss') return tokenizeCss(code);
    const list = KW[key] || KW.javascript;
    return tokenize(code, new Set(list));
  }

  window.highlightCode = highlight;
})();
