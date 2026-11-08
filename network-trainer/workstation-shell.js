/* Responsive panel controls for the Network Sysadmin workspace.
 * The main application owns the shell and sidebar markup; this adapter only
 * wraps the existing sidebar elements and adds their collapse controls. */
(() => {
  const mount = () => {
    const app = document.getElementById('app');
    const cols = app?.querySelector('#cols');
    if (!cols || cols.querySelector('.side-panel')) return;
    const stateKey = 'network-workbench-panels-v1';
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(stateKey) || '{}') || {}; } catch (_) {}
    const compact = window.matchMedia('(max-width: 760px)').matches;

    const addPanel = (id, title) => {
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
      const body = document.createElement('div');
      body.className = 'side-panel-body';
      body.id = id + 'PanelBody';

      aside.parentNode.replaceChild(panel, aside);
      panel.append(heading, body);
      heading.append(label, toggle);
      body.append(aside);

      const apply = collapsed => {
        panel.dataset.collapsed = String(collapsed);
        body.hidden = collapsed;
        toggle.setAttribute('aria-controls', body.id);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', (collapsed ? 'Expand ' : 'Collapse ') + title.toLowerCase() + ' panel');
        toggle.title = (collapsed ? 'Expand ' : 'Collapse ') + title.toLowerCase() + ' panel';
        toggle.textContent = collapsed ? '›' : '‹';
        try {
          const current = JSON.parse(localStorage.getItem(stateKey) || '{}') || {};
          current[id] = collapsed;
          localStorage.setItem(stateKey, JSON.stringify(current));
        } catch (_) {}
      };
      const initial = typeof saved[id] === 'boolean' ? saved[id] : compact;
      apply(initial);
      toggle.addEventListener('click', () => apply(panel.dataset.collapsed !== 'true'));
    };
    addPanel('brief', 'WORKSPACE');
    addPanel('config', 'INSPECTOR');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
