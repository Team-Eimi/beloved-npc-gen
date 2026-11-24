(() => {
  const { generate, format, formatType, formatSection, statKeys, statLabels, visibleStatKeys } = NPCGenerator;
  const byId = id => document.getElementById(id);
  let current;
  let statusTimer;
  function notify(message) {
    clearTimeout(statusTimer);
    byId('status').textContent = message;
    statusTimer = setTimeout(() => { byId('status').textContent = ''; }, 4500);
  }
  function render() {
    byId('npc-type').textContent = formatType(current);
    byId('include-magic').checked = current.includeMagic;
    byId('include-magic').disabled = false;
    for (const key of statKeys) {
      byId(`stat-${key}`).textContent = current.stats[key];
      byId(`stat-${key}`).hidden = key === 'MAG' && !current.includeMagic;
      byId(`label-${key}`).hidden = key === 'MAG' && !current.includeMagic;
    }
    for (const field of ['traits', 'resistancesAndVulnerabilities', 'titles', 'skills', 'specialitySkills']) {
      byId(field).textContent = formatSection(current[field]);
    }
    byId('traits').parentElement.hidden = !formatSection(current.traits);
  }
  function formatHtml() {
    const content = document.createElement('div');
    content.style.cssText = 'font-family: Georgia, serif; font-size: 12pt; color: #243d36;';
    const heading = document.createElement('p');
    heading.style.cssText = 'font-size: 18pt; font-weight: bold; margin: 0 0 16px;';
    heading.textContent = formatType(current);
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; table-layout: fixed; width: 100%; margin-bottom: 20px;';
    const headers = table.createTHead().insertRow();
    const values = table.createTBody().insertRow();
    const keys = visibleStatKeys(current);
    for (const key of keys) {
      const header = document.createElement('th');
      header.scope = 'col';
      header.style.cssText = `border: 1px solid #dfe5df; padding: 8px; text-align: center; background-color: #f4f7f3; width: ${100 / keys.length}%;`;
      header.textContent = statLabels[key];
      headers.append(header);
      const value = values.insertCell();
      value.style.cssText = 'border: 1px solid #dfe5df; padding: 10px 8px; text-align: center;';
      value.textContent = current.stats[key] === '' ? '\u00a0' : current.stats[key];
    }
    content.append(heading, table);
    for (const field of ['traits', 'resistancesAndVulnerabilities', 'titles', 'skills', 'specialitySkills']) {
      if (field === 'traits' && !formatSection(current.traits)) continue;
      const paragraph = document.createElement('p');
      paragraph.style.cssText = 'margin: 12px 0; white-space: pre-wrap;';
      const label = document.createElement('strong');
      label.textContent = byId(field).previousElementSibling.textContent;
      paragraph.append(label, document.createTextNode(` ${formatSection(current[field])}`));
      content.append(paragraph);
    }
    return content.outerHTML;
  }
  byId('generate').addEventListener('click', () => {
    current = generate({ includeMagic: byId('include-magic').checked });
    render();
    notify('Stat block updated.');
  });
  byId('include-magic').addEventListener('change', () => {
    if (!current) return;
    current.includeMagic = byId('include-magic').checked;
    render();
  });
  byId('copy').addEventListener('click', async () => {
    const plainText = format(current);
    if (globalThis.ClipboardItem && typeof navigator.clipboard?.write === 'function') {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([formatHtml()], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })]);
        notify('Stat block copied with formatting.');
        return;
      } catch {}
    }
    try { await navigator.clipboard.writeText(plainText); notify('Stat block copied as plain text.'); }
    catch { notify('Clipboard unavailable. You can select and copy the stat block.'); }
  });
  async function initialize() {
    byId('generate').disabled = true;
    byId('copy').disabled = true;
    byId('include-magic').disabled = true;
    try {
      const responses = await Promise.all(['data/rolls.json', 'data/types.json'].map(path => fetch(path)));
      if (responses.some(response => !response.ok)) throw new Error('Rules could not be loaded.');
      const [rolls, types] = await Promise.all(responses.map(response => response.json()));
      NPCGenerator.configure(rolls, types);
      current = generate({ includeMagic: byId('include-magic').checked });
      render();
      byId('generate').disabled = false;
      byId('copy').disabled = false;
    } catch {
      notify('Rules could not be loaded. Use npm run dev to preview the page.');
    }
  }
  if (globalThis.lucide) lucide.createIcons();
  initialize();
})();