(function (root) {
  const statKeys = ['STR', 'CON', 'CHA', 'INT', 'AGI', 'MAG'];
  const statLabels = { STR: 'Strength', CON: 'Constitution', CHA: 'Charm', INT: 'Intelligence', AGI: 'Agility', MAG: 'Magic' };
  let rules;
  let typeRules;

  function configure(rolls, types) {
    rules = rolls;
    typeRules = types;
  }

  function roll(range, random = Math.random) {
    return range[0] + Math.floor(random() * (range[1] - range[0] + 1));
  }

  function sample(values, count, random = Math.random) {
    const available = [...values];
    const chosen = [];
    while (chosen.length < count && available.length) {
      chosen.push(available.splice(roll([0, available.length - 1], random), 1)[0]);
    }
    return chosen;
  }

  function weighted(values, random = Math.random) {
    const eligible = values.filter(value => Number.isFinite(value.weight) && value.weight > 0);
    const total = eligible.reduce((sum, value) => sum + value.weight, 0);
    if (!total) return undefined;
    let position = random() * total;
    for (const value of eligible) {
      position -= value.weight;
      if (position < 0) return value;
    }
    return eligible.at(-1);
  }

  function applyModifiers(stats, modifiers = [], random = Math.random) {
    for (const modifier of modifiers) {
      const keys = modifier.keys.includes('ALL') ? statKeys : modifier.keys;
      for (const key of keys) stats[key] += roll(modifier.amount, random);
    }
  }

  function rollLevel(range, random = Math.random) {
    const bands = rules.levels?.[range.join('-')];
    const selectedRange = bands?.length > 1
      ? weighted(bands, random).range
      : bands?.[0]?.range ?? range;
    return roll(selectedRange, random);
  }

  function selectType(random = Math.random) {
    return weighted(typeRules.types, random)?.type;
  }

  function listTypes() {
    return (typeRules?.types ?? []).map(value => ({ type: value.type, subtypes: (value.subtypes ?? []).map(subtype => subtype.subtype) }));
  }

  function generateStats(selection, random = Math.random) {
    const stats = Object.fromEntries(statKeys.map(key => [key, roll(rules.stats.base, random)]));
    for (const group of [rules.stats.weaknesses, rules.stats.strengths]) {
      for (const key of sample(statKeys, roll(group.count, random), random)) stats[key] += roll(group.amount, random);
    }
    const extraordinary = rules.stats.extraordinary;
    if (random() < extraordinary.chance) {
      const [first] = sample(statKeys, 1, random);
      stats[first] += roll(extraordinary.amount, random);
      if (random() < extraordinary.additionalChance) {
        const [second] = sample(statKeys.filter(key => key !== first), 1, random);
        stats[second] += roll(extraordinary.amount, random);
      }
    }
    const ageRule = rules.age.adjustments.find(value => selection.age >= value.min && selection.age <= value.max);
    applyModifiers(stats, ageRule?.modifiers, random);
    return stats;
  }

  function rollTrait(category, stats, random = Math.random) {
    const rule = rules.traits[category];
    if (!rule) return undefined;
    const value = roll(rule.range, random);
    const outcome = rule.outcomes.find(result => value >= result.min && value <= result.max);
    applyModifiers(stats, outcome?.modifiers, random);
    const output = (outcome ? outcome.output : rule.defaultOutput) ?? null;
    return { category, roll: value, label: rule.label, output, skills: outcome?.skills ?? [] };
  }

  function generateTraits(selection, stats, random = Math.random) {
    const results = [...new Set(selection.traitCategories ?? [])].map(category => rollTrait(category, stats, random)).filter(Boolean);
    return {
      traits: results.filter(result => result.output !== null).map(result => `${result.label}: ${result.output}`),
      skills: results.flatMap(result => result.skills),
      rolls: results
    };
  }

  function generateResistancesAndVulnerabilities(selection, stats) {}
  function generateTitles(selection, stats, random = Math.random) {
    const count = selection.rolls?.magicTypeTitles ?? 0;
    const magicTypes = rules.titles?.magicTypes ?? [];
    return sample(magicTypes, count, random).map(value => value.charAt(0).toUpperCase() + value.slice(1));
  }
  function generateSkills(selection, stats) {}
  function generateSpecialitySkills(selection, stats) {}

  function generate(options = {}, random = Math.random) {
    if (!rules || !typeRules) throw new Error('Load the generator JSON rules before generating.');
    const selected = options.type === undefined ? api.selectType(random) : { type: options.type, subtype: options.subtype };
    const selection = typeof selected === 'string'
      ? { type: selected, subtype: '' }
      : { type: selected?.type ?? '', subtype: selected?.subtype ?? '' };
    selection.age = options.age ?? roll(rules.age.range, random);
    const type = typeRules.types.find(value => value.type.toLowerCase() === selection.type.toLowerCase());
    const subtype = selection.subtype
      ? type?.subtypes?.find(value => value.subtype === selection.subtype)
      : selection.age <= type?.childMaxAge
        ? type.subtypes.find(value => value.subtype === 'Child')
        : weighted(type?.subtypes ?? [], random);
    selection.subtype = subtype?.subtype ?? selection.subtype;
    selection.traitCategories = options.traitCategories ?? subtype?.traits ?? [];
    selection.rolls = subtype?.rolls ?? {};
    const generatedStats = api.generateStats(selection, random) ?? {};
    const stats = Object.fromEntries(statKeys.map(key => [key, generatedStats[key] ?? '']));
    applyModifiers(stats, subtype?.modifiers, random);
    const traitResult = api.generateTraits(selection, stats, random) ?? [];
    const traitData = typeof traitResult === 'string' || Array.isArray(traitResult) ? { traits: traitResult } : traitResult;
    const level = subtype?.levelRange ? rollLevel(subtype.levelRange, random) : undefined;
    if (level !== undefined && subtype.levelBonus) {
      const eligible = subtype.magic === false ? statKeys.filter(key => key !== 'MAG') : statKeys;
      for (let currentLevel = 0; currentLevel < level; currentLevel++) {
        for (const key of sample(eligible, subtype.levelBonus.randomCount, random)) stats[key] += subtype.levelBonus.randomAmount;
        for (const [key, amount] of Object.entries(subtype.levelBonus.fixed ?? {})) stats[key] += amount;
      }
    }
    if (subtype?.ageBonus && level > subtype.ageBonus.levelAbove) {
      selection.age += roll(subtype.ageBonus.amount, random);
    }
    const generatedSkills = api.generateSkills(selection, stats) ?? [];
    return {
      ...selection,
      level,
      magicRequired: subtype?.magic,
      includeMagic: subtype?.magic ?? options.includeMagic ?? false,
      stats,
      traits: traitData.traits ?? [],
      traitRolls: traitData.rolls ?? [],
      resistancesAndVulnerabilities: api.generateResistancesAndVulnerabilities(selection, stats) ?? [],
      titles: api.generateTitles(selection, stats, random) ?? [],
      skills: [...(typeof generatedSkills === 'string' ? [generatedSkills] : generatedSkills), ...(traitData.skills ?? [])],
      specialitySkills: api.generateSpecialitySkills(selection, stats) ?? []
    };
  }

  function formatType(npc) {
    const type = !npc.type && !npc.subtype ? 'TYPE (Subtype)' : `${npc.type || 'TYPE'}${npc.subtype ? ` (${npc.subtype})` : ''}`;
    return `${type}${npc.age !== undefined ? ` | Age: ${npc.age}` : ''}${npc.level !== undefined ? ` | Level: ${npc.level}` : ''}`;
  }

  function formatSection(value) {
    return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }

  function format(npc) {
    return [
      formatType(npc),
      ...visibleStatKeys(npc).map(key => `${statLabels[key]}: ${npc.stats[key]}`),
      '',
      ...(formatSection(npc.traits) ? [`Traits: ${formatSection(npc.traits)}`] : []),
      `Resistances & Vulnerabilities: ${formatSection(npc.resistancesAndVulnerabilities)}`,
      `Titles: ${formatSection(npc.titles)}`,
      `Skills: ${formatSection(npc.skills)}`,
      `Speciality Skills: ${formatSection(npc.specialitySkills)}`
    ].join('\n');
  }

  function visibleStatKeys(npc) {
    return statKeys.filter(key => key !== 'MAG' || npc.includeMagic);
  }

  const api = {
    statKeys, statLabels, configure, roll, rollLevel, sample, weighted, applyModifiers, rollTrait, visibleStatKeys,
    selectType, listTypes, generateStats, generateTraits,
    generateResistancesAndVulnerabilities, generateTitles,
    generateSkills, generateSpecialitySkills, generate, formatType, formatSection, format
  };
  if (typeof module !== 'undefined' && module.exports) {
    configure(require('./data/rolls.json'), require('./data/types.json'));
    module.exports = api;
  }
  else root.NPCGenerator = api;
})(globalThis);