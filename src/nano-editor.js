(function(root) {
'use strict';
function createModel(initialValue, write) {
  let value = String(initialValue == null ? '' : initialValue), dirty = false;
  return {
    get value() { return value; },
    get dirty() { return dirty; },
    setValue(next) { value = String(next); dirty = true; },
    save() {
      const error = write(value);
      if (error) return error;
      dirty = false;
      return null;
    }
  };
}
function open(options) {
  const doc = root.document;
  if (! doc || !options || typeof options.write !== 'function') return false;
  const model = createModel(options.value, options.write);
  const previousFocus = doc.activeElement;
  const overlay = doc.createElement('div');
  overlay.className = 'nano-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'nanoTitle');
  const panel = doc.createElement('section');
  panel.className = 'nano-panel';
  const header = doc.createElement('header');
  header.className = 'nano-header';
  const title = doc.createElement('strong');
  title.id = 'nanoTitle';
  title.textContent = 'GNU nano · ' + options.path;
  const help = doc.createElement('span');
  help.textContent = 'Ctrl+S Save · Esc Exit';
  header.append(title, help);
  const area = doc.createElement('textarea');
  area.className = 'nano-editor';
  area.setAttribute('aria-label', 'File contents');
  area.spellcheck = false;
  area.value = model.value;
  const status = doc.createElement('p');
  status.className = 'nano-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Editing ' + options.path;
  const actions = doc.createElement('footer');
  actions.className = 'nano-actions';
  const exit = doc.createElement('button');
  exit.type = 'button'; exit.className = 'btn'; exit.textContent = 'Exit without saving';
  const save = doc.createElement('button');
  save.type = 'button'; save.className = 'btn primary'; save.textContent = 'Save';
  actions.append(exit, save);
  panel.append(header, area, status, actions);
  overlay.append(panel);
  doc.body.append(overlay);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    doc.removeEventListener('keydown', keydown, true);
    overlay.remove();
    if (options.onClose) options.onClose();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const doSave = () => {
    model.setValue(area.value);
    const error = model.save();
    if (error) { status.textContent = 'Save failed: ' + error; status.dataset.state = 'error'; return; }
    status.textContent = 'Saved ' + options.path;
    status.dataset.state = 'saved';
    if (options.onSave) options.onSave();
  };
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); doSave(); }
    else if (event.key === 'Tab' && event.target === area) {
      event.preventDefault();
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
    }
  };
  save.addEventListener('click', doSave);
  exit.addEventListener('click', close);
  doc.addEventListener('keydown', keydown, true);
  area.focus();
  return true;
}
const api = { createModel, open };
root.LSANanoEditor = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
