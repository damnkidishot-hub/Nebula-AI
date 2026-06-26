// Injects a custom frameless titlebar with minimize / maximize / close.
// Depends on icons.js (window.ICONS) and the preload-exposed window.win API.
(function(){
  function build(){
    const bar = document.createElement('div');
    bar.className = 'titlebar';
    bar.innerHTML =
      `<div class="tb-drag"><span class="tb-title">Nebula AI</span></div>`+
      `<div class="tb-controls">`+
        `<button class="tb-btn" id="tbMin" title="Minimize">${window.ICONS.min}</button>`+
        `<button class="tb-btn" id="tbMax" title="Maximize">${window.ICONS.max}</button>`+
        `<button class="tb-btn tb-close" id="tbClose" title="Close">${window.ICONS.close}</button>`+
      `</div>`;
    document.body.prepend(bar);

    document.getElementById('tbMin').onclick = () => window.win.minimize();
    document.getElementById('tbClose').onclick = () => window.win.close();
    const maxBtn = document.getElementById('tbMax');
    const syncMax = async () => {
      const m = await window.win.isMaximized();
      maxBtn.innerHTML = m ? window.ICONS.restore : window.ICONS.max;
    };
    maxBtn.onclick = async () => { await window.win.maximize(); syncMax(); };
    syncMax();
  }
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
