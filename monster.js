(function (root) {
  const core = typeof module !== 'undefined' && module.exports ? require('./generator.js') : root.NPCGenerator;
  const { roll, sample, weighted } = core;
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
    const stats = Object.fromEntries(statKeys.map(key => [key, roll(rules.statDie, random) * level]));
    const extras = rollExtras(random);
    let magical = false;
    let magicSkillCount = 0;
    const skills = [];
    const choices = [];
    for (const extra of extras) {
      applyModifiers(stats, extra.modifiers, level);
      magical ||= Boolean(extra.enableMagic);
      magicSkillCount += extra.magicSkills ?? 0;
      skills.push(...(extra.skills ?? []));
      if (extra.choice) {
        choices.push({ label: extra.choice.label, value: extra.choice.options[roll([0, extra.choice.options.length - 1], random)] });
      }
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
      stats,
      substats,
      extras: extras.map(extra => ({ category: extra.category, name: extra.name })),
      skills,
      magicSkills: sample(magicSkillList(), magicSkillCount, random),
      choices
    };
  }

  function isMagicKey(key) {
    return key === 'MAG' || (rules.substats.find(substat => substat.key === key)?.from.includes('MAG') ?? false);
  }

  function formatValue(monster, key, value) {
    return isMagicKey(key) && !monster.magical ? `${value} (${notApplicable})` : String(value);
  }

  function statRows(monster) {
    return statKeys.map(key => ({
      key,
      label: statLabels[key],
      value: formatValue(monster, key, monster.stats[key]),
      derived: rules.substats
        .filter(substat => substat.from[0] === key)
        .map(substat => ({ key: substat.key, value: formatValue(monster, substat.key, monster.substats[substat.key]) }))
    }));
  }

  function formatHeading(monster) {
    return `MONSTER | Level: ${monster.level} (Level ${monster.area} area)${monster.magical ? ' | MAGICAL' : ''}`;
  }

  function formatExtra(extra) {
    return extra.category === extra.name ? extra.name : `${extra.category}: ${extra.name}`;
  }

  function sections(monster) {
    return [
      { label: 'Extras:', text: monster.extras.map(formatExtra).join(', ') },
      ...monster.choices.map(choice => ({ label: `${choice.label}:`, text: choice.value })),
      { label: 'Skills:', text: monster.skills.map(skill => `${skill.name}: ${skill.description}`).join('\n') },
      ...(monster.magical ? [{ label: 'Magic Skills:', text: monster.magicSkills.map(skill => `${skill.name} (${skill.school}): ${skill.description}`).join('\n') }] : [])
    ];
  }

  function format(monster) {
    return [
      formatHeading(monster),
      ...statRows(monster).map(row => [`${row.label}: ${row.value}`, ...row.derived.map(entry => `${entry.key}: ${entry.value}`)].join(' | ')),
      '',
      ...sections(monster).map(section => `${section.label} ${section.text}`)
    ].join('\n');
  }

  const api = { statKeys, statLabels, notApplicable, configure, rollLevel, rollExtras, applyModifiers, magicSkillList, generate, isMagicKey, formatValue, statRows, formatHeading, sections, format };
  if (typeof module !== 'undefined' && module.exports) {
    configure(require('./data/monsters.json'));
    module.exports = api;
  }
  else root.MonsterGenerator = api;
})(globalThis);
