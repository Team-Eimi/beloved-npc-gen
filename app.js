(() => {
  const { generate, format, formatType, formatSection, statLabels, visibleStatKeys } = NPCGenerator;
  const byId = id => document.getElementById(id);
  const npcSections = [
    ['traits', 'Traits:'],
    ['resistancesAndVulnerabilities', 'Resistances & Vulnerabilities:'],
    ['attack', 'Attack:'],
    ['relationships', 'Relationships & Organizations:'],
    ['titles', 'Titles:'],
    ['skills', 'Skills:'],
    ['specialitySkills', 'Speciality Skills:'],
    ['magicSkills', 'Magic Skills:']
  ];
  let current;
  let statusTimer;
  function notify(message) {
    clearTimeout(statusTimer);
    byId('status').textContent = message;
    statusTimer = setTimeout(() => { byId('status').textContent = ''; }, 4500);
  }
  function npcView(npc) {
    const keys = visibleStatKeys(npc);
    return {
      heading: formatType(npc),
      layout: 'row',
      headers: keys.map(key => statLabels[key]),
      rows: [keys.map(key => ({ text: String(npc.stats[key]) }))],
      sections: npcSections
        .filter(([field]) => (field !== 'traits' || formatSection(npc.traits))
          && (field !== 'magicSkills' || npc.magicSkills.length)
          && (field !== 'resistancesAndVulnerabilities' || NPCGenerator.visibleResistances(npc[field]).length))
        .map(([field, label]) => ({
          label,
          text: field === 'resistancesAndVulnerabilities' ? NPCGenerator.visibleResistances(npc[field]).join('\n')
            : field === 'relationships' || field === 'magicSkills' ? npc[field].join('\n')
            : field === 'attack' ? NPCGenerator.formatAttacks(npc) : formatSection(npc[field])
        })),
      plainText: format(npc)
    };
  }
  function monsterView(monster) {
    return {
      heading: MonsterGenerator.formatHeading(monster),
      layout: 'sheet',
      sheet: MonsterGenerator.sheet(monster),
      sections: MonsterGenerator.sections(monster),
      plainText: MonsterGenerator.format(monster)
    };
  }
  function currentView() {
    return current.kind === 'monster' ? monsterView(current) : npcView(current);
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function sheetLine(entry, labelClass) {
    const line = element('div', 'sheet-line');
    const value = element('span', `sheet-value${entry.muted ? ' muted' : ''}`, entry.value);
    line.append(element('span', labelClass, entry.label), value);
    return line;
  }
  function renderSheet(sheet) {
    const stats = element('div', 'sheet-panel');
    stats.append(...sheet.stats.map(entry => sheetLine(entry, 'sheet-label stat-key')));
    const combat = element('div', 'sheet-panel');
    combat.append(...sheet.combat.map(entry => sheetLine(entry, 'sheet-label')));
    const side = element('div', 'sheet-panel sheet-side');
    side.append(...sheet.side.map(entry => {
      const block = element('div', 'side-block');
      block.append(element('h3', 'side-title', entry.label));
      if (entry.value !== '') {
        const line = element('p', 'side-value');
        line.append(document.createTextNode(entry.prefix), element('span', entry.muted ? 'muted' : '', entry.value));
        block.append(line);
      }
      return block;
    }));
    byId('monster-sheet').replaceChildren(stats, combat, side);
  }
  function renderTable(view) {
    const table = byId('stats-table');
    table.classList.toggle('stats-row', view.layout === 'row');
    const headerRow = document.createElement('tr');
    for (const header of view.headers) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = header;
      headerRow.append(cell);
    }
    byId('stat-headers').replaceChildren(headerRow);
    byId('stat-values').replaceChildren(...view.rows.map(values => {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = value.text;
        cell.classList.toggle('muted', Boolean(value.muted));
        row.append(cell);
      }
      return row;
    }));
  }
  function render() {
    const view = currentView();
    const isMonster = current.kind === 'monster';
    byId('npc-type').textContent = view.heading;
    byId('include-magic').checked = isMonster ? MonsterGenerator.showsMagic(current) : current.includeMagic;
    byId('include-magic').disabled = false;
    byId('stats-table').hidden = view.layout === 'sheet';
    byId('monster-sheet').hidden = view.layout !== 'sheet';
    if (view.layout === 'sheet') renderSheet(view.sheet);
    else renderTable(view);
    byId('details').replaceChildren(...view.sections.map(section => {
      const wrapper = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = section.label;
      const definition = document.createElement('dd');
      definition.textContent = section.text;
      wrapper.append(term, definition);
      return wrapper;
    }));
  }
  const cellStyle = 'border: 1px solid #dfe5df; padding: 10px 8px; text-align: center; white-space: pre-wrap;';
  function htmlCell(row, text, muted, extra = '') {
    const cell = row.insertCell();
    cell.style.cssText = `${cellStyle}${muted ? ' color: #9aa49e;' : ''}${extra}`;
    cell.textContent = text === '' ? '\u00a0' : text;
    return cell;
  }
  function htmlTable(view) {
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; table-layout: fixed; width: 100%; margin-bottom: 20px;';
    if (view.layout === 'sheet') {
      const body = table.createTBody();
      const perBlock = view.sheet.stats.length / view.sheet.side.length;
      view.sheet.stats.forEach((stat, index) => {
        const row = body.insertRow();
        htmlCell(row, stat.label, false, ' font-weight: bold;');
        htmlCell(row, stat.value, stat.muted);
        htmlCell(row, view.sheet.combat[index].label, false, ' font-weight: bold;');
        htmlCell(row, view.sheet.combat[index].value, view.sheet.combat[index].muted);
        if (index % perBlock === 0) {
          const entry = view.sheet.side[index / perBlock];
          const cell = htmlCell(row, `${entry.label}\n${entry.prefix}${entry.value}`.trim(), entry.muted, ' vertical-align: top;');
          cell.rowSpan = perBlock;
        }
      });
      return table;
    }
    const headers = table.createTHead().insertRow();
    for (const label of view.headers) {
      const header = document.createElement('th');
      header.scope = 'col';
      header.style.cssText = `border: 1px solid #dfe5df; padding: 8px; text-align: center; background-color: #f4f7f3; width: ${100 / view.headers.length}%;`;
      header.textContent = label;
      headers.append(header);
    }
    const body = table.createTBody();
    for (const values of view.rows) {
      const row = body.insertRow();
      for (const value of values) htmlCell(row, value.text, value.muted);
    }
    return table;
  }
  function formatHtml() {
    const view = currentView();
    const content = document.createElement('div');
    content.style.cssText = 'font-family: Georgia, serif; font-size: 12pt; color: #243d36;';
    const heading = document.createElement('p');
    heading.style.cssText = 'font-size: 18pt; font-weight: bold; margin: 0 0 16px;';
    heading.textContent = view.heading;
    content.append(heading, htmlTable(view));
    for (const section of view.sections) {
      const paragraph = document.createElement('p');
      paragraph.style.cssText = 'margin: 12px 0; white-space: pre-wrap;';
      const label = document.createElement('strong');
      label.textContent = section.label;
      paragraph.append(label, document.createTextNode(` ${section.text}`));
      content.append(paragraph);
    }
    return content.outerHTML;
  }
  function fillSelect(select, options, placeholder) {
    select.replaceChildren();
    if (placeholder) select.append(new Option(placeholder, ''));
    for (const value of options) select.append(new Option(String(value), String(value)));
  }
  function renderSubtypeOptions() {
    const entry = NPCGenerator.listTypes().find(value => value.type === byId('type-select').value);
    const subtypes = entry?.subtypes ?? [];
    fillSelect(byId('subtype-select'), subtypes, subtypes.length ? '' : '—');
    if (entry?.defaultSubtype) byId('subtype-select').value = entry.defaultSubtype;
    byId('subtype-select').disabled = !subtypes.length;
  }
  function selectionOptions() {
    return {
      type: byId('type-select').value,
      subtype: byId('subtype-select').value || undefined,
      includeMagic: byId('include-magic').checked
    };
  }
  byId('type-select').addEventListener('change', renderSubtypeOptions);
  byId('generate').addEventListener('click', () => {
    current = generate(selectionOptions());
    render();
    notify('Character stat block updated.');
  });
  byId('generate-monster').addEventListener('click', () => {
    current = MonsterGenerator.generate({ level: Number(byId('level-select').value) });
    render();
    notify('Monster stat block updated.');
  });
  byId('include-magic').addEventListener('change', () => {
    if (!current) return;
    current.includeMagic = byId('include-magic').checked;
    render();
  });
  byId('copy').addEventListener('click', async () => {
    const plainText = currentView().plainText;
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
    for (const id of ['generate', 'generate-monster', 'copy', 'include-magic', 'type-select', 'subtype-select', 'level-select']) byId(id).disabled = true;
    try {
      const paths = ['data/rolls.json', 'data/types.json', 'data/monsters.json'];
      const responses = await Promise.all(paths.map(path => fetch(path)));
      if (responses.some(response => !response.ok)) throw new Error('Rules could not be loaded.');
      const [rolls, types, monsters] = await Promise.all(responses.map(response => response.json()));
      NPCGenerator.configure(rolls, types, monsters);
      MonsterGenerator.configure(monsters);
      fillSelect(byId('type-select'), NPCGenerator.listTypes().map(value => value.type));
      renderSubtypeOptions();
      fillSelect(byId('level-select'), monsters.levels);
      current = generate(selectionOptions());
      render();
      for (const id of ['generate', 'generate-monster', 'copy', 'type-select', 'level-select']) byId(id).disabled = false;
    } catch {
      notify('Rules could not be loaded. Use npm run dev to preview the page.');
    }
  }
  if (globalThis.lucide) lucide.createIcons();
  initialize();
})();
