(function (root) {
  const statKeys = ['STR', 'CON', 'CHA', 'INT', 'AGI', 'MAG'];
  const elementalMagicSchools = new Set(['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity']);
  const statLabels = { STR: 'Strength', CON: 'Constitution', CHA: 'Charm', INT: 'Intelligence', AGI: 'Agility', MAG: 'Magic' };
  let rules;
  let typeRules;
  let progressionRules = new Map();
  let magicRules;
  let monsterSkills;
  let reservedTraitNames = new Set();
  let animalRules = [];
  let substatDivisor = 5;

  function parseProgressionBase(base, progression) {
    if (!base) return;
    for (const clause of base.split(';').map(value => value.trim()).filter(Boolean)) {
      let match = clause.match(/^(\d+)\s+all$/i);
      if (match) {
        progression.baseStats = Number(match[1]);
        continue;
      }
      match = clause.match(/^\+(\d+)$/);
      if (match) {
        progression.randomPoints = Number(match[1]);
        continue;
      }
      const modifiers = [...clause.matchAll(/\+(\d+)\s+(STR|CON|CHA|INT|AGI|MAG)\b/gi)];
      if (modifiers.length) {
        progression.baseModifiers ??= [];
        const remainder = clause.replace(/\+(\d+)\s+(STR|CON|CHA|INT|AGI|MAG)\b/gi, '').trim();
        if (remainder) throw new Error(`Unknown progression base rule: ${clause}`);
        for (const modifier of modifiers) {
          progression.baseModifiers.push({ keys: [modifier[2].toUpperCase()], amount: [Number(modifier[1]), Number(modifier[1])] });
        }
        continue;
      }
      match = clause.match(/^minimum\s+(STR|CON|CHA|INT|AGI|MAG)\s+(\d+)$/i);
      if (match) {
        progression.minimumStats ??= {};
        progression.minimumStats[match[1].toUpperCase()] = Number(match[2]);
        continue;
      }
      match = clause.match(/^all stats\s+(\d+)\s+minimum$/i);
      if (match) {
        progression.minimumStats = Object.fromEntries(statKeys.map(key => [key, Number(match[1])]));
        continue;
      }
      match = clause.match(/^lose\s+(STR|CON|CHA|INT|AGI|MAG)\s+until\s+(\d+)$/i);
      if (match) {
        progression.baseOverrides ??= {};
        progression.baseOverrides[match[1].toUpperCase()] = Number(match[2]);
        continue;
      }
      throw new Error(`Unknown progression base rule: ${clause}`);
    }
  }

  function parseProgressionBonus(value, progression) {
    if (!value || value.toLowerCase() === 'none') return;
    const levelBonus = { randomCount: 0, randomAmount: 0, fixed: {} };
    for (const clause of value.split(';').map(part => part.trim()).filter(Boolean)) {
      let match = clause.match(/^(\d+)\s+stats?\s+by\s+(\d+)$/i);
      if (match) {
        const amount = Number(match[2]);
        if (levelBonus.randomCount && levelBonus.randomAmount !== amount) {
          throw new Error(`Conflicting random stat bonuses: ${value}`);
        }
        levelBonus.randomCount += Number(match[1]);
        levelBonus.randomAmount = amount;
        continue;
      }
      match = clause.match(/^all stats\s+by\s+(\d+)$/i);
      if (match) {
        for (const key of statKeys) levelBonus.fixed[key] = (levelBonus.fixed[key] ?? 0) + Number(match[1]);
        continue;
      }
      match = clause.match(/^((?:STR|CON|CHA|INT|AGI|MAG)(?:\s*(?:,|and)\s*(?:STR|CON|CHA|INT|AGI|MAG))*)\s+by\s+(\d+)$/i);
      if (match) {
        const amount = Number(match[2]);
        for (const key of match[1].split(/\s*(?:,|and)\s*/i)) {
          const stat = key.toUpperCase();
          levelBonus.fixed[stat] = (levelBonus.fixed[stat] ?? 0) + amount;
        }
        continue;
      }
      throw new Error(`Unknown progression level-up rule: ${clause}`);
    }
    progression.levelBonus = levelBonus;
  }

  function parseProgressionEntry(entry) {
    const progression = {};
    if (entry.levelRange) progression.levelRange = entry.levelRange;
    parseProgressionBase(entry.base, progression);
    parseProgressionBonus(entry.pointsOnLevelUp, progression);
    for (const key of ['titleGain', 'traitGain', 'skillGain']) {
      if (entry[key] !== undefined) progression[key] = entry[key];
    }
    return progression;
  }

  function parseChartTraitGain(value) {
    const result = { categories: [], traits: [], removals: [], profession: false, rollAnimal: false };
    if (!value || value.toLowerCase() === 'none') return result;
    for (const part of value.split(',').map(item => item.trim()).filter(Boolean)) {
      let match = part.match(/^remove\s+(.+)$/i);
      if (match) {
        result.removals.push(match[1].trim());
        continue;
      }
      match = part.match(/^add\s+(.+)$/i);
      const trait = match ? match[1].trim() : part;
      if (/^profession$/i.test(trait)) {
        result.profession = true;
      } else if (/^roll animal$/i.test(trait)) {
        result.rollAnimal = true;
      } else if (/^(\d+)\s+temperaments?$/i.test(trait)) {
        const [, count] = trait.match(/^(\d+)\s+temperaments?$/i);
        result.categories.push(...Array(Number(count)).fill('temperament'));
      } else if (/^(beauty|height|education|temperament)$/i.test(trait)) {
        result.categories.push(trait.toLowerCase());
      } else if (!/^none$/i.test(trait)) {
        result.traits.push(trait);
      }
    }
    return result;
  }

  function parseChartTitleGain(value) {
    const result = { specialChances: [], fixedTitles: [], customTitles: [], profession: false, halfProfessionSkills: false, magicType: false };
    if (!value || value.toLowerCase() === 'none') return result;
    for (const part of value.split(',').map(item => item.trim()).filter(Boolean)) {
      const chance = part.match(/^(\d+)%\s+special$/i);
      if (chance) {
        result.specialChances.push(Number(chance[1]) / 100);
      } else if (/^profession(?:\s+\(.+\))?$/i.test(part)) {
        result.profession = true;
        result.halfProfessionSkills = /\(half skills\)/i.test(part);
      } else if (/^magical type$/i.test(part)) {
        result.magicType = true;
      } else if (/^elemental$/i.test(part)) {
        continue;
      } else {
        const titleName = /^ascendant$/i.test(part) ? 'Ascendent' : part;
        const title = rules.titles?.entries.find(entry => entry.name.toLowerCase() === titleName.toLowerCase());
        if (title) result.fixedTitles.push(title.name);
        else result.customTitles.push(part);
      }
    }
    return result;
  }

  function parseChartSkillGain(value, stage, currentSkills, random) {
    const result = { skillRolls: [], specialitySkillRolls: [], magicRolls: [], fixedMagicSkills: [], pendingSkills: [], rolls: {} };
    if (!value || value.toLowerCase() === 'none') return result;
    let remaining = value;
    let removingSkills = false;
    remaining = remaining.split(',').map(part => part.trim()).filter(part => {
      const removal = part.match(/^remove\s+(.+)$/i);
      if (removal) {
        removingSkills = true;
        const name = removal[1].trim();
        const index = currentSkills.findIndex(skill => skill.name.toLowerCase() === name.toLowerCase());
        if (index >= 0) currentSkills.splice(index, 1);
        return false;
      }
      if (removingSkills) {
        const skill = monsterSkills?.find(item => item.name.toLowerCase() === part.toLowerCase());
        if (skill) {
          const index = currentSkills.findIndex(item => item.name === skill.name);
          if (index >= 0) currentSkills.splice(index, 1);
          return false;
        }
        removingSkills = false;
      }
      return true;
    }).join(', ');
    const variants = remaining.match(/Lunar:\s*([^;]+);\s*Solar:\s*(.+)$/i);
    if (variants) {
      const options = [
        { names: variants[1].split(',').map(name => name.trim()) },
        { names: variants[2].split(',').map(name => name.trim()) }
      ];
      const selected = options[roll([0, options.length - 1], random)];
      for (const name of selected.names) {
        const skill = monsterSkills?.find(item => item.name.toLowerCase() === name.toLowerCase());
        if (!skill) throw new Error(`Unknown chart skill: ${name}`);
        if (!currentSkills.some(item => item.name === skill.name)) currentSkills.push(skill);
      }
      remaining = remaining.replace(variants[0], '');
    }

    const schoolNames = Object.keys(magicRules ?? {});
    const magicPattern = /(\d+)\s+(?:(Light|Darkness|Fire|Water|Earth|Wind|Electricity|Blood|Martial|Omniscient|Ascendant)\s+)?(?:magic|magical)\s+(?:skills?|spells?)(?:\s+of\s+(each\s+|type))?(?:\s*\+(\d+)\s*%)?/gi;
    remaining = remaining.replace(magicPattern, (match, count, namedSchool, typeQualifier, bonus) => {
      const schools = typeQualifier?.toLowerCase().startsWith('each')
        ? [...elementalMagicSchools]
        : [namedSchool && schoolNames.find(name => name.toLowerCase() === namedSchool.toLowerCase())];
      if (typeQualifier && !typeQualifier.toLowerCase().startsWith('each') && !namedSchool) {
        result.magicType = true;
      }
      for (const school of schools) {
        result.magicRolls.push({
          magicSkills: Number(count),
          ...(school ? { magicSchool: school } : {}),
          ...(typeQualifier && !typeQualifier.toLowerCase().startsWith('each') ? { typeRestricted: true } : {}),
          ...(bonus ? { magicSkillBonus: Number(bonus) } : {}),
          ...(stage.rolls?.magicBonusPerLevel ? { magicBonusPerLevel: stage.rolls.magicBonusPerLevel } : {})
        });
      }
      return ' ';
    });
    remaining = remaining.replace(/(\d+)\s+(Light|Darkness|Fire|Water|Earth|Wind|Electricity|Blood|Martial|Omniscient|Ascendant)\s+spells?(?:\s*\+(\d+)\s*%)?/gi,
      (match, count, namedSchool, bonus) => {
        const school = schoolNames.find(name => name.toLowerCase() === namedSchool.toLowerCase());
        if (!school) throw new Error(`Unknown magic school in chart skill gain: ${namedSchool}.`);
        result.magicRolls.push({
          magicSkills: Number(count),
          magicSchool: school,
          ...(bonus ? { magicSkillBonus: Number(bonus) } : {}),
          ...(stage.rolls?.magicBonusPerLevel ? { magicBonusPerLevel: stage.rolls.magicBonusPerLevel } : {})
        });
        return ' ';
      });

    remaining = remaining.replace(/(?:(\d+)\s+)?martial\s+magic\s+skills?/gi, (_, count) => {
      result.rolls.martialMagicSkills = (result.rolls.martialMagicSkills ?? 0) + Number(count ?? 1);
      return ' ';
    });
    remaining = remaining.replace(/(\d+)\s+martial\s+skills?(?:\s*\+(\d+)\s*%)?/gi, (_, count, bonus) => {
      result.rolls.martialSkills = (result.rolls.martialSkills ?? 0) + Number(count);
      if (bonus) result.rolls.martialBonus = Number(bonus);
      return ' ';
    });
    remaining = remaining.replace(/\bmartial\s+magic\b/gi, () => {
      result.rolls.martialMagicSkills = (result.rolls.martialMagicSkills ?? 0) + 1;
      return ' ';
    });

    const categoryNames = [...new Set([
      ...Object.keys(rules.skills.categories),
      ...Object.keys(rules.specialitySkills ?? {})
    ])];
    const numberValue = value => /^\d+$/.test(value) ? Number(value) : ({
      one: 1, two: 2, three: 3, four: 4, five: 5
    })[value.toLowerCase()];
    remaining = remaining.replace(/(\d+|one|two|three|four|five)\s+(?:(combat|emotional intelligence|artistic|art|subterfuge|knowledge|perception)\s+)?skills?(?:\s*\+(\d+)\s*%)?/gi,
      (match, count, namedCategory, bonus) => {
        const category = namedCategory && (
          /^artistic$/i.test(namedCategory) ? 'Art'
            : categoryNames.find(name => name.toLowerCase() === namedCategory.toLowerCase())
        );
        if (namedCategory && !category) {
          result.pendingSkills.push(match.trim());
        } else {
          const request = {
            count: numberValue(count),
            ...(category ? { category } : {}),
            bonus: Number(bonus ?? 0),
            scaleSkillBonus: Boolean(stage.rolls?.skillBonusLevels)
          };
          if (category && rules.specialitySkills?.[category] && !rules.skills.categories[category]) {
            result.specialitySkillRolls.push(request);
          } else {
            result.skillRolls.push(request);
          }
        }
        return ' ';
      });
    remaining = remaining.replace(/\bcombat\b(?!\s+skills?)/gi, () => {
      result.skillRolls.push({ count: 1, category: 'Combat', bonus: 0 });
      return ' ';
    });
    remaining = remaining.replace(/\bmartial magic\b/gi, () => {
      result.pendingSkills.push('Martial magic skills: 1 pending (skill list not supplied)');
      return ' ';
    });

    remaining = remaining.replace(/\bAphrodisiac\b/gi, 'Aphordisiac');
    const fixedMagicNames = Object.entries(magicRules ?? {}).flatMap(([school, skills]) =>
      skills.map(skill => ({ ...skill, school }))).sort((a, b) => b.name.length - a.name.length);
    for (const skill of fixedMagicNames) {
      const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[^\\w])${escaped}(?=$|[^\\w])(?:\\s*\\+(\\d+)\\s*%)?`, 'i');
      if (skill.name === 'Heal' && /Heal\s*\(Monster\)/i.test(remaining)) continue;
      if (!pattern.test(remaining)) continue;
      const found = remaining.match(pattern);
      if (!result.fixedMagicSkills.some(item => item.name === skill.name && item.school === skill.school)) {
        result.fixedMagicSkills.push({ name: skill.name, school: skill.school, bonus: Number(found[2] ?? 0), bonusIfOwned: /\+\s*\d+%\s*if already owned/i.test(value) ? 20 : 0 });
      }
      remaining = remaining.replace(pattern, ' ');
    }

    for (const skill of [...(monsterSkills ?? [])].sort((a, b) => b.name.length - a.name.length)) {
      const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[^\\w])${escaped}(?=$|[^\\w])(?:\\s*\\+(\\d+)\\s*%)?`, 'i');
      if (!pattern.test(remaining)) continue;
      const found = remaining.match(pattern);
      if (!currentSkills.some(item => item.name === skill.name)) currentSkills.push({ ...skill, ...(found[2] ? { value: 30 + Number(found[2]) } : {}) });
      remaining = remaining.replace(pattern, ' ');
    }

    remaining = remaining.replace(/\(\s*\+\d+%\s*if already owned\)/gi, ' ');
    for (const part of remaining.split(',').map(item => item.trim()).filter(Boolean)) {
      if (/^(?:none|remove|add|profession|one arrow skill|one ranged weapon)(?:\s*\+\d+%)?$/i.test(part)) continue;
      const cleaned = part.replace(/\s+/g, ' ').trim();
      if (cleaned && !result.pendingSkills.includes(cleaned)) result.pendingSkills.push(cleaned);
    }
    return result;
  }

  function configure(rolls, types, monsters) {
    for (const type of types.types ?? []) {
      const subtypeNames = new Set();
      for (const subtype of type.subtypes ?? []) {
        if (subtypeNames.has(subtype.subtype)) {
          throw new Error(`Duplicate subtype: ${type.type} ${subtype.subtype}.`);
        }
        subtypeNames.add(subtype.subtype);
        subtypeStages(type, subtype);
      }
    }
    rules = rolls;
    typeRules = types;
    progressionRules = new Map();
    for (const entry of types.progressionChart ?? []) {
      const key = `${entry.type.toLowerCase()}|${entry.subtype.toLowerCase()}`;
      if (progressionRules.has(key)) throw new Error(`Duplicate progression chart entry: ${entry.type} ${entry.subtype}`);
      progressionRules.set(key, parseProgressionEntry(entry));
    }
    if (monsters) {
      substatDivisor = monsters.substatDivisor ?? 5;
      magicRules = monsters.magic;
      reservedTraitNames = new Set((monsters.reservedTraits ?? []).map(trait => trait.name.toLowerCase()));
      monsterSkills = [...(monsters.reservedTraits ?? []), ...(monsters.reservedSkills ?? []), ...monsters.boss.flatMap(boss => boss.skills ?? [])];
      animalRules = monsters.animal ?? [];
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

  function magicManaCost(skill) {
    const match = (skill.description ?? '').match(/\bCosts?\s+(\d+)\s+Mana\b/i);
    return match ? Number(match[1]) : 0;
  }

  function sampleAffordableMagicSkills(skills, count, mana, random = Math.random) {
    const affordable = skills.filter(skill => magicManaCost(skill) <= mana);
    if (affordable.length < count) throw new Error(`Not enough distinct spells affordable with ${mana} Mana.`);
    return sample(affordable, count, random);
  }

  function rollTitleLevel(entry, age, random) {
    if (entry.levelFormula === 'age/5') return Math.floor(age / 5);
    const range = entry.levelRange ?? [1, 1];
    return range[0] === range[1] ? range[0] : roll(range, random);
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
  function applyTraitResistances(resistances, traitRolls, level = 0) {
    const result = [...resistances];
    for (const { effect } of traitRolls) {
      if (!effect) continue;
      const resistanceBonuses = { ...(effect.resistances ?? {}) };
      for (const [name, amount] of Object.entries(effect.resistancesPerLevel ?? {})) {
        resistanceBonuses[name] = (resistanceBonuses[name] ?? 0) + amount * level;
      }
      for (const [name, amount] of Object.entries(resistanceBonuses)) {
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
    const magicTypes = selection.allowedMagicTypes ?? rules.titles?.magicTypes ?? [];
    const selectedMagicTypes = sample(magicTypes, count, random);
    if (selection.chartMagicTypeTitle && selectedMagicTypes.length) {
      const school = Object.keys(magicRules ?? {}).find(value => value.toLowerCase() === selectedMagicTypes[0].toLowerCase());
      if (!school) throw new Error(`Unknown magic school for generated magic type: ${selectedMagicTypes[0]}.`);
      selection.magicSchoolRestriction = school;
    }
    const titles = selectedMagicTypes.map(value => value.charAt(0).toUpperCase() + value.slice(1));
    selection.titleData = [];
    const available = [...rules.titles.entries];
    const addTitle = (entry, name = entry.name, school) => {
      const level = rollTitleLevel(entry, selection.age ?? 0, random);
      const title = { entry, name, level, ...(school ? { school } : {}) };
      selection.titleData.push(title);
      if (entry.magicSkills || entry.lightMagicSkills) {
        selection.titleMagicRolls ??= [];
        selection.titleMagicRolls.push({
          magicSkills: entry.magicSkills ?? 0,
          lightMagicSkills: entry.lightMagicSkills ?? 0,
          magicSchool: school,
          titleLevel: level
        });
      }
      if (school && entry.magicBonusPerLevel) {
        selection.magicSchoolBonuses ??= {};
        selection.magicSchoolBonuses[school] = (selection.magicSchoolBonuses[school] ?? 0) + level * entry.magicBonusPerLevel;
      }
      return `${name} (Level ${level}): ${entry.description}`;
    };
    for (let index = 0; index < (selection.rolls?.titles ?? 0); index++) {
      if (random() < rules.titles.newTitleChance) {
        titles.push('Make a new title');
      } else {
        const [title] = sample(available, 1, random);
        if (!title) throw new Error('Not enough distinct titles to roll.');
        available.splice(available.indexOf(title), 1);
        if (title.magicTypeTemplate) {
          const schools = Object.keys(magicRules ?? {});
          if (!schools.length) throw new Error('Load magic skill rules before generating a type magician title.');
          const [school] = sample(schools, 1, random);
          titles.push(addTitle(title, `${school} Magician`, school));
        } else {
          titles.push(addTitle(title));
        }
      }
    }
    const raceTitle = rules.titles?.raceTitles?.find(entry => entry.race === selection.type?.toUpperCase());
    if (raceTitle) {
      const [element] = sample(raceTitle.elements, 1, random);
      if (!element) throw new Error(`No elements are configured for the ${raceTitle.name} race title.`);
      const school = Object.keys(magicRules ?? {}).find(value => value.toLowerCase() === element.toLowerCase());
      if (!school) throw new Error(`Unknown magic school for the ${raceTitle.name} race title: ${element}.`);
      selection.magicSchoolRestriction = school;
      titles.push(addTitle(raceTitle, `${element} Elemental`, school));
    }
    return titles;
  }
  function skillPool(speciality) {
    const categories = speciality ? rules.specialitySkills : rules.skills.categories;
    const categorized = Object.entries(categories).flatMap(([category, names]) => names.map(name => ({ category, name })));
    return speciality ? categorized : [...rules.skills.standalone.map(name => ({ name })), ...categorized];
  }
  function generateSkillResults(selection, traitData, speciality, random, attackSkills) {
    const combatSkillsEnabled = selection.combatSkillsEnabled !== false;
    const pool = skillPool(speciality).filter(skill => combatSkillsEnabled || skill.category !== 'Combat');
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
      const skill = allSkills.find(item => item.name === name);
      if (!skill) throw new Error(`Unknown skill: ${name}`);
      if (combatSkillsEnabled || skill.category !== 'Combat') add(skill);
    }
    for (const effect of effects) {
      for (const skill of effect.fixedSkills ?? []) {
        if (pool.some(item => item.name === skill.name && item.category === skill.category)) add({ name: skill.name, category: skill.category }, 0, skill.value);
      }
      for (const request of effect.skillRolls ?? []) {
        if (Boolean(request.speciality) !== speciality) continue;
        if (!combatSkillsEnabled && request.category === 'Combat') continue;
        choose(pool.filter(item => !request.category || item.category === request.category), request.count, request.bonus ?? 0, request.value);
      }
    }
    if (!speciality && combatSkillsEnabled) {
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
      const value = selection.halfProfessionSkills
        ? Math.floor(((request.value ?? (speciality ? 0 : 30)) + selection.profession.level) / 2)
        : request.value;
      choose(available, request.count ?? 1, selection.halfProfessionSkills ? 0 : selection.profession.level, value);
    }
    const requests = speciality
      ? [{ count: selection.rolls?.specialitySkills ?? 0 }]
      : [{ count: selection.rolls?.skills ?? 0 }, { count: selection.rolls?.combatSkills ?? 0, category: 'Combat', bonus: selection.rolls?.combatSkillBonus ?? 0 }];
    const chartRequests = speciality ? selection.chartSpecialitySkillRolls : selection.chartSkillRolls;
    for (const request of [...requests, ...(chartRequests ?? [])]) {
      if (!combatSkillsEnabled && request.category === 'Combat') continue;
      const bonus = request.scaleSkillBonus ? selection.skillBonus ?? request.bonus ?? 0 : request.bonus ?? 0;
      choose(pool.filter(item => !request.category || item.category === request.category), request.count, bonus, request.value);
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
    return { ...profession, level: Math.min(20, roll([age - 10, age + 10], random)) };
  }
  function generateMagicSkills(selection, random = Math.random) {
    const groups = [...(selection.magicRolls ?? [selection.rolls ?? {}]), ...(selection.titleMagicRolls ?? [])];
    const skills = [];
    const total = groups.reduce((sum, group) => sum + (group.magicSkills ?? 0) + (group.lightMagicSkills ?? 0), 0);
    if (total || selection.fixedMagicSkills?.length) {
      if (!magicRules) throw new Error('Load magic skill rules before generating magic skills.');
      const available = Object.entries(magicRules).flatMap(([school, entries]) => entries.map(entry => ({ school, ...entry })));
      for (const group of groups) {
        for (const [count, school] of [[group.lightMagicSkills ?? 0, 'Light'], [group.magicSkills ?? 0, group.magicSchool]]) {
          const requestedSchool = school && !elementalMagicSchools.has(school) ? school : selection.magicSchoolRestriction ?? school;
          const eligible = available.filter(skill => requestedSchool
            ? skill.school === requestedSchool
            : elementalMagicSchools.has(skill.school));
          for (const skill of sampleAffordableMagicSkills(eligible, count, selection.mana ?? Number.POSITIVE_INFINITY, random)) {
            available.splice(available.indexOf(skill), 1);
            const value = 30 + (group.magicSkillBonus ?? 0)
              + (group.magicBonusPerLevel ?? 0) * (group.titleLevel ?? selection.level ?? 0)
              + (selection.magicSchoolBonuses?.[skill.school] ?? 0);
            skills.push({ ...skill, value });
          }
        }
      }
      for (const request of selection.fixedMagicSkills ?? []) {
        const skill = magicRules[request.school]?.find(value => value.name === request.name);
        if (!skill) throw new Error(`Unknown chart magic skill: ${request.name} (${request.school}).`);
        const existing = skills.find(value => value.name === skill.name && value.school === request.school);
        if (existing) {
          existing.value += request.bonusIfOwned ?? 0;
        } else {
          const cost = magicManaCost(skill);
          if (cost > (selection.mana ?? Number.POSITIVE_INFINITY)) {
            skills.push(`${skill.name} (${request.school}): unavailable (costs ${cost} Mana; only ${selection.mana} Mana available)`);
            continue;
          }
          skills.push({ ...skill, school: request.school, value: 30 + (request.bonus ?? 0) });
        }
      }
    }
    if (selection.rolls?.martialMagicSkills) skills.push(`Martial magic skills: ${selection.rolls.martialMagicSkills} pending (skill list not supplied)`);
    if (selection.rolls?.martialSkills) {
      const value = 30 + selection.rolls.martialBonus + Math.floor(selection.level / 10) * selection.rolls.martialBonusPerTenLevels;
      skills.push(`Martial skills: ${selection.rolls.martialSkills} pending at ${value}% (skill list not supplied)`);
    }
    return skills.map(skill => typeof skill === 'string'
      ? skill
      : `${skill.name} (${skill.school}) ${skill.value}%: ${skill.description}`);
  }
  function subtypeStages(type, subtype) {
    const stages = [];
    const included = new Set();
    const visiting = new Set();
    const visit = current => {
      if (visiting.has(current.subtype)) throw new Error('Cyclic subtype inheritance.');
      if (included.has(current.subtype)) return;
      visiting.add(current.subtype);
      const parents = current.inherits === undefined
        ? []
        : Array.isArray(current.inherits) ? current.inherits : [current.inherits];
      for (const name of parents) {
        const parent = type.subtypes.find(value => value.subtype === name);
        if (!parent) throw new Error(`Unknown inherited subtype: ${name}`);
        visit(parent);
      }
      visiting.delete(current.subtype);
      included.add(current.subtype);
      stages.push(current);
    };
    if (subtype) visit(subtype);
    return stages;
  }

  function collectTraitGains(type, stages) {
    const categories = [...(type.baseTraits ?? [])];
    const traits = [];
    let profession = false;
    let rollAnimal = false;
    let replacedBaseCategories = false;
    for (const stage of stages) {
      for (const removed of stage.removeTraits ?? []) {
        const key = removed.toLowerCase();
        for (let index = categories.length - 1; index >= 0; index--) {
          if (categories[index].toLowerCase() === key) categories.splice(index, 1);
        }
        for (let index = traits.length - 1; index >= 0; index--) {
          if (traits[index].toLowerCase() === key) traits.splice(index, 1);
        }
      }
      const gain = stage.progressionTraitGain === undefined
        ? { categories: stage.traits ?? [], traits: [], removals: [], profession: false, rollAnimal: false }
        : parseChartTraitGain(stage.progressionTraitGain);
      if (stage.progressionTraitGain !== undefined && !replacedBaseCategories) {
        for (const category of new Set(gain.categories)) {
          for (let index = categories.length - 1; index >= 0; index--) {
            if (categories[index].toLowerCase() === category) categories.splice(index, 1);
          }
        }
        replacedBaseCategories = true;
      }
      for (const removed of gain.removals) {
        const key = removed.toLowerCase();
        for (let index = categories.length - 1; index >= 0; index--) {
          if (categories[index].toLowerCase() === key) categories.splice(index, 1);
        }
        for (let index = traits.length - 1; index >= 0; index--) {
          if (traits[index].toLowerCase() === key) traits.splice(index, 1);
        }
      }
      categories.push(...gain.categories);
      traits.push(...gain.traits);
      profession ||= Boolean(stage.profession || gain.profession);
      rollAnimal ||= gain.rollAnimal;
    }
    return { categories, traits, profession, rollAnimal };
  }

  function applyLevelBonus(stats, bonus, level, eligible, random) {
    if (!bonus) return;
    for (let currentLevel = 0; currentLevel < level; currentLevel++) {
      const randomStats = bonus.randomCount > eligible.length
        ? Array.from({ length: bonus.randomCount }, () => eligible[roll([0, eligible.length - 1], random)])
        : sample(eligible, bonus.randomCount, random);
      for (const key of randomStats) stats[key] += bonus.randomAmount;
      for (const [key, amount] of Object.entries(bonus.fixed ?? {})) stats[key] += amount;
    }
  }

  function applyProgression(type, stage) {
    const progression = progressionRules.get(`${type.type.toLowerCase()}|${stage.subtype.toLowerCase()}`);
    if (!progression) return stage;
    const result = { ...stage, ...progression };
    if (stage.minimumStats || progression.minimumStats) {
      result.minimumStats = { ...stage.minimumStats, ...progression.minimumStats };
    }
    if (progression.baseModifiers) result.progressionBaseModifiers = progression.baseModifiers;
    if (progression.baseOverrides) result.progressionBaseOverrides = progression.baseOverrides;
    for (const key of ['titleGain', 'traitGain', 'skillGain']) {
      if (progression[key] !== undefined) result[`progression${key[0].toUpperCase()}${key.slice(1)}`] = progression[key];
    }
    return result;
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
    const humanType = type?.type.toUpperCase() === 'HUMAN';
    const human = humanType && type.baseStats !== undefined;
    const undead = type?.type.toUpperCase() === 'UNDEAD' && type.baseStats !== undefined;
    const fixedBase = human || undead;
    const subtype = selection.subtype
      ? type?.subtypes?.find(value => value.subtype === selection.subtype)
      : fixedBase
        ? type.subtypes.find(value => value.subtype === type.defaultSubtype)
        : weighted(type?.subtypes ?? [], random);
    if (fixedBase && !subtype) throw new Error(`Unknown ${type.type} subtype: ${selection.subtype}`);
    const magicEnabled = Boolean(type) && !(humanType && ['Child', 'Adult'].includes(subtype?.subtype));
    const stages = subtype ? subtypeStages(type, subtype).map(stage => applyProgression(type, stage)) : [];
    selection.subtype = subtype?.subtype ?? selection.subtype;
    selection.showMagicTypeInHeading = Boolean(subtype?.showMagicTypeInHeading);
    selection.combatSkillsEnabled = type?.type.toUpperCase() !== 'DRAGON'
      || stages.some(stage => stage.subtype === 'Ascendant Dragon');
    const ageRange = subtype?.ageRange ?? type?.ageRange;
    selection.age = options.age ?? roll(ageRange ?? rules.age.range, random);
    selection.showAge = Boolean(ageRange);
    if (fixedBase && (!Number.isInteger(selection.age) || selection.age < subtype.ageRange[0] || selection.age > subtype.ageRange[1])) {
      throw new RangeError(`Age for ${type.type} ${subtype.subtype} must be between ${subtype.ageRange[0]} and ${subtype.ageRange[1]}.`);
    }
    const traitGains = collectTraitGains(type ?? {}, stages);
    selection.traitCategories = options.traitCategories
      ?? traitGains.categories;
    selection.chartTraits = traitGains.traits;
    selection.chartProfession = traitGains.profession;
    selection.rollAnimal = traitGains.rollAnimal;
    selection.rolls = {};
    const configuredBase = [...stages].reverse().find(stage => stage.baseStats !== undefined)?.baseStats ?? type?.baseStats;
    const generatedStats = configuredBase !== undefined
      ? Object.fromEntries(statKeys.map(key => [key, typeof configuredBase === 'number' ? configuredBase : configuredBase[key] ?? rules.stats.base[0]]))
      : api.generateStats(selection, random) ?? {};
    const stats = Object.fromEntries(statKeys.map(key => [key, generatedStats[key] ?? '']));
    applyModifiers(stats, subtype?.modifiers, random);
    for (const stage of stages) applyModifiers(stats, stage.progressionBaseModifiers, random);
    const traitResult = api.generateTraits(selection, stats, random) ?? [];
    const traitData = typeof traitResult === 'string' || Array.isArray(traitResult) ? { traits: traitResult } : traitResult;
    traitData.rolls ??= [];
    for (const name of selection.chartTraits ?? []) {
      for (const rule of Object.values(rules.traits)) {
        const outcome = rule.outcomes?.find(item => item.output?.toLowerCase() === name.toLowerCase());
        if (outcome) applyModifiers(stats, outcome.modifiers, random);
      }
    }
    let childLevel;
    if (human && subtype.subtype !== 'Child') {
      const child = type.subtypes.find(value => value.subtype === 'Child');
      if (!child) throw new Error('Human Child subtype is required.');
      childLevel = roll(child.levelRange, random);
      applyLevelBonus(stats, child.levelBonus, childLevel, statKeys, random);
    }
    for (const stage of stages) {
      for (let index = 0; index < (stage.randomPoints ?? 0); index++) stats[statKeys[roll([0, statKeys.length - 1], random)]]++;
      for (const [key, value] of Object.entries(stage.progressionBaseOverrides ?? {})) stats[key] = value;
    }
    const levelRange = [...stages].reverse().find(stage => stage.levelRange)?.levelRange;
    const level = levelRange ? (fixedBase ? roll(levelRange, random) : rollLevel(levelRange, random)) : undefined;
    if (level !== undefined) {
      const eligible = !fixedBase && !magicEnabled ? statKeys.filter(key => key !== 'MAG') : statKeys;
      for (const stage of stages) {
        applyLevelBonus(stats, stage.levelBonus, level, eligible, random);
      }
    }
    let animal;
    if (selection.rollAnimal) {
      if (!animalRules.length) throw new Error('Load monster animal rules before generating an animal-associated character.');
      animal = animalRules[roll([0, animalRules.length - 1], random)];
      for (const modifier of animal.modifiers ?? []) {
        if (!(modifier.key in stats)) continue;
        if (modifier.perLevel !== undefined) stats[modifier.key] += modifier.perLevel * (level ?? 0);
        if (modifier.minimum !== undefined) stats[modifier.key] = Math.max(stats[modifier.key], modifier.minimum);
      }
    }
    const fixedSkills = [];
    selection.fixedWeaponSkills = [];
    selection.fixedWeaponChoices = [];
    selection.fixedSkillChoices = [];
    selection.magicRolls = [];
    selection.chartSkillRolls = [];
    selection.chartSpecialitySkillRolls = [];
    selection.fixedMagicSkills = [];
    selection.pendingChartSkills = [];
    selection.chartTitles = [];
    for (const stage of stages) {
      if (stage.replaceMagicType) {
        selection.magicRolls = selection.magicRolls.filter(group => !group.typeRestricted);
        selection.rolls.magicTypeTitles = 1;
        selection.chartMagicTypeTitle = true;
        selection.allowedMagicTypes = stage.replaceMagicType;
      }
      for (const name of stage.removeSkills ?? []) {
        const index = fixedSkills.findIndex(skill => skill.name === name);
        if (index < 0) throw new Error(`Cannot remove unknown skill: ${name}`);
        fixedSkills.splice(index, 1);
      }
      fixedSkills.push(...(stage.fixedSkills ?? []));
      selection.fixedWeaponSkills.push(...(stage.fixedWeaponSkills ?? []));
      selection.fixedWeaponChoices.push(...(stage.fixedWeaponChoices ?? []));
      selection.fixedSkillChoices.push(...(stage.fixedSkillChoices ?? []));
      for (const name of stage.monsterSkills ?? []) {
        const skill = monsterSkills?.find(value => value.name === name);
        if (!skill) throw new Error(`Unknown monster skill: ${name}`);
        fixedSkills.push(skill);
      }
      if (stage.progressionSkillGain !== undefined) {
        const parsed = parseChartSkillGain(stage.progressionSkillGain, stage, fixedSkills, random);
        selection.chartSkillRolls.push(...parsed.skillRolls);
        selection.chartSpecialitySkillRolls.push(...parsed.specialitySkillRolls);
        selection.magicRolls.push(...parsed.magicRolls);
        selection.fixedMagicSkills.push(...parsed.fixedMagicSkills);
        selection.pendingChartSkills.push(...parsed.pendingSkills);
        for (const [key, count] of Object.entries(parsed.rolls)) {
          selection.rolls[key] = (selection.rolls[key] ?? 0) + count;
        }
        if (parsed.magicType) {
          selection.chartMagicTypeTitle = true;
          if (!selection.rolls.magicTypeTitles && !rules.titles?.raceTitles?.some(entry => entry.race === selection.type.toUpperCase())) {
            selection.rolls.magicTypeTitles = 1;
          }
        }
      }
      if (stage.replaceRolls?.combatSkills !== undefined) {
        selection.chartSkillRolls = selection.chartSkillRolls.filter(request => request.category !== 'Combat');
      }
      const sourceRolls = stage.rolls ?? {};
      const stageRolls = stage.progressionSkillGain === undefined
        ? sourceRolls
        : {
          ...sourceRolls,
          skills: 0,
          combatSkills: 0,
          bonusSkills: 0,
          martialSkills: 0,
          martialMagicSkills: 0,
          magicSkills: 0,
          lightMagicSkills: 0
        };
      selection.magicRolls.push(stageRolls);
      for (const key of ['skills', 'combatSkills', 'bonusSkills', 'martialSkills', 'martialMagicSkills']) {
        selection.rolls[key] = stage.replaceRolls?.[key] ?? ((selection.rolls[key] ?? 0) + (stageRolls[key] ?? 0));
      }
      for (const key of ['combatSkillBonus', 'skillBonus', 'martialBonus', 'martialBonusPerTenLevels']) {
        if (stageRolls[key] !== undefined) selection.rolls[key] = stageRolls[key];
      }
      if (stageRolls.skillBonusLevels) selection.rolls.skillBonusLevels = stageRolls.skillBonusLevels;
      const titleGain = parseChartTitleGain(stage.progressionTitleGain);
      if (titleGain.profession) selection.chartProfession = true;
      if (titleGain.halfProfessionSkills) selection.halfProfessionSkills = true;
      for (const chance of titleGain.specialChances) {
        if (humanType && type.titleChance !== undefined) continue;
        if (random() < chance) selection.rolls.titles = (selection.rolls.titles ?? 0) + 1;
      }
      if (titleGain.magicType) {
        selection.chartMagicTypeTitle = true;
        selection.rolls.magicTypeTitles = 1;
      }
      for (const name of titleGain.fixedTitles) traitData.rolls.push({ effect: { title: name } });
      selection.chartTitles.push(...titleGain.customTitles);
      if (stage.resistanceBonus) {
        const bonus = stage.resistanceBonus;
        const amount = level > bonus.aboveLevel ? bonus.higherAmount : bonus.amount;
        traitData.rolls.push({ effect: { resistances: Object.fromEntries(bonus.names.map(name => [name, amount])) } });
      }
    }
    if (animal) fixedSkills.push(...(animal.skills ?? []));
    for (const choice of selection.fixedSkillChoices) {
      if (!choice.names?.length) throw new Error('Monster skill choice must include at least one option.');
      const unknown = choice.names.filter(name => !monsterSkills?.some(skill => skill.name === name));
      if (unknown.length) throw new Error(`Unknown monster skill choice: ${unknown.join(', ')}`);
      const [name] = sample(choice.names, 1, random);
      fixedSkills.push(monsterSkills.find(skill => skill.name === name));
    }
    for (const name of selection.chartTraits ?? []) {
      const ability = monsterSkills?.find(skill => skill.name.toLowerCase() === name.toLowerCase());
      const rule = Object.values(rules.traits).find(item =>
        item.outcomes?.some(outcome => outcome.output?.toLowerCase() === name.toLowerCase()));
      const outcome = rule?.outcomes.find(item => item.output?.toLowerCase() === name.toLowerCase());
      traitData.traits.push(ability?.description ? `${ability.name}: ${ability.description}` : outcome ? `${rule.label}: ${outcome.output}` : name);
      if (ability?.resistances || ability?.vulnerabilities || ability?.title) traitData.rolls.push({ effect: ability });
    }
    if (animal) traitData.traits.push(`Animal: ${animal.name}`);
    const weapons = rules.weapons.groups.flatMap(({ names, ...properties }) => names.map(name => ({ name, ...properties })));
    for (const choice of selection.fixedWeaponChoices) {
      if (!choice.weapons?.length) throw new Error('Weapon choice must include at least one option.');
      if (choice.weapons.some(name => !weapons.some(weapon => weapon.name === name))) throw new Error('Unknown weapon in fixed weapon choice.');
      const [weapon] = sample(choice.weapons, 1, random);
      selection.fixedWeaponSkills.push({ weapon, bonus: choice.bonus ?? 0 });
    }
    const formatFixed = skill => `${skill.name}${skill.value !== undefined ? ` ${skill.value}%` : ''}${skill.description ? `: ${skill.description}` : ''}`;
    traitData.traits.push(...fixedSkills.filter(skill => reservedTraitNames.has(skill.name.toLowerCase())).map(formatFixed));
    selection.typeSkills = fixedSkills.filter(skill => !reservedTraitNames.has(skill.name.toLowerCase())).map(formatFixed);
    for (const skill of fixedSkills) {
      if (skill.resistances || skill.vulnerabilities || skill.title) traitData.rolls.push({ effect: skill });
    }
    if (subtype?.ageBonus && level > subtype.ageBonus.levelAbove) {
      selection.age += roll(subtype.ageBonus.amount, random);
    }
    if (human && random() < type.titleChance) selection.rolls.titles = (selection.rolls.titles ?? 0) + 1;
    if (subtype?.profession || selection.chartProfession) selection.profession = generateProfession(selection.age, random);
    selection.skillBonus = selection.rolls.skillBonus ?? 0;
    for (const threshold of selection.rolls.skillBonusLevels ?? []) {
      if (level > threshold.above) selection.skillBonus = threshold.bonus;
    }
    selection.level = level;
    const titles = [...(api.generateTitles(selection, stats, random) ?? []), ...(selection.chartTitles ?? [])];
    for (const stage of stages) {
      if (!stage.magicTypeSkills) continue;
      const skill = stage.magicTypeSkills[selection.magicSchoolRestriction];
      if (!skill) throw new Error(`No magic skill configured for magic type: ${selection.magicSchoolRestriction}.`);
      selection.fixedMagicSkills.push(skill);
    }
    selection.titleData ??= [];
    if (selection.profession) titles.push(`${selection.profession.name} (Profession, level ${selection.profession.level})`);
    for (const result of traitData.rolls ?? []) {
      if (result.effect?.title) {
        const title = rules.titles.entries.find(entry => entry.name === result.effect.title);
        if (!title) throw new Error(`Unknown title: ${result.effect.title}`);
        const existing = selection.titleData.find(item => item.entry === title);
        if (existing && result.effect.titleLevel !== undefined) {
          existing.level = result.effect.titleLevel;
          const index = titles.findIndex(text => text.startsWith(`${existing.name} (Level `));
          if (index >= 0) titles[index] = `${existing.name} (Level ${existing.level}): ${title.description}`;
        } else if (!existing) {
          const level = result.effect.titleLevel ?? rollTitleLevel(title, selection.age, random);
          selection.titleData.push({ entry: title, name: title.name, level });
          titles.push(`${title.name} (Level ${level}): ${title.description}`);
        }
      }
    }
    let magical = magicEnabled;
    const titleData = selection.titleData ?? [];
    for (const entry of rules.titles.entries) {
      const generatedTitle = titleData.find(item => item.entry === entry)
        ?? (titles.some(text => text.startsWith(`${entry.name} (Level `) || text.startsWith(`${entry.name}:`))
          ? { level: 1 }
          : undefined);
      if (!generatedTitle) continue;
      const { level } = generatedTitle;
      if (entry.allStats) for (const key of statKeys) stats[key] += entry.allStats;
      if (entry.name === 'Weak') {
        stats.STR -= level;
        stats.CON -= level;
      }
      if (entry.enableMagic && magicEnabled) {
        if (!magical) stats.MAG = 15;
        magical = true;
      }
    }
    for (const stage of stages) {
      for (const [key, value] of Object.entries(stage.minimumStats ?? {})) stats[key] = Math.max(stats[key], value);
    }
    if (titleData.some(({ entry }) => entry.redistributeStats)
      || rules.titles.entries.some(entry => entry.redistributeStats
        && titles.some(text => text.startsWith(`${entry.name} (Level `) || text.startsWith(`${entry.name}:`)))) {
      const total = statKeys.reduce((sum, key) => sum + stats[key], 0);
      for (const key of statKeys) stats[key] = 0;
      const direction = Math.sign(total);
      for (let point = 0; point < Math.abs(total); point++) {
        stats[statKeys[roll([0, statKeys.length - 1], random)]] += direction;
      }
    }
    selection.mana = Math.floor(stats.MAG / 5)
      + traitData.rolls.reduce((sum, result) => sum + (result.effect?.manaBonus ?? 0), 0);
    const attackSkills = { weapons: [] };
    const generatedSkills = api.generateSkills(selection, stats, random, traitData, attackSkills) ?? [];
    const naturalAttacks = subtype?.naturalAttacks ?? type?.naturalAttacks;
    return {
      ...selection,
      level,
      ...(childLevel !== undefined ? { childLevel } : {}),
      magicRequired: magicEnabled,
      magical,
      stats,
      traits: traitData.traits ?? [],
      temperaments: traitData.rolls.filter(result => result.category === 'temperament').map(result => result.output),
      traitRolls: traitData.rolls ?? [],
      resistancesAndVulnerabilities: applyTraitResistances(api.generateResistancesAndVulnerabilities(selection, stats) ?? [], traitData.rolls ?? [], level ?? 0),
      titles,
      skills: [...(typeof generatedSkills === 'string' ? [generatedSkills] : generatedSkills), ...(selection.typeSkills ?? []), ...(selection.pendingChartSkills ?? [])],
      specialitySkills: api.generateSpecialitySkills(selection, stats, random, traitData) ?? [],
      magicSkills: magicEnabled ? generateMagicSkills(selection, random) : [],
      ...(animal ? { animal: animal.name } : {}),
      attack: naturalAttacks?.length
        ? { ...naturalAttacks[roll([0, naturalAttacks.length - 1], random)] }
        : generateWeapon(random),
      skillWeapons: subtype?.naturalAttacksOnly ? [] : attackSkills.weapons,
      brawlSkill: attackSkills.brawl,
      relationships: subtype?.generateRelationships === false ? [] : generateRelationships(random)
    };
  }

  function formatType(npc) {
    const type = !npc.type && !npc.subtype
      ? 'TYPE (Subtype)'
      : `${npc.type || 'TYPE'}${npc.showMagicTypeInHeading && npc.magicSchoolRestriction ? ` - ${npc.magicSchoolRestriction}` : ''}${npc.subtype ? ` (${npc.subtype})` : ''}`;
    return `${type}${npc.showAge !== false && npc.age !== undefined ? ` | Age: ${npc.age}` : ''} | Level: ${npc.level ?? 'Not configured'}`;
  }

  function formatSection(value) {
    return Array.isArray(value) ? value.join('\n') : String(value ?? '');
  }

  function substats(npc) {
    const stat = key => Math.floor(npc.stats[key] / substatDivisor);
    return {
      Attack: stat('STR'),
      Defense: stat('CON'),
      Resist: stat('INT'),
      Accuracy: stat('INT') + stat('AGI'),
      Dodge: stat('AGI'),
      Power: stat('MAG')
    };
  }

  function hitPoints(npc) {
    return Math.floor(npc.stats.CON / substatDivisor);
  }

  function format(npc) {
    const resistances = visibleResistances(npc.resistancesAndVulnerabilities);
    const temperaments = npc.temperaments ?? (npc.traitRolls ?? [])
      .filter(result => result.category === 'temperament')
      .map(result => result.output);
    const traits = npc.traits.filter(trait => !trait.startsWith('Temperament: '));
    const combat = substats(npc);
    return [
      formatType(npc),
      `${statLabels.STR}: ${npc.stats.STR} | Attack: ${combat.Attack}`,
      `${statLabels.CON}: ${npc.stats.CON} | Defense: ${combat.Defense}`,
      ...(visibleStatKeys(npc).includes('CHA') ? [`${statLabels.CHA}: ${npc.stats.CHA}`] : []),
      `Resist: ${combat.Resist}`,
      `${statLabels.INT}: ${npc.stats.INT} | Accuracy: ${combat.Accuracy}`,
      `${statLabels.AGI}: ${npc.stats.AGI} | Dodge: ${combat.Dodge}`,
      ...(visibleStatKeys(npc).includes('MAG')
        ? [`${statLabels.MAG}: ${npc.stats.MAG} | Power: ${combat.Power}`]
        : [`Power: ${combat.Power}`]),
      `Hit Points Max: ${hitPoints(npc)}`,
      `Mana: ${npc.mana}`,
      ...(resistances.length ? [`Resistances & Vulnerabilities:\n${resistances.join('\n')}`] : []),
      '',
      `Titles:\n${formatSection(npc.titles)}`,
      ...(temperaments.length ? [`Temperaments:\n${formatSection(temperaments)}`] : []),
      ...(formatSection(traits) ? [`Traits:\n${formatSection(traits)}`] : []),
      `Attack:\n${formatAttacks(npc)}`,
      `Skills:\n${formatSection(npc.skills)}`,
      `Speciality Skills:\n${formatSection(npc.specialitySkills)}`,
      ...(npc.magicSkills.length ? [`Magic Skills:\n${npc.magicSkills.join('\n')}`] : []),
      ...(npc.relationships.length ? [`Relationships & Organizations:\n${npc.relationships.join('\n')}`] : [])
    ].join('\n');
  }

  function visibleStatKeys(npc) {
    return statKeys.filter(key => key !== 'MAG' || npc.magical);
  }

  const api = {
    statKeys, statLabels, configure, roll, rollLevel, sample, weighted, applyModifiers, rollTrait, visibleStatKeys,
    selectType, listTypes, generateStats, generateTraits, substats, hitPoints,
    generateResistancesAndVulnerabilities, visibleResistances, generateWeapon, formatAttack, formatAttacks, generateTitles, generateRelationships,
    generateSkills, generateSpecialitySkills, generateProfession, magicManaCost, sampleAffordableMagicSkills, generateMagicSkills, generate, formatType, formatSection, format
  };
  if (typeof module !== 'undefined' && module.exports) {
    configure(require('./data/rolls.json'), require('./data/types.json'), require('./data/monsters.json'));
    module.exports = api;
  }
  else root.NPCGenerator = api;
})(globalThis);