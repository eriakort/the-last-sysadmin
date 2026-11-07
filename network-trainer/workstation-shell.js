/* Transitional shell adapter for the committed standalone bundle.
 * The next build inlines the updated ui.js; this adapter then safely no-ops. */
(() => {
  const mount = () => {
    const app = document.getElementById('app');
    if (!app || app.querySelector('#shell')) return;
    const top = app.querySelector('#top');
    const cols = app.querySelector('#cols');
    if (!top || !cols) return;
    const shell = document.createElement('div');
    shell.id = 'shell';
    const rail = document.createElement('aside');
    rail.id = 'navRail';
    rail.setAttribute('aria-label', 'Network workspace navigation');
    rail.innerHTML = `
      <div class="nav-brand"><span class="nav-brand-mark" aria-hidden="true">N</span><div><strong>NETWORK OPS</strong><small>Engineering workstation</small></div></div>
      <div class="nav-section">Workspace</div>
      <button class="nav-item" type="button" disabled title="Operations overview arrives in the next implementation phase"><span class="nav-glyph">▦</span>Overview<span class="nav-soon">Next</span></button>
      <button class="nav-item" id="navIncidents" type="button"><span class="nav-glyph">◈</span>Incidents</button>
      <button class="nav-item" id="navWorkbench" type="button" aria-current="page"><span class="nav-glyph">⌘</span>Workbench</button>
      <button class="nav-item" type="button" disabled title="Infrastructure inventory arrives in a later phase"><span class="nav-glyph">▤</span>Infrastructure<span class="nav-soon">Next</span></button>
      <div class="nav-section">Reference & records</div>
      <button class="nav-item" type="button" disabled title="Knowledge centre arrives in a later phase"><span class="nav-glyph">⌕</span>Knowledge<span class="nav-soon">Next</span></button>
      <button class="nav-item" id="navJournal" type="button"><span class="nav-glyph">▧</span>Journal</button>
      <div class="nav-spacer"></div>
      <div class="nav-foot">LAB STATUS · SIMULATED<br>LOCAL PROGRESS ENABLED</div>`;
    const main = document.createElement('div');
    main.id = 'mainArea';
    app.insertBefore(shell, top);
    shell.append(rail, main);
    main.append(top, cols);

    // Keep application-owned panel IDs intact; only add a presentation wrapper.
    const panelStateKey = 'network-workbench-panels-v1';
    let savedPanels = {};
    try { savedPanels = JSON.parse(localStorage.getItem(panelStateKey) || '{}') || {}; } catch (_) {}
    const compactLayout = window.matchMedia('(max-width: 760px)').matches;
    const makePanel = (id, title, defaultCollapsed) => {
      const aside = cols.querySelector('#' + id);
      if (!aside) return;
      const panel = document.createElement('section');
      panel.className = 'side-panel';
      panel.id = id + 'Panel';
      panel.dataset.panel = id;
      const heading = document.createElement('div');
      heading.className = 'side-panel-head';
      const label = document.createElement('strong');
      label.textContent = title;
      const toggle = document.createElement('button');
      toggle.className = 'btn sm side-panel-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', id);
      const body = document.createElement('div');
      body.className = 'side-panel-body';
      body.id = id + 'PanelBody';
      aside.parentNode.replaceChild(panel, aside);
      panel.append(heading, body);
      heading.append(label, toggle);
      body.append(aside);
      const collapsed = typeof savedPanels[id] === 'boolean' ? savedPanels[id] : defaultCollapsed;
      const apply = value => {
        panel.dataset.collapsed = String(value);
        body.hidden = value;
        toggle.setAttribute('aria-expanded', String(!value));
        toggle.setAttribute('aria-label', (value ? 'Expand ' : 'Collapse ') + title.toLowerCase() + ' panel');
        toggle.title = (value ? 'Expand ' : 'Collapse ') + title.toLowerCase() + ' panel';
        toggle.textContent = value ? '›' : '‹';
        try {
          const current = JSON.parse(localStorage.getItem(panelStateKey) || '{}') || {};
          current[id] = value;
          localStorage.setItem(panelStateKey, JSON.stringify(current));
        } catch (_) {}
      };
      toggle.addEventListener('click', () => apply(panel.dataset.collapsed !== 'true'));
      apply(collapsed);
    };
    makePanel('brief', 'WORKSPACE', compactLayout);
    makePanel('config', 'INSPECTOR', compactLayout);

    rail.querySelector('#navIncidents').addEventListener('click', () => document.getElementById('btnQueue')?.click());
    rail.querySelector('#navJournal').addEventListener('click', () => document.getElementById('btnJournal')?.click());
    rail.querySelector('#navWorkbench').addEventListener('click', () => document.getElementById('tin')?.focus());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();