(() => {
  const { generate, format, roles } = NPCGenerator;
  const byId = id => document.getElementById(id);
  const storageKey = 'beloved-npc-gen.characters.v1';
  const worldNames = { fantasy: 'Fantasy', modern: 'Modern day', scifi: 'Science fiction' };
  let saved = [];
  let current = generate();
  let nameLocked = false;
  let statusTimer;
  function notify(message) {
    clearTimeout(statusTimer);
    byId('status').textContent = message;
    statusTimer = setTimeout(() => { byId('status').textContent = ''; }, 4500);
  }
  function icons() { if (globalThis.lucide) lucide.createIcons(); }
  function icon(name) {
    const element = document.createElement('i');
    element.dataset.lucide = name;
    return element;
  }
  function persist(next) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); saved = next; return true; }
    catch { notify('Storage is unavailable. Download your character to keep it.'); return false; }
  }
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(data)) saved = data.filter(npc => npc && ['id', 'name', 'role', 'setting', 'disposition', 'trait', 'want', 'secret', 'hook', 'voice'].every(field => typeof npc[field] === 'string') && Object.hasOwn(worldNames, npc.setting));
  } catch { notify('Saved characters could not be loaded on this device.'); }
  function renderSaved() {
    byId('saved-count').textContent = saved.length;
    byId('saved-total').textContent = `${saved.length} character${saved.length === 1 ? '' : 's'}`;
    byId('empty-saved').hidden = saved.length > 0;
    byId('saved-list').replaceChildren();
    saved.forEach(npc => {
      const row = document.createElement('div');
      row.className = 'saved-item';
      const open = document.createElement('button');
      open.className = 'saved-open';
      const name = document.createElement('strong');
      name.textContent = npc.name;
      const details = document.createElement('span');
      details.textContent = `${npc.role} / ${worldNames[npc.setting]}`;
      open.append(name, details);
      open.addEventListener('click', () => {
        current = npc;
        byId('setting').value = npc.setting;
        updateRoles();
        byId('role').value = npc.role;
        const disposition = document.querySelector(`input[name="disposition"][value="${['warm', 'guarded', 'eccentric'].includes(npc.disposition) ? npc.disposition : 'warm'}"]`);
        disposition.checked = true;
        render();
        showView('generator');
      });
      const remove = document.createElement('button');
      remove.className = 'icon-button';
      remove.title = `Delete ${npc.name}`;
      remove.setAttribute('aria-label', remove.title);
      remove.append(icon('trash-2'));
      remove.addEventListener('click', () => {
        if (persist(saved.filter(item => item.id !== npc.id))) { render(); notify(`${npc.name} removed.`); byId('saved-tab').focus(); }
      });
      row.append(open, remove);
      byId('saved-list').append(row);
    });
  }
  function render() {
    byId('character-name').textContent = current.name;
    byId('character-role').textContent = current.role;
    byId('monogram').textContent = current.name.split(/\s+/).map(word => word[0]).slice(0, 2).join('');
    byId('world-tag').textContent = worldNames[current.setting];
    byId('disposition-tag').textContent = current.disposition;
    for (const field of ['trait', 'want', 'secret', 'hook', 'voice']) byId(field).textContent = current[field];
    const isSaved = saved.some(npc => npc.id === current.id);
    byId('save').setAttribute('aria-pressed', String(isSaved));
    byId('save').querySelector('span').textContent = isSaved ? 'Character saved' : 'Save character';
    renderSaved();
    icons();
  }
  function updateRoles() {
    byId('role').replaceChildren(new Option('Surprise me', ''));
    roles[byId('setting').value].forEach(role => byId('role').add(new Option(role, role)));
  }
  function showView(view) {
    byId('generator-view').hidden = view !== 'generator';
    byId('saved-view').hidden = view !== 'saved';
    for (const name of ['generator', 'saved']) {
      byId(`${name}-tab`).classList.toggle('active', name === view);
      if (name === view) byId(`${name}-tab`).setAttribute('aria-current', 'page');
      else byId(`${name}-tab`).removeAttribute('aria-current');
    }
  }
  byId('setting').addEventListener('change', updateRoles);
  byId('generate').addEventListener('click', () => {
    current = generate({ setting: byId('setting').value, role: byId('role').value, disposition: document.querySelector('input[name="disposition"]:checked').value, name: nameLocked ? current.name : undefined });
    render();
    const sheet = document.querySelector('.character');
    sheet.classList.remove('reveal');
    requestAnimationFrame(() => sheet.classList.add('reveal'));
    notify(`Meet ${current.name}, ${current.role.toLowerCase()}.`);
  });
  byId('lock-name').addEventListener('click', () => {
    nameLocked = !nameLocked;
    byId('lock-name').setAttribute('aria-pressed', String(nameLocked));
    const label = nameLocked ? 'Unlock character name' : 'Keep this name when generating';
    byId('lock-name').setAttribute('aria-label', label);
    byId('lock-name').title = label;
    byId('lock-name').replaceChildren(icon(nameLocked ? 'lock' : 'lock-open'));
    icons();
  });
  byId('save').addEventListener('click', () => {
    if (saved.some(npc => npc.id === current.id)) { notify('This character is already saved.'); return; }
    if (persist([current, ...saved])) { render(); notify(`${current.name} saved.`); }
  });
  byId('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(format(current)); notify('Character copied to clipboard.'); }
    catch { notify('Clipboard unavailable. Use Download character instead.'); }
  });
  byId('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([format(current)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Character downloaded.');
  });
  byId('generator-tab').addEventListener('click', () => showView('generator'));
  byId('saved-tab').addEventListener('click', () => showView('saved'));
  updateRoles();
  render();
})();