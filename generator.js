(function (root) {
  const statKeys = ['STR', 'CON', 'CHA', 'INT', 'AGI', 'MAG'];
  const statLabels = { STR: 'Strength', CON: 'Constitution', CHA: 'Charm', INT: 'Intelligence', AGI: 'Agility', MAG: 'Magic' };
  let rules;
  let typeRules;
  let magicRules;
  let monsterSkills;

  function configure(rolls, types, monsters) {
    rules = rolls;
    typeRules = types;
    if (monsters) {
      magicRules = monsters.magic;
      monsterSkills = monsters.boss.flatMap(boss => boss.skills ?? []);
    }
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
    return (typeRules?.types ?? []).map(value => {
      const subtypes = value.subtypes ?? [];
      const heaviest = subtypes.filter(subtype => Number.isFinite(subtype.weight)).sort((a, b) => b.weight - a.weight)[0];
      return { type: value.type, subtypes: subtypes.map(subtype => subtype.subtype), defaultSubtype: value.defaultSubtype ?? (heaviest ?? subtypes[0])?.subtype };
    });
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

  function rollTrait(category, stats, random = Math.random, excluded = []) {
    if (category === 'temperament') {
      const available = rules.temperaments.filter(effect => !excluded.includes(effect.name));
      if (!available.length) throw new Error('Not enough distinct temperaments to roll.');
      const effect = available[roll([0, available.length - 1], random)];
      const value = rules.temperaments.indexOf(effect) + 1;
      for (const [key, amount] of Object.entries(effect.stats ?? {})) stats[key] += amount;
      if (effect.randomStats) {
        for (const key of sample(statKeys, effect.randomStats.count, random)) stats[key] += effect.randomStats.amount;
      }
      return { category, roll: value, label: 'Temperament', output: `${effect.name}: ${effect.description}`, skills: [], effect };
    }
    const rule = rules.traits[category];
    if (!rule) return undefined;
    const value = roll(rule.range, random);
    const outcome = rule.outcomes.find(result => value >= result.min && value <= result.max);
    applyModifiers(stats, outcome?.modifiers, random);
    const output = (outcome ? outcome.output : rule.defaultOutput) ?? null;
    return { category, roll: value, label: rule.label, output, skills: outcome?.skills ?? [] };
  }

  function generateTraits(selection, stats, random = Math.random) {
    const results = [];
    for (const category of selection.traitCategories ?? []) {
      if (category !== 'temperament' && results.some(result => result.category === category)) continue;
      const excluded = results.filter(result => result.category === 'temperament').map(result => result.effect.name);
      const result = rollTrait(category, stats, random, excluded);
      if (result) results.push(result);
    }
    return {
      traits: results.filter(result => result.output !== null).map(result => `${result.label}: ${result.output}`),
      skills: results.flatMap(result => result.skills),
      rolls: results
    };
  }

  function generateResistancesAndVulnerabilities() {
    return rules.resistances.map(name => `${name} Resistance: 0%`);
  }
  function applyTraitResistances(resistances, traitRolls) {
    const result = [...resistances];
    for (const { effect } of traitRolls) {
      if (!effect) continue;
      for (const [name, amount] of Object.entries(effect.resistances ?? {})) {
        const index = rules.resistances.indexOf(name);
        if (index < 0) throw new Error(`Unknown resistance: ${name}`);
        const match = result[index].match(/: (-?\d+)%$/);
        if (!match) throw new Error(`Invalid resistance: ${result[index]}`);
        result[index] = `${name} Resistance: ${Number(match[1]) + amount}%`;
      }
      const vulnerabilities = effect.allVulnerabilities ? rules.resistances : effect.vulnerabilities ?? [];
      for (const name of vulnerabilities) {
        const vulnerability = `${name} Vulnerability`;
        if (!result.includes(vulnerability)) result.push(vulnerability);
      }
    }
    return result;
  }
  function visibleResistances(resistances) {
    return resistances.filter(resistance => !/:\s*0%$/.test(resistance));
  }
  function generateArmedWeapon(random = Math.random) {
    const weapons = rules.weapons.groups.flatMap(({ names, ...properties }) => names.map(name => ({ name, ...properties })));
    return weapons[roll([0, weapons.length - 1], random)];
  }
  function generateWeapon(random = Math.random) {
    if (random() < rules.weapons.unarmedChance) return { name: 'Unarmed', damage: 0 };
    return generateArmedWeapon(random);
  }
  function formatAttack(attack, skill) {
    const properties = [
      `+${attack.damage} damage`,
      ...(attack.twoHanded ? ['two-handed'] : []),
      ...(attack.radius ? [`${attack.radius} ft radius`] : []),
      ...(skill ? [`${skill.name}: ${skill.value}%`] : [])
    ];
    return `${attack.name} (${properties.join(', ')})`;
  }
  function formatAttacks(npc) {
    const attacks = [npc.attack, ...npc.skillWeapons];
    return attacks.filter((attack, index) => attacks.findIndex(other => other.name === attack.name) === index)
      .map(attack => {
        const weapon = npc.skillWeapons.find(value => value.name === attack.name);
        const skill = attack.name === 'Unarmed' && npc.brawlSkill !== undefined
          ? { name: 'Brawl', value: npc.brawlSkill }
          : weapon ? { name: 'Weapon skill', value: weapon.skillPercent } : undefined;
        return formatAttack(attack, skill);
      }).join('\n');
  }
  function generateTitles(selection, stats, random = Math.random) {
    const count = selection.rolls?.magicTypeTitles ?? 0;
    const magicTypes = rules.titles?.magicTypes ?? [];
    const titles = sample(magicTypes, count, random).map(value => value.charAt(0).toUpperCase() + value.slice(1));
    const available = [...rules.titles.entries];
    for (let index = 0; index < (selection.rolls?.titles ?? 0); index++) {
      if (random() < rules.titles.newTitleChance) {
        titles.push('Make a new title');
      } else {
        const [title] = sample(available, 1, random);
        if (!title) throw new Error('Not enough distinct titles to roll.');
        available.splice(available.indexOf(title), 1);
        titles.push(`${title.name}: ${title.description}`);
      }
    }
    return titles;
  }
  function skillPool(speciality) {
    const categories = speciality ? rules.specialitySkills : rules.skills.categories;
    const categorized = Object.entries(categories).flatMap(([category, names]) => names.map(name => ({ category, name })));
    return speciality ? categorized : [...rules.skills.standalone.map(name => ({ name })), ...categorized];
  }
  function generateSkillResults(selection, traitData, speciality, random, attackSkills) {
    const pool = skillPool(speciality);
    const allSkills = [...skillPool(false), ...skillPool(true)];
    const results = [];
    const effects = (traitData.rolls ?? []).map(result => result.effect).filter(Boolean);
    const add = (selected, bonus = 0, value) => {
      let skill = selected;
      if (selected.name === 'Weapon (specific)') {
        const weapon = generateArmedWeapon(random);
        skill = { ...selected, name: `Weapon (${weapon.name})`, weapon };
      }
      let existing = results.find(result => result.name === skill.name && result.category === skill.category);
      if (existing) {
        existing.rolls++;
        if (value !== undefined) existing.value = Math.max(existing.value, value);
      } else {
        existing = { ...skill, value: value ?? (speciality ? 0 : 30), rolls: 1 };
        results.push(existing);
      }
      existing.value += bonus;
    };
    const choose = (available, count, bonus = 0, value) => {
      if (available.length < count) throw new Error('Not enough distinct skills to roll.');
      for (const skill of sample(available, count, random)) add(skill, bonus, value);
    };
    for (const name of speciality ? [] : traitData.skills ?? []) {
      const skill = pool.find(item => item.name === name);
      if (!skill) throw new Error(`Unknown skill: ${name}`);
      add(skill);
    }
    for (const effect of effects) {
      for (const skill of effect.fixedSkills ?? []) {
        if (pool.some(item => item.name === skill.name && item.category === skill.category)) add({ name: skill.name, category: skill.category }, 0, skill.value);
      }
      for (const request of effect.skillRolls ?? []) {
        if (Boolean(request.speciality) !== speciality) continue;
        choose(pool.filter(item => !request.category || item.category === request.category), request.count, request.bonus ?? 0, request.value);
      }
    }
    if (!speciality) {
      for (const entry of selection.fixedWeaponSkills ?? []) {
        const weapons = rules.weapons.groups.flatMap(({ names, ...properties }) => names.map(name => ({ name, ...properties })));
        const weapon = weapons.find(value => value.name === entry.weapon);
        if (!weapon) throw new Error(`Unknown weapon: ${entry.weapon}`);
        add({ category: 'Combat', name: `Weapon (${weapon.name})`, weapon }, entry.bonus ?? 0);
      }
    }
    for (const request of selection.profession?.skills ?? []) {
      const names = request.choices ?? (request.name ? [request.name] : []);
      if (names.some(name => !allSkills.some(skill => skill.name === name))) throw new Error('Unknown profession skill.');
      const candidates = request.category
        ? allSkills.filter(skill => skill.category === request.category)
        : allSkills.filter(skill => names.includes(skill.name));
      if (!candidates.length) throw new Error('Unknown profession skill or category.');
      const available = candidates.filter(skill => pool.some(item => item.name === skill.name && item.category === skill.category));
      if (!available.length) continue;
      if (available.length !== candidates.length) throw new Error('Profession choices cannot mix skill types.');
      choose(available, request.count ?? 1, request.value === undefined ? selection.profession.level : 0, request.value);
    }
    const requests = speciality
      ? [{ count: selection.rolls?.specialitySkills ?? 0 }]
      : [{ count: selection.rolls?.skills ?? 0 }, { count: selection.rolls?.combatSkills ?? 0, category: 'Combat', bonus: selection.rolls?.combatSkillBonus ?? 0 }];
    for (const request of requests) {
      choose(pool.filter(item => !request.category || item.category === request.category), request.count, request.bonus ?? 0);
    }
    if (!speciality) choose(pool, selection.rolls?.bonusSkills ?? 0, selection.skillBonus ?? 0);
    for (const skill of results) {
      for (const effect of effects) skill.value += effect.categoryBonuses?.[skill.category] ?? 0;
      if (skill.weapon) attackSkills.weapons.push({ ...skill.weapon, skillPercent: skill.value });
      if (skill.category === 'Combat' && skill.name === 'Brawl') attackSkills.brawl = skill.value;
    }
    return results.map(skill => `${skill.category ? `${skill.category}: ` : ''}${skill.name} ${skill.value}%${skill.rolls > 1 ? ` (rolled ${skill.rolls === 2 ? 'twice' : `${skill.rolls} times`})` : ''}`);
  }
  function generateSkills(selection, stats, random = Math.random, traitData = {}, attackSkills = { weapons: [] }) {
    return generateSkillResults(selection, traitData, false, random, attackSkills);
  }
  function generateSpecialitySkills(selection, stats, random = Math.random, traitData = {}) {
    return generateSkillResults(selection, traitData, true, random, { weapons: [] });
  }
  function generateProfession(age, random = Math.random) {
    const professions = rules.professions.flatMap(entry => entry.names.map(name => ({ name, skills: entry.skills })));
    const profession = professions[roll([0, professions.length - 1], random)];
    if (!profession) throw new Error('No professions are configured.');
    return { ...profession, level: roll([age - 10, age + 10], random) };
  }
  function generateMagicSkills(selection, random = Math.random) {
    const groups = selection.magicRolls ?? [selection.rolls ?? {}];
    const skills = [];
    const total = groups.reduce((sum, group) => sum + (group.magicSkills ?? 0) + (group.lightMagicSkills ?? 0), 0);
    if (total) {
      if (!magicRules) throw new Error('Load magic skill rules before generating magic skills.');
      const available = Object.entries(magicRules).flatMap(([school, entries]) => entries.map(entry => ({ school, ...entry })));
      for (const group of groups) {
        for (const [count, school] of [[group.lightMagicSkills ?? 0, 'Light'], [group.magicSkills ?? 0, undefined]]) {
          const eligible = available.filter(skill => !school || skill.school === school);
          if (eligible.length < count) throw new Error('Not enough distinct magic skills to roll.');
          for (const skill of sample(eligible, count, random)) {
            available.splice(available.indexOf(skill), 1);
            const value = 30 + (group.magicSkillBonus ?? 0) + (group.magicBonusPerLevel ?? 0) * (selection.level ?? 0);
            skills.push(`${skill.name} (${skill.school}) ${value}%: ${skill.description}`);
          }
        }
      }
    }
    if (selection.rolls?.martialMagicSkills) skills.push(`Martial magic skills: ${selection.rolls.martialMagicSkills} pending (skill list not supplied)`);
    if (selection.rolls?.martialSkills) {
      const value = 30 + selection.rolls.martialBonus + Math.floor(selection.level / 10) * selection.rolls.martialBonusPerTenLevels;
      skills.push(`Martial skills: ${selection.rolls.martialSkills} pending at ${value}% (skill list not supplied)`);
    }
    return skills;
  }
  function subtypeStages(type, subtype) {
    const stages = [];
    let current = subtype;
    while (current) {
      if (stages.includes(current)) throw new Error('Cyclic subtype inheritance.');
      stages.unshift(current);
      if (!current.inherits) break;
      const parent = type.subtypes.find(value => value.subtype === current.inherits);
      if (!parent) throw new Error(`Unknown inherited subtype: ${current.inherits}`);
      current = parent;
    }
    return stages;
  }
  function applyLevelBonus(stats, bonus, level, eligible, random) {
    if (!bonus) return;
    for (let currentLevel = 0; currentLevel < level; currentLevel++) {
      for (const key of sample(eligible, bonus.randomCount, random)) stats[key] += bonus.randomAmount;
      for (const [key, amount] of Object.entries(bonus.fixed ?? {})) stats[key] += amount;
    }
  }
  function generateRelationships(random = Math.random) {
    return rules.relationships.map(table => {
      const level = roll([-50, 50], random);
      const outcome = table.outcomes.find(item => level >= item.range[0] && level <= item.range[1]);
      if (!outcome) throw new Error(`No ${table.category} relationship outcome for ${level}.`);
      return `${table.category}: ${outcome.text} (${level})`;
    });
  }

  function generate(options = {}, random = Math.random) {
    if (!rules || !typeRules) throw new Error('Load the generator JSON rules before generating.');
    const selected = options.type === undefined ? api.selectType(random) : { type: options.type, subtype: options.subtype };
    const selection = typeof selected === 'string'
      ? { type: selected, subtype: '' }
      : { type: selected?.type ?? '', subtype: selected?.subtype ?? '' };
    const type = typeRules.types.find(value => value.type.toLowerCase() === selection.type.toLowerCase());
    const human = type?.type.toUpperCase() === 'HUMAN' && type.baseStats !== undefined;
    const undead = type?.type.toUpperCase() === 'UNDEAD' && type.baseStats !== undefined;
    const fixedBase = human || undead;
    const subtype = selection.subtype
      ? type?.subtypes?.find(value => value.subtype === selection.subtype)
      : fixedBase
        ? type.subtypes.find(value => value.subtype === type.defaultSubtype)
        : weighted(type?.subtypes ?? [], random);
    if (fixedBase && !subtype) throw new Error(`Unknown ${type.type} subtype: ${selection.subtype}`);
    const stages = undead ? subtypeStages(type, subtype) : subtype ? [subtype] : [];
    selection.subtype = subtype?.subtype ?? selection.subtype;
    selection.age = options.age ?? roll(subtype?.ageRange ?? rules.age.range, random);
    if (fixedBase && (!Number.isInteger(selection.age) || selection.age < subtype.ageRange[0] || selection.age > subtype.ageRange[1])) {
      throw new RangeError(`Age for ${type.type} ${subtype.subtype} must be between ${subtype.ageRange[0]} and ${subtype.ageRange[1]}.`);
    }
    selection.traitCategories = options.traitCategories ?? [...(type?.baseTraits ?? []), ...stages.flatMap(stage => stage.traits ?? [])];
    selection.rolls = undead ? {} : { ...(subtype?.rolls ?? {}) };
    const generatedStats = fixedBase
      ? Object.fromEntries(statKeys.map(key => [key, type.baseStats]))
      : api.generateStats(selection, random) ?? {};
    const stats = Object.fromEntries(statKeys.map(key => [key, generatedStats[key] ?? '']));
    applyModifiers(stats, subtype?.modifiers, random);
    const traitResult = api.generateTraits(selection, stats, random) ?? [];
    const traitData = typeof traitResult === 'string' || Array.isArray(traitResult) ? { traits: traitResult } : traitResult;
    if (undead) traitData.rolls ??= [];
    let childLevel;
    if (human && subtype.subtype !== 'Child') {
      const child = type.subtypes.find(value => value.subtype === 'Child');
      if (!child) throw new Error('Human Child subtype is required.');
      childLevel = roll(child.levelRange, random);
      applyLevelBonus(stats, child.levelBonus, childLevel, statKeys, random);
    }
    for (const stage of stages) {
      for (let index = 0; index < (stage.randomPoints ?? 0); index++) stats[statKeys[roll([0, statKeys.length - 1], random)]]++;
    }
    const level = subtype?.levelRange ? (fixedBase ? roll(subtype.levelRange, random) : rollLevel(subtype.levelRange, random)) : undefined;
    if (level !== undefined) {
      const eligible = !fixedBase && subtype.magic === false ? statKeys.filter(key => key !== 'MAG') : statKeys;
      for (const stage of stages) {
        applyLevelBonus(stats, stage.levelBonus, level, eligible, random);
      }
    }
    if (undead) {
      const fixedSkills = [];
      selection.fixedWeaponSkills = [];
      selection.magicRolls = [];
      for (const stage of stages) {
        for (const name of stage.removeSkills ?? []) {
          const index = fixedSkills.findIndex(skill => skill.name === name);
          if (index < 0) throw new Error(`Cannot remove unknown skill: ${name}`);
          fixedSkills.splice(index, 1);
        }
        fixedSkills.push(...(stage.fixedSkills ?? []));
        selection.fixedWeaponSkills.push(...(stage.fixedWeaponSkills ?? []));
        for (const name of stage.monsterSkills ?? []) {
          const skill = monsterSkills?.find(value => value.name === name);
          if (!skill) throw new Error(`Unknown monster skill: ${name}`);
          fixedSkills.push(skill);
        }
        const stageRolls = stage.rolls ?? {};
        selection.magicRolls.push(stageRolls);
        for (const key of ['skills', 'combatSkills', 'bonusSkills', 'martialSkills']) {
          selection.rolls[key] = (selection.rolls[key] ?? 0) + (stageRolls[key] ?? 0);
        }
        for (const key of ['combatSkillBonus', 'skillBonus', 'martialBonus', 'martialBonusPerTenLevels']) {
          if (stageRolls[key] !== undefined) selection.rolls[key] = stageRolls[key];
        }
        if (stageRolls.skillBonusLevels) selection.rolls.skillBonusLevels = stageRolls.skillBonusLevels;
        if (stage.resistanceBonus) {
          const bonus = stage.resistanceBonus;
          const amount = level > bonus.aboveLevel ? bonus.higherAmount : bonus.amount;
          traitData.rolls.push({ effect: { resistances: Object.fromEntries(bonus.names.map(name => [name, amount])) } });
        }
      }
      selection.undeadSkills = fixedSkills.map(skill => `${skill.name}: ${skill.description}`);
      for (const skill of fixedSkills) {
        if (skill.resistances || skill.vulnerabilities) traitData.rolls.push({ effect: skill });
      }
    }
    if (subtype?.ageBonus && level > subtype.ageBonus.levelAbove) {
      selection.age += roll(subtype.ageBonus.amount, random);
    }
    if (human && random() < type.titleChance) selection.rolls.titles = 1;
    if (subtype?.profession) selection.profession = generateProfession(selection.age, random);
    selection.skillBonus = selection.rolls.skillBonus ?? 0;
    for (const threshold of selection.rolls.skillBonusLevels ?? []) {
      if (level > threshold.above) selection.skillBonus = threshold.bonus;
    }
    selection.level = level;
    const titles = api.generateTitles(selection, stats, random) ?? [];
    if (selection.profession) titles.push(`${selection.profession.name} (Profession, level ${selection.profession.level})`);
    for (const result of traitData.rolls ?? []) {
      if (result.effect?.title) {
        const title = rules.titles.entries.find(entry => entry.name === result.effect.title);
        if (!title) throw new Error(`Unknown title: ${result.effect.title}`);
        const text = `${title.name}: ${title.description}`;
        if (!titles.includes(text)) titles.push(text);
      }
    }
    let includeMagic = subtype?.magic ?? options.includeMagic ?? false;
    for (const title of rules.titles.entries) {
      if (!titles.includes(`${title.name}: ${title.description}`)) continue;
      if (title.allStats) for (const key of statKeys) stats[key] += title.allStats;
      if (title.enableMagic) {
        if (!includeMagic) stats.MAG = 15;
        includeMagic = true;
      }
    }
    for (const stage of stages) {
      for (const [key, value] of Object.entries(stage.minimumStats ?? {})) stats[key] = Math.max(stats[key], value);
    }
    const attackSkills = { weapons: [] };
    const generatedSkills = api.generateSkills(selection, stats, random, traitData, attackSkills) ?? [];
    return {
      ...selection,
      level,
      ...(childLevel !== undefined ? { childLevel } : {}),
      magicRequired: subtype?.magic,
      includeMagic,
      stats,
      traits: traitData.traits ?? [],
      traitRolls: traitData.rolls ?? [],
      resistancesAndVulnerabilities: applyTraitResistances(api.generateResistancesAndVulnerabilities(selection, stats) ?? [], traitData.rolls ?? []),
      titles,
      skills: [...(typeof generatedSkills === 'string' ? [generatedSkills] : generatedSkills), ...(selection.undeadSkills ?? [])],
      specialitySkills: api.generateSpecialitySkills(selection, stats, random, traitData) ?? [],
      magicSkills: generateMagicSkills(selection, random),
      attack: generateWeapon(random),
      skillWeapons: attackSkills.weapons,
      brawlSkill: attackSkills.brawl,
      relationships: generateRelationships(random)
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
    const resistances = visibleResistances(npc.resistancesAndVulnerabilities);
    return [
      formatType(npc),
      ...visibleStatKeys(npc).map(key => `${statLabels[key]}: ${npc.stats[key]}`),
      '',
      ...(formatSection(npc.traits) ? [`Traits: ${formatSection(npc.traits)}`] : []),
      ...(resistances.length ? [`Resistances & Vulnerabilities:\n${resistances.join('\n')}`] : []),
      `Attack: ${formatAttacks(npc)}`,
      `Relationships & Organizations:\n${npc.relationships.join('\n')}`,
      `Titles: ${formatSection(npc.titles)}`,
      `Skills: ${formatSection(npc.skills)}`,
      `Speciality Skills: ${formatSection(npc.specialitySkills)}`,
      ...(npc.magicSkills.length ? [`Magic Skills: ${npc.magicSkills.join('\n')}`] : [])
    ].join('\n');
  }

  function visibleStatKeys(npc) {
    return statKeys.filter(key => key !== 'MAG' || npc.includeMagic);
  }

  const api = {
    statKeys, statLabels, configure, roll, rollLevel, sample, weighted, applyModifiers, rollTrait, visibleStatKeys,
    selectType, listTypes, generateStats, generateTraits,
    generateResistancesAndVulnerabilities, visibleResistances, generateWeapon, formatAttack, formatAttacks, generateTitles, generateRelationships,
    generateSkills, generateSpecialitySkills, generateProfession, generateMagicSkills, generate, formatType, formatSection, format
  };
  if (typeof module !== 'undefined' && module.exports) {
    configure(require('./data/rolls.json'), require('./data/types.json'), require('./data/monsters.json'));
    module.exports = api;
  }
  else root.NPCGenerator = api;
})(globalThis);