// Monochrome inline-SVG icon set. All strokes use currentColor (no colors of
// their own), so they inherit the surrounding text color and theme.
(function(){
  const S = (paths, opts) => {
    const o = opts || {};
    const fill = o.fill ? 'currentColor' : 'none';
    return `<svg viewBox="0 0 24 24" width="${o.size||18}" height="${o.size||18}" `+
      `fill="${fill}" stroke="currentColor" stroke-width="${o.w||1.8}" `+
      `stroke-linecap="round" stroke-linejoin="round" class="icon">${paths}</svg>`;
  };
  const I = {
    // window controls
    min: S('<line x1="5" y1="12" x2="19" y2="12"/>', { w:2 }),
    max: S('<rect x="5" y="5" width="14" height="14" rx="2"/>', { w:2 }),
    restore: S('<rect x="7" y="7" width="11" height="11" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4H18a2 2 0 0 1 2 2v7.5A1.5 1.5 0 0 1 18.5 15H17"/>', { w:2 }),
    close: S('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', { w:2 }),
    // app
    plus: S('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    menu: S('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>'),
    trash: S('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/>'),
    send: S('<line x1="12" y1="20" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>', { w:2.2 }),
    stop: S('<rect x="6" y="6" width="12" height="12" rx="2"/>', { fill:true, w:0 }),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: S('<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/>'),
    lock: S('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: S('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
    bolt: S('<polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2"/>'),
    cpu: S('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>'),
    spark: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>', { fill:true, w:0 }),
    copy: S('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    check: S('<polyline points="5 12 10 17 19 7"/>', { w:2.2 }),
    cross: S('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', { w:2.2 }),
    // tools
    file: S('<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
    edit: S('<path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3z"/><path d="M14 6l4 4"/>'),
    folder: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'),
    terminal: S('<rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="13" y1="15" x2="17" y2="15"/>'),
    chevron: S('<polyline points="6 9 12 15 18 9"/>', { size:14, w:2 })
  };

  // Fill any element that has data-icon="name" with the matching SVG.
  window.fillIcons = (root) => {
    (root || document).querySelectorAll('[data-icon]').forEach(el => {
      const name = el.getAttribute('data-icon');
      if (I[name]) el.innerHTML = I[name];
    });
  };
  window.ICON = (name, opts) => {
    if (opts && (opts.size || opts.w || opts.fill)){
      // re-render with options by re-deriving from the same map is overkill; just scale via style
    }
    return I[name] || '';
  };
  window.ICONS = I;
})();
