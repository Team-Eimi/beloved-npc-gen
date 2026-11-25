(function (root) {
  const core = typeof module !== 'undefined' && module.exports ? require('./generator.js') : root.NPCGenerator;
  const { roll, sample, weighted, generateWeapon, formatAttack, generateResistancesAndVulnerabilities, visibleResistances } = core;
  const statKeys = ['STR', 'CON', 'AGI', 'INT', 'CHA', 'MAG'];
  const statLabels = { STR: 'Strength', CON: 'Constitution', AGI: 'Agility', INT: 'Intelligence', CHA: 'Charm', MAG: 'Magic' };
  const notApplicable = 'Not Applicable';
  let rules;

  function configure(monsters) {
    rules = monsters;
  }

  function rollLevel(area, random = Math.random) {
    return Math.max(1, roll([area - rules.levelVariance, area + rules.levelVariance], random));
  }

  function rollExtras(random = Math.random) {
    const chosen = [];
    for (let index = 0; index < rules.extras.count; index++) {
      const entry = weighted(rules.extras.table, random);
      if (!entry) break;
      if (!entry.list) {
        chosen.push({ category: entry.category, ...entry.entry });
        continue;
      }
      const used = chosen.filter(extra => extra.category === entry.category).map(extra => extra.name);
      const [item] = sample(rules[entry.list].filter(value => !used.includes(value.name)), 1, random);
      if (item) chosen.push({ category: entry.category, ...item });
    }
    return chosen;
  }

  function applyModifiers(target, modifiers = [], level) {
    for (const modifier of modifiers) {
      const keys = modifier.key === 'ALL' ? statKeys : [modifier.key];
      for (const key of keys) {
        if (!(key in target)) continue;
        if (modifier.perLevel !== undefined) target[key] += modifier.perLevel * level;
        if (modifier.minimum !== undefined) target[key] = Math.max(target[key], modifier.minimum);
      }
    }
  }

  function magicSkillList() {
    return Object.entries(rules.magic).flatMap(([school, skills]) => skills.map(skill => ({ school, ...skill })));
  }

  function generate(options = {}, random = Math.random) {
    if (!rules) throw new Error('Load the monster JSON rules before generating.');
    const area = options.level ?? rules.levels[roll([0, rules.levels.length - 1], random)];
    const level = rollLevel(area, random);
    const stats = Object.fromEntries(statKeys.map(key => [key, level + roll(rules.statDie, random) * level]));
    const extras = rollExtras(random);
    let magical = false;
    let magicSkillCount = 0;
    const skills = [];
    for (const extra of extras) {
      applyModifiers(stats, extra.modifiers, level);
      magical ||= Boolean(extra.enableMagic);
      magicSkillCount += extra.magicSkills ?? 0;
      skills.push(...(extra.skills ?? []));
    }
    for (const key of statKeys) stats[key] = Math.max(1, stats[key]);
    const substats = Object.fromEntries(rules.substats.map(substat => [
      substat.key,
      substat.from.reduce((sum, key) => sum + Math.floor(stats[key] / rules.substatDivisor), 0)
    ]));
    for (const extra of extras) applyModifiers(substats, extra.modifiers, level);
    return {
      kind: 'monster',
      area,
      level,
      magical,
      includeMagic: magical,
      showCharm: extras.some(extra => extra.showCharm),
      stats,
      substats,
      extras: extras.map(extra => ({ category: extra.category, name: extra.name })),
      skills,
      magicSkills: sample(magicSkillList(), magicSkillCount, random),
      resistancesAndVulnerabilities: generateResistancesAndVulnerabilities(),
      attack: extras.some(extra => extra.usesWeapon)
        ? generateWeapon(random)
        : rules.attacks[roll([0, rules.attacks.length - 1], random)]
    };
  }

  function isMagicKey(key) {
    return key === 'MAG' || (rules.substats.find(substat => substat.key === key)?.from.includes('MAG') ?? false);
  }

  function showsMagic(monster) {
    return monster.includeMagic ?? monster.magical;
  }

  function isMuted(monster, key) {
    return isMagicKey(key) && !showsMagic(monster);
  }

  function formatValue(monster, key, value) {
    return isMuted(monster, key) ? `${value} (${notApplicable})` : String(value);
  }

  function statTotal(monster) {
    const total = statKeys.filter(key => (key !== 'CHA' || monster.showCharm) && !isMuted(monster, key)).reduce((sum, key) => sum + monster.stats[key], 0);
    return Math.floor(total / rules.substatDivisor);
  }

  function sheet(monster) {
    const cell = (key, label, value) => ({ key, label, value: formatValue(monster, key, value), muted: isMuted(monster, key) });
    return {
      stats: rules.sheet.stats.map(key => key === 'CHA' && !monster.showCharm
        ? { key, label: '', value: '', muted: false }
        : cell(key, key, monster.stats[key])),
      combat: rules.sheet.combat.map(key => cell(key, key, monster.substats[key])),
      side: rules.sheet.side.map(entry => {
        if (entry.key) return { ...cell(entry.key, entry.label, monster.substats[entry.key]), prefix: entry.prefix ?? '' };
        if (entry.computed === 'statTotal') return { key: entry.computed, label: entry.label, value: String(statTotal(monster)), prefix: entry.prefix ?? '', muted: false };
        return { label: entry.label, value: '', prefix: '', muted: false };
      })
    };
  }

  function formatHeading(monster) {
    return `MONSTER | Level: ${monster.level} (Level ${monster.area} area)${showsMagic(monster) ? ' | MAGICAL' : ''}`;
  }

  function formatExtra(extra) {
    return extra.category === extra.name ? extra.name : `${extra.category}: ${extra.name}`;
  }

  function sections(monster) {
    const resistances = visibleResistances(monster.resistancesAndVulnerabilities);
    return [
      { label: 'Extras:', text: monster.extras.map(formatExtra).join(', ') },
      ...(resistances.length ? [{ label: 'Resistances & Vulnerabilities:', text: resistances.join('\n') }] : []),
      { label: 'Attack:', text: formatAttack(monster.attack) },
      { label: 'Skills:', text: monster.skills.map(skill => `${skill.name}: ${skill.description}`).join('\n') },
      ...(monster.magicSkills.length ? [{ label: 'Magic Skills:', text: monster.magicSkills.map(skill => `${skill.name} (${skill.school}): ${skill.description}`).join('\n') }] : [])
    ];
  }

  function format(monster) {
    const layout = sheet(monster);
    return [
      formatHeading(monster),
      ...layout.stats.map((stat, index) => `${stat.label ? `${stat.label}: ${stat.value} | ` : ''}${layout.combat[index].label}: ${layout.combat[index].value}`),
      ...layout.side.filter(entry => entry.value !== '').map(entry => `${entry.label} ${entry.prefix}${entry.value}`),
      '',
      ...sections(monster).map(section => `${section.label} ${section.text}`)
    ].join('\n');
  }

  const api = { statKeys, statLabels, notApplicable, configure, rollLevel, rollExtras, applyModifiers, magicSkillList, generate, isMagicKey, showsMagic, formatValue, statTotal, sheet, formatHeading, sections, format };
  if (typeof module !== 'undefined' && module.exports) {
    configure(require('./data/monsters.json'));
    module.exports = api;
  }
  else root.MonsterGenerator = api;
})(globalThis);
