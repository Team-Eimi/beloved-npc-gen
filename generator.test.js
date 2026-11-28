const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./generator.js');
const rolls = require('./data/rolls.json');
const types = require('./data/types.json');
const monsters = require('./data/monsters.json');

function sequence(values, fallback = 0.5) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

function baseStats(age, adjustment = 0) {
  return generator.generateStats({ age }, sequence([...Array(6).fill(0.5), 0, 0, 0.99], adjustment));
}

test('inclusive integer rolls and distinct samples', () => {
  assert.equal(generator.roll([10, 70], () => 0), 10);
  assert.equal(generator.roll([10, 70], () => 0.9999), 70);
  assert.equal(new Set(generator.sample(generator.statKeys, 4, () => 0)).size, 4);
});

test('weapons have a 30% unarmed chance and every named weapon has the specified damage and properties', () => {
  for (let index = 0; index < 100; index++) {
    const attack = generator.generateWeapon(sequence([(index + 0.5) / 100, 0]));
    assert.equal(attack.name === 'Unarmed', index < 30);
  }
  assert.deepEqual(generator.generateWeapon(() => 0.2999), { name: 'Unarmed', damage: 0 });
  const expected = [
    ...'Dagger,Shortsword,Hand axe,Club,Javelin,Light hammer,War pick,Whip,Pointy stick,Short bow,Blowgun,Sling'.split(',').map(name => ({ name, damage: 2 })),
    ...'Broadsword,Mace,Quarterstaff,Trident,Lance,Sickle,Spear,Flail,Morningstar,Scimitar,Longbow,Crossbow,Revolver,Pistol'.split(',').map(name => ({ name, damage: 4 })),
    ...'Battleaxe,Battle hammer,Greatclub,Greatsword,Bastard sword'.split(',').map(name => ({ name, damage: 8, twoHanded: true })),
    ...'Rifle,Shotgun,Sniper'.split(',').map(name => ({ name, damage: 8 })),
    ...'Grenade,Molotov cocktail'.split(',').map(name => ({ name, damage: 4, radius: 50 }))
  ];
  assert.deepEqual(expected.map((_, index) => generator.generateWeapon(sequence([0.3, (index + 0.5) / expected.length]))), expected);
  assert.equal(generator.formatAttack({ name: 'Greatsword', damage: 8, twoHanded: true }), 'Greatsword (+8 damage, two-handed)');
  assert.equal(generator.formatAttack({ name: 'Grenade', damage: 4, radius: 50 }), 'Grenade (+4 damage, 50 ft radius)');
  assert.equal(generator.formatAttack({ name: 'Unarmed', damage: 0 }), 'Unarmed (+0 damage)');
});

test('character output hides zero resistances but shows nonzero values and the generated attack', () => {
  const npc = generator.generate({ type: 'Vampire', age: 25 }, () => 0);
  assert.deepEqual(npc.resistancesAndVulnerabilities, [
    'Damage Resistance: 0%', 'Limb Damage Resistance: 0%', 'Magical Resistance: 0%',
    'Poison Resistance: 0%', 'Fall Resistance: 0%', 'Fear Resistance: 0%',
    'Charm Resistance: 0%', 'Fire Resistance: 0%', 'Frost Resistance: 0%',
    'Insomnia Resistance: 0%', 'Electric Resistance: 0%', 'Frenzy Resistance: 0%'
  ]);
  assert.ok(!generator.format(npc).includes('Resistances & Vulnerabilities:'));
  assert.ok(generator.format(npc).includes('Attack:\nUnarmed (+0 damage)'));
  npc.resistancesAndVulnerabilities[0] = 'Damage Resistance: 25%';
  npc.resistancesAndVulnerabilities[1] = 'Limb Damage Resistance: -10%';
  const text = generator.format(npc);
  assert.ok(text.includes('Resistances & Vulnerabilities:\nDamage Resistance: 25%\nLimb Damage Resistance: -10%'));
  assert.ok(!text.includes('Resistance: 0%'));
});

test('NPC combat substats use the same floored stat derivations as monsters', () => {
  const npc = generator.generate({ type: 'DRAGON', age: 25 }, () => 0);
  npc.stats = { STR: 49, CON: 54, INT: 27, AGI: 33, MAG: 39, CHA: 20 };
  assert.deepEqual(generator.substats(npc), {
    Attack: 9, Defense: 10, Resist: 5, Accuracy: 11, Dodge: 6, Power: 7
  });
  assert.equal(generator.hitPoints(npc), 10);
  const text = generator.format(npc);
  assert.ok(text.includes('Strength: 49 | Attack: 9'));
  assert.ok(text.includes('Constitution: 54 | Defense: 10'));
  assert.ok(text.includes('Resist: 5'));
  assert.ok(text.includes('Intelligence: 27 | Accuracy: 11'));
  assert.ok(text.includes('Agility: 33 | Dodge: 6'));
  assert.ok(text.includes('Magic: 39 | Power: 7'));
  assert.ok(text.includes('Hit Points Max: 10'));
});

test('unconfigured type weights do not silently select Human', () => {
  try {
    generator.configure(rolls, { types: [{ type: 'HUMAN', weight: null }] });
    assert.equal(generator.selectType(() => 0), undefined);
    const npc = generator.generate({ age: 25 }, () => 0.5);
    assert.equal(npc.type, '');
    assert.equal(npc.age, 25);
    assert.deepEqual(npc.traits, []);
    assert.equal(Object.hasOwn(npc, 'name'), false);
  } finally { generator.configure(rolls, types); }
});

test('available type weights are applied proportionally', () => {
  const weightedTypes = [{ type: 'HUMAN', weight: 60 }, { type: 'UNDEAD', weight: 10 }];
  try {
    generator.configure(rolls, { types: weightedTypes });
    const counts = Object.fromEntries(weightedTypes.map(value => [value.type, 0]));
    for (let index = 0; index < 700; index++) counts[generator.selectType(() => (index + 0.5) / 700)]++;
    assert.deepEqual(counts, { HUMAN: 600, UNDEAD: 100 });
  } finally { generator.configure(rolls, types); }
});

test('non-Human types without subtypes output only a type and use shared rules', () => {
  try {
    generator.configure(rolls, { types: [{ type: 'Example', weight: 1 }] });
    const npc = generator.generate({ type: 'Example', age: 25 }, () => 0.5);
    assert.equal(npc.type, 'Example');
    assert.equal(npc.subtype, '');
    assert.equal(npc.level, undefined);
    assert.deepEqual(npc.traits, []);
    assert.ok(generator.formatType(npc).startsWith('Example | Level:'));
    assert.ok(generator.formatType(npc).endsWith('Level: Not configured'));
    assert.ok(Object.values(npc.stats).every(Number.isFinite));
  } finally { generator.configure(rolls, types); }
});

test('weighted selection uses supplied weights', () => {
  const options = [{ type: 'First', weight: 90 }, { type: 'Second', weight: 5 }, { type: 'Third', weight: 5 }];
  assert.equal(generator.weighted(options, () => 0.899).type, 'First');
  assert.equal(generator.weighted(options, () => 0.90).type, 'Second');
  assert.equal(generator.weighted(options, () => 0.95).type, 'Third');
});

test('levels 1-4 have equal chances', () => {
  for (let level = 1; level <= 4; level++) {
    assert.equal(generator.rollLevel([1, 4], () => (level - 0.5) / 4), level);
  }
});

test('level bands have exact 70/20/10 weights and uniform inclusive rolls within each band', () => {
  const cases = [
    { range: [1, 5], bands: [[1, 2], [3, 4], [5, 5]] },
    { range: [1, 10], bands: [[1, 4], [5, 7], [8, 10]] },
    { range: [1, 20], bands: [[1, 8], [9, 14], [15, 20]] },
    { range: [1, 25], bands: [[1, 10], [11, 18], [19, 25]] },
    { range: [1, 30], bands: [[1, 10], [11, 20], [21, 30]] },
    { range: [1, 45], bands: [[1, 18], [19, 30], [31, 45]] },
    { range: [1, 80], bands: [[1, 32], [33, 56], [57, 80]] }
  ];
  for (const { range, bands } of cases) {
    const counts = [0, 0, 0];
    for (let index = 0; index < 1000; index++) {
      const level = generator.rollLevel(range, sequence([(index + 0.5) / 1000, 0]));
      counts[bands.findIndex(([min, max]) => level >= min && level <= max)]++;
    }
    assert.deepEqual(counts, [700, 200, 100]);
    for (const [index, band] of bands.entries()) {
      const bandRoll = [0.35, 0.8, 0.95][index];
      const size = band[1] - band[0] + 1;
      for (let offset = 0; offset < size; offset++) {
        assert.equal(generator.rollLevel(range, sequence([bandRoll, (offset + 0.5) / size])), band[0] + offset);
      }
    }
    assert.equal(generator.rollLevel(range, sequence([0.7, 0])), bands[1][0]);
    assert.equal(generator.rollLevel(range, sequence([0.9, 0])), bands[2][0]);
  }
});

test('base rolls produce six stats from 28 through 32 before modifiers', () => {
  for (const [random, expected] of [[0, 28], [0.5, 30], [0.9999, 32]]) {
    const stats = generator.generateStats({ age: 25 }, sequence([...Array(6).fill(random), 0, 0, 0.99]));
    assert.deepEqual(Object.values(stats), Array(6).fill(expected));
  }
});

test('up to four distinct weaknesses and strengths receive inclusive modifiers', () => {
  const weak = generator.generateStats({ age: 25 }, sequence([...Array(6).fill(0.5), 0.99, ...Array(8).fill(0), 0, 0.99]));
  assert.deepEqual(Object.values(weak), [18, 18, 18, 18, 30, 30]);
  const strong = generator.generateStats({ age: 25 }, sequence([...Array(6).fill(0.5), 0, 0.99, ...Array(4).fill(0), ...Array(4).fill(0.9999), 0.99]));
  assert.deepEqual(Object.values(strong), [42, 42, 42, 42, 30, 30]);
});

test('extraordinary strengths have 2% and conditional 50% thresholds and distinct stats', () => {
  const prefix = [...Array(6).fill(0.5), 0, 0];
  const double = generator.generateStats({ age: 25 }, sequence([...prefix, 0.019, 0, 0, 0.499, 0, 0.9999]));
  assert.equal(double.STR, 50);
  assert.equal(double.CON, 80);
  const single = generator.generateStats({ age: 25 }, sequence([...prefix, 0.019, 0, 0, 0.5]));
  assert.equal(single.STR, 50);
  assert.equal(single.CON, 30);
  const none = generator.generateStats({ age: 25 }, sequence([...prefix, 0.02]));
  assert.deepEqual(Object.values(none), Array(6).fill(30));
});

test('all age boundaries apply the correct shared adjustments', () => {
  for (const age of [10, 16]) assert.deepEqual(Object.values(baseStats(age)), Array(6).fill(15));
  for (const age of [17, 24]) assert.deepEqual(Object.values(baseStats(age)), Array(6).fill(22));
  for (const age of [25, 29]) assert.deepEqual(Object.values(baseStats(age)), Array(6).fill(30));
  for (const age of [30, 45]) {
    assert.equal(baseStats(age).INT, 30);
    assert.equal(baseStats(age, 0.9999).INT, 45);
  }
  for (const age of [46, 70]) {
    assert.deepEqual(baseStats(age), { STR: 10, CON: 10, CHA: 30, INT: 40, AGI: 30, MAG: 30 });
    assert.deepEqual(baseStats(age, 0.9999), { STR: 25, CON: 25, CHA: 30, INT: 55, AGI: 30, MAG: 30 });
  }
});

test('beauty only changes charm at 1 and 10', () => {
  const stats = Object.fromEntries(generator.statKeys.map(key => [key, 30]));
  const ugly = generator.rollTrait('beauty', stats, sequence([0, 0]));
  assert.equal(ugly.output, 'Ugly');
  assert.equal(stats.CHA, 15);
  const average = generator.rollTrait('beauty', stats, () => 0.5);
  assert.equal(average.output, null);
  assert.equal(stats.CHA, 15);
  const beautiful = generator.rollTrait('beauty', stats, () => 0.9999);
  assert.equal(beautiful.output, 'Beautiful');
  assert.equal(stats.CHA, 30);
});

test('height extremes adjust strength and agility', () => {
  const stats = { STR: 30, AGI: 30 };
  assert.equal(generator.rollTrait('height', stats, () => 0).output, 'Very short');
  assert.deepEqual(stats, { STR: 25, AGI: 35 });
  assert.equal(generator.rollTrait('height', stats, () => 0.9999).output, 'Very tall');
  assert.deepEqual(stats, { STR: 30, AGI: 30 });
  assert.equal(generator.rollTrait('height', stats, () => 0.5).output, 'Average');
  assert.deepEqual(stats, { STR: 30, AGI: 30 });
});

test('Adult always displays exactly one height for all 10 rolls at ages 25 and 70', () => {
  for (const age of [25, 70]) {
    for (let value = 1; value <= 10; value++) {
      const npc = generator.generate({ type: 'HUMAN', subtype: 'Adult', age }, () => (value - 0.5) / 10);
      const expected = `Height: ${value === 1 ? 'Very short' : value === 10 ? 'Very tall' : 'Average'}`;
      assert.deepEqual(npc.traits.filter(trait => trait.startsWith('Height:')), [expected]);
      assert.equal(npc.traitRolls.filter(result => result.category === 'height').length, 1);
      assert.ok(generator.format(npc).includes(expected));
      assert.ok(!generator.format(npc).includes('undefined'));
    }
  }
});

test('height can still be intentionally omitted by removing its default output', () => {
  const configured = structuredClone(rolls);
  delete configured.traits.height.defaultOutput;
  try {
    generator.configure(configured, types);
    const npc = generator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 }, () => 0.5);
    assert.ok(!npc.traits.some(trait => trait.startsWith('Height:')));
    assert.ok(!generator.format(npc).includes('undefined'));
  } finally { generator.configure(rolls, types); }
});

test('explicit default output remains supported when configured', () => {
  const configured = structuredClone(rolls);
  configured.traits.height.defaultOutput = 'N/A';
  try {
    generator.configure(configured, types);
    const npc = generator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 }, () => 0.5);
    assert.ok(npc.traits.includes('Height: N/A'));
  } finally { generator.configure(rolls, types); }
});

test('education adjusts intelligence and grants the specified street smarts skill', () => {
  const stats = { INT: 30 };
  const uneducated = generator.rollTrait('education', stats, () => 0);
  assert.equal(stats.INT, 25);
  assert.deepEqual(uneducated.skills, ['Street smarts']);
  assert.equal(generator.rollTrait('education', stats, () => 0.5).output, null);
  assert.equal(generator.rollTrait('education', stats, () => 0.9999).output, 'Well educated');
  assert.equal(stats.INT, 40);
});

test('traits are opt-in and education skills reach the final output', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const npc = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['education'] }, () => 0);
    assert.deepEqual(npc.traits, ['Education: Uneducated']);
    assert.deepEqual(npc.skills, ['Knowledge: Street smarts 30%']);
    assert.equal(npc.stats.INT, 25);
    assert.ok(generator.format(generator.generate({ type: 'ELEMENTAL', age: 25 })).includes('Temperaments:\n'));
  } finally { generator.generateStats = original; }
});

test('Elemental output shows its automatic magic status and full stat names', () => {
  const npc = generator.generate({ type: 'ELEMENTAL', age: 40, includeMagic: false }, () => 0.5);
  const text = generator.format(npc);
  assert.ok(text.startsWith('ELEMENTAL | Level:'));
  assert.ok(text.includes('Strength:'));
  assert.ok(text.includes('Constitution:'));
  assert.ok(text.includes('Magic:'));
  assert.ok(text.includes('Temperaments:\n'));
});

test('Elemental inherited subtypes receive their own bases, level bonuses, and visible levels', () => {
  const fairy = generator.generate({
    type: 'Elemental',
    subtype: 'Fairy',
    age: 25,
    traitCategories: []
  }, () => 0);
  assert.ok(fairy.level >= 1 && fairy.level <= 80);
  assert.ok(generator.formatType(fairy).includes(`Level: ${fairy.level}`));
  assert.ok(Object.values(fairy.stats).every(value => value >= 10));
  assert.ok(Object.values(fairy.stats).reduce((sum, value) => sum + value, 0) >= 90);
  assert.ok(fairy.stats.MAG >= 10 + fairy.level);

  const elemental = generator.generate({
    type: 'Elemental',
    subtype: 'Elemental',
    age: 25,
    traitCategories: []
  }, () => 0);
  assert.ok(elemental.level >= 1 && elemental.level <= 25);
  assert.ok(Object.values(elemental.stats).every(value => value >= 10));
  assert.ok(Object.values(elemental.stats).reduce((sum, value) => sum + value, 0) >= 120);
  assert.deepEqual(elemental.temperaments, []);

  const inheritedTypes = structuredClone(types);
  const fairyRule = inheritedTypes.types.find(value => value.type === 'Elemental')
    .subtypes.find(value => value.subtype === 'Fairy');
  delete fairyRule.levelRange;
  inheritedTypes.progressionChart = inheritedTypes.progressionChart
    .filter(entry => !(entry.type === 'Elemental' && entry.subtype === 'Fairy'));
  generator.configure(rolls, inheritedTypes, monsters);
  try {
    const inheritedLevel = generator.generate({
      type: 'Elemental',
      subtype: 'Fairy',
      age: 25,
      traitCategories: []
    }, () => 0).level;
    assert.ok(inheritedLevel >= 1 && inheritedLevel <= 5);
  } finally { generator.configure(rolls, types, monsters); }
});

test('progression chart drives every subtype level and stat bonuses', () => {
  const configuredTypes = structuredClone(types);
  for (const type of configuredTypes.types) {
    for (const subtype of type.subtypes ?? []) {
      if (subtype.rolls) {
        subtype.rolls.magicSkills = 0;
        subtype.rolls.lightMagicSkills = 0;
      }
    }
  }
  generator.configure(rolls, configuredTypes, monsters);
  try {
    const chart = new Map(configuredTypes.progressionChart.map(entry => [
      `${entry.type.toLowerCase()}|${entry.subtype.toLowerCase()}`,
      entry
    ]));
    const findRange = (type, subtype, visited = new Set()) => {
      if (visited.has(subtype.subtype)) return undefined;
      visited.add(subtype.subtype);
      const entry = chart.get(`${type.type.toLowerCase()}|${subtype.subtype.toLowerCase()}`);
      const range = entry?.levelRange ?? subtype.levelRange;
      if (range) return range;
      const parents = subtype.inherits === undefined
        ? []
        : Array.isArray(subtype.inherits) ? subtype.inherits : [subtype.inherits];
      for (const name of parents.reverse()) {
        const parent = type.subtypes.find(value => value.subtype === name);
        const inheritedRange = parent && findRange(type, parent, visited);
        if (inheritedRange) return inheritedRange;
      }
      return undefined;
    };

    for (const type of configuredTypes.types) {
      for (const subtype of type.subtypes ?? []) {
        const npc = generator.generate({
          type: type.type,
          subtype: subtype.subtype,
          age: subtype.ageRange?.[0] ?? 25,
          traitCategories: []
        }, () => 0.5);
        const range = findRange(type, subtype);
        if (range) {
          assert.ok(npc.level >= range[0] && npc.level <= range[1], `${type.type} ${subtype.subtype}: ${npc.level} not in ${range}`);
          assert.ok(generator.formatType(npc).includes(`Level: ${npc.level}`));
        } else {
          assert.equal(npc.level, undefined, `${type.type} ${subtype.subtype}`);
          assert.ok(generator.formatType(npc).endsWith('Level: Not configured'));
        }
        assert.ok(Object.values(npc.stats).every(Number.isFinite), `${type.type} ${subtype.subtype}`);
      }
    }

    const hatchling = generator.generate({
      type: 'Dragon',
      subtype: 'Dragon Hatchling',
      age: 25,
      traitCategories: []
    }, () => 0.9999);
    assert.equal(hatchling.level, 3);
    assert.equal(Object.values(hatchling.stats).reduce((sum, value) => sum + value, 0), 150);

    const spark = generator.generate({
      type: 'Omniscient',
      subtype: 'Spark',
      age: 25,
      traitCategories: []
    }, () => 0.9999);
    assert.equal(spark.level, 20);
    assert.equal(Object.values(spark.stats).reduce((sum, value) => sum + value, 0), 600);

    const elder = generator.generate({
      type: 'Dragon',
      subtype: 'Elder Dragon',
      age: 25,
      traitCategories: []
    }, () => 0);
    assert.ok(elder.stats.CON >= 120);

    const genasi = generator.generate({
      type: 'Elemental',
      subtype: 'Genasi',
      age: 25,
      traitCategories: []
    }, () => 0);
    assert.ok(genasi.stats.INT >= 30);

    const humanoidSlime = generator.generate({
      type: 'Slime',
      subtype: 'Pink Slime Humanoid',
      age: 25,
      traitCategories: []
    }, () => 0);
    assert.ok(Object.values(humanoidSlime.stats).every(value => value >= 30));

    const monstrous = generator.generate({
      type: 'Vampire',
      subtype: 'Monstrous',
      age: 25,
      traitCategories: []
    }, () => 0);
    assert.equal(monstrous.stats.INT, 15);
  } finally { generator.configure(rolls, types, monsters); }
});

test('Omniscient chart gains include spells, Domain, and a Monster-list animal with its modifiers', () => {
  const spark = generator.generate({
    type: 'Omniscient',
    subtype: 'Spark',
    age: 25,
    traitCategories: []
  }, () => 0);
  assert.equal(spark.magicSkills.length, 2);
  assert.ok(spark.magicSkills.every(skill => skill.includes('(Omniscient) 50%:')));

  const bird = generator.generate({
    type: 'Omniscient',
    subtype: 'Animal God',
    age: 25,
    traitCategories: []
  }, () => 0);
  let randomCalls = 0;
  const bear = generator.generate({
    type: 'Omniscient',
    subtype: 'Animal God',
    age: 25,
    traitCategories: []
  }, () => randomCalls++ === 20 ? 0.04 : 0);
  assert.ok(monsters.animal.some(animal => animal.name === bear.animal));
  assert.equal(bear.animal, 'Bear');
  assert.equal(bear.level, 1);
  assert.equal(bear.stats.STR, bird.stats.STR + 1);
  assert.equal(bear.stats.CON, bird.stats.CON + 1);
  assert.equal(bear.magicSkills.filter(skill => skill.includes('(Omniscient)')).length, 3);
  assert.ok(bear.magicSkills.some(skill => skill.startsWith('Domain (Omniscient) 30%:')));
  assert.equal(bear.skills.filter(skill => skill.endsWith('50%')).length, 5);
});

test('Hatchlings use Bite or Claws while Ascendant Dragons can use combat skills and weapons', () => {
  const original = generator.generateStats;
  const cruelIndex = rolls.temperaments.findIndex(item => item.name === 'Cruel');
  const rollCruel = () => sequence([(cruelIndex + 0.5) / rolls.temperaments.length], 0);
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const hatchling = generator.generate({
      type: 'Dragon',
      subtype: 'Dragon Hatchling',
      age: 25,
      traitCategories: ['temperament']
    }, rollCruel());
    assert.ok(['Bite', 'Claws'].includes(hatchling.attack.name));
    assert.ok(!hatchling.skills.some(skill => skill.startsWith('Combat:')));

    const ascendant = generator.generate({
      type: 'Dragon',
      subtype: 'Ascendant Dragon',
      age: 25,
      traitCategories: ['temperament']
    }, rollCruel());
    assert.ok(!['Bite', 'Claws'].includes(ascendant.attack.name));
    assert.ok(ascendant.skills.some(skill => skill.startsWith('Combat: ')));
  } finally { generator.generateStats = original; }
});

test('Cubs and Hatchlings show only Bite or Claws, even if a skill grants a weapon', () => {
  const original = generator.generateSkills;
  try {
    generator.generateSkills = (selection, stats, random, traits, attacks) => {
      attacks.weapons.push({ name: 'Longbow', damage: 4, skillPercent: 50 });
      return ['Combat: Weapon (Longbow) 50%'];
    };
    for (const [type, subtype] of [['Lupine', 'Cub'], ['Dragon', 'Dragon Hatchling']]) {
      for (const [randomValue, name] of [[0, 'Bite'], [0.999, 'Claws']]) {
        const npc = generator.generate({ type, subtype, age: 25, traitCategories: [] }, () => randomValue);
        assert.equal(npc.attack.name, name);
        assert.deepEqual(npc.skillWeapons, []);
        assert.ok(!generator.formatAttacks(npc).includes('Longbow'));
        assert.ok(npc.skills.includes('Combat: Weapon (Longbow) 50%'));
      }
    }
    const wolf = generator.generate({ type: 'Lupine', subtype: 'Wolf', age: 25, traitCategories: [] }, () => 0.5);
    assert.ok(generator.formatAttacks(wolf).includes('Longbow'));
  } finally { generator.generateSkills = original; }
});

test('Human subtype magic status is automatic and ignores the former display option', () => {
  for (const subtype of ['Child', 'Adult']) {
    const npc = generator.generate({ type: 'HUMAN', subtype, age: subtype === 'Child' ? 12 : 25, includeMagic: true }, () => 0.5);
    assert.equal(npc.magical, false);
    assert.equal(npc.magicRequired, false);
    assert.ok(!generator.format(npc).includes('Magic:'));
  }
  for (const subtype of ['Lord', 'Magician']) {
    const npc = generator.generate({ type: 'HUMAN', subtype, age: 25, includeMagic: false }, () => 0.5);
    assert.equal(npc.magical, true);
    assert.equal(npc.magicRequired, true);
    assert.ok(generator.format(npc).includes('Magic:'));
  }
});

test('Aloof applies INT, CHA, and Mana effects and is listed separately as a temperament', () => {
  const index = rolls.temperaments.findIndex(item => item.name === 'Aloof');
  const randomValues = [(index + 0.5) / rolls.temperaments.length, ...Array(100).fill(0.5)];
  const npc = generator.generate({
    type: 'Elemental',
    subtype: 'Sprite',
    age: 25,
    traitCategories: ['temperament']
  }, sequence(randomValues, 0.5));
  const baseline = generator.generate({
    type: 'Elemental',
    subtype: 'Sprite',
    age: 25,
    traitCategories: []
  }, sequence(randomValues.slice(1), 0.5));
  assert.equal(npc.stats.INT - baseline.stats.INT, 5);
  assert.equal(npc.stats.CHA - baseline.stats.CHA, -5);
  assert.equal(npc.mana - baseline.mana, 5);
  assert.deepEqual(npc.temperaments, ['Aloof: +5 INT, -5 CHA, +5 Mana.']);
  const text = generator.format(npc);
  assert.ok(text.includes('Temperaments:\nAloof: +5 INT, -5 CHA, +5 Mana.'));
  assert.ok(!text.includes('Traits:\nTemperament:'));
  assert.ok(text.includes(`Mana: ${npc.mana}`));
});

test('every configured non-Human type enables Magic', () => {
  for (const type of types.types.filter(value => value.type.toUpperCase() !== 'HUMAN')) {
    const subtype = type.subtypes[0];
    const npc = generator.generate({ type: type.type, subtype: subtype.subtype }, () => 0.5);
    assert.equal(npc.magicRequired, true, `${type.type} ${subtype.subtype}`);
    assert.equal(npc.magical, true, `${type.type} ${subtype.subtype}`);
    assert.ok(generator.format(npc).includes('Magic:'), `${type.type} ${subtype.subtype}`);
  }
});

test('Human subtype is selected rather than randomly chosen, with its own age and level bounds', () => {
  const cases = [
    ['Child', 12, 16, 4], ['Adult', 17, 100, 10],
    ['Lord', 17, 300, 40], ['Magician', 17, 500, 65]
  ];
  for (const [subtype, minAge, maxAge, maxLevel] of cases) {
    const min = generator.generate({ type: 'HUMAN', subtype }, () => 0);
    const max = generator.generate({ type: 'HUMAN', subtype }, () => 0.9999);
    assert.equal(min.age, minAge, subtype);
    assert.equal(max.age, maxAge, subtype);
    assert.equal(min.level, 1, subtype);
    assert.equal(max.level, maxLevel, subtype);
    assert.throws(() => generator.generate({ type: 'HUMAN', subtype, age: minAge - 1 }), RangeError);
  }
  assert.equal(generator.generate({ type: 'HUMAN', age: 25 }, () => 0.9999).subtype, 'Adult');
});

test('all Human levels are uniformly reachable and apply every level bonus', () => {
  for (const [subtype, age, points, max, perLevel] of [
    ['Child', 12, 0, 4, 20], ['Adult', 25, 15, 10, 4],
    ['Lord', 25, 30, 40, 6], ['Magician', 25, 20, 65, 5]
  ]) {
    for (let level = 1; level <= max; level++) {
      const childRolls = subtype === 'Child' ? [] : Array(5).fill(0);
      const random = sequence([...childRolls, ...Array(points).fill(0), (level - 0.5) / max], 0.9999);
      const npc = generator.generate({ type: 'HUMAN', subtype, age, traitCategories: [] }, random);
      assert.equal(npc.level, level);
      assert.equal(Object.values(npc.stats).reduce((sum, value) => sum + value, 0), 120 + points + (subtype === 'Child' ? 0 : 20) + level * perLevel);
    }
  }
});

test('Human base, random points and one subtype level use the specified stat bonuses', () => {
  const originalTitles = generator.generateTitles;
  const cases = [
    ['Child', 12, 0, { STR: 25, CON: 25, CHA: 25, INT: 25, AGI: 20, MAG: 20 }],
    ['Adult', 25, 15, { STR: 42, CON: 27, CHA: 25, INT: 25, AGI: 20, MAG: 20 }],
    ['Lord', 25, 30, { STR: 58, CON: 28, CHA: 25, INT: 25, AGI: 20, MAG: 20 }],
    ['Magician', 25, 20, { STR: 46, CON: 25, CHA: 25, INT: 26, AGI: 20, MAG: 23 }]
  ];
  try {
    generator.generateTitles = () => [];
    for (const [subtype, age, points, expected] of cases) {
      const childRolls = subtype === 'Child' ? [] : Array(5).fill(0);
      const npc = generator.generate({ type: 'HUMAN', subtype, age, traitCategories: [] }, sequence([...childRolls, ...Array(points).fill(0), ...Array(5).fill(0), 0.9999], 0.9999));
      assert.equal(npc.level, 1);
      assert.deepEqual(npc.stats, expected, subtype);
    }
  } finally {
    generator.generateTitles = originalTitles;
  }
});

test('Adult, Lord and Magician independently roll and apply the full Child level bonus first', () => {
  for (const [subtype, points, max, perLevel] of [['Adult', 15, 10, 4], ['Lord', 30, 40, 6], ['Magician', 20, 65, 5]]) {
    for (let childLevel = 1; childLevel <= 4; childLevel++) {
      const finalLevel = 7;
      const random = sequence([(childLevel - 0.5) / 4, ...Array(childLevel * 4 + points).fill(0), (finalLevel - 0.5) / max], 0.9999);
      const npc = generator.generate({ type: 'HUMAN', subtype, age: 25, traitCategories: [] }, random);
      assert.equal(npc.childLevel, childLevel);
      assert.equal(npc.level, finalLevel);
      assert.equal(Object.values(npc.stats).reduce((sum, value) => sum + value, 0), 120 + childLevel * 20 + points + finalLevel * perLevel);
      assert.equal(npc.stats.CHA, 20 + childLevel * 5);
      assert.equal(npc.stats.INT, 20 + childLevel * 5 + (subtype === 'Magician' ? finalLevel : 0));
    }
  }
  const child = generator.generate({ type: 'HUMAN', subtype: 'Child', age: 12, traitCategories: [] }, () => 0);
  assert.equal(child.childLevel, undefined);
  assert.equal(child.level, 1);
});

test('Human base traits include two distinct temperaments, and overlapping resistances stack', () => {
  const options = { type: 'HUMAN', subtype: 'Child', age: 12 };
  const idiotIndex = rolls.temperaments.findIndex(item => item.name === 'Idiot');
  const remaining = rolls.temperaments.filter(item => item.name !== 'Idiot');
  const braveIndex = remaining.findIndex(item => item.name === 'Brave');
  const npc = generator.generate(options, sequence([0.5, (idiotIndex + 0.5) / rolls.temperaments.length, (braveIndex + 0.5) / remaining.length], 0.9999));
  assert.deepEqual(npc.traitRolls.map(item => item.category), ['beauty', 'temperament', 'temperament']);
  assert.deepEqual(npc.traitRolls.slice(1).map(item => item.effect.name), ['Idiot', 'Brave']);
  assert.deepEqual(generator.visibleResistances(npc.resistancesAndVulnerabilities), ['Fear Resistance: 30%', 'Charm Resistance: 10%']);
});

test('Human non-profession title chance is 30%', () => {
  const options = { type: 'HUMAN', subtype: 'Child', age: 12, traitCategories: [] };
  const prefix = Array(5).fill(0);
  const yes = generator.generate(options, sequence([...prefix, 0.2999, 0], 0.9999));
  const no = generator.generate(options, sequence([...prefix, 0.3], 0.9999));
  assert.deepEqual(yes.titles, ['Make a new title']);
  assert.deepEqual(no.titles, []);
  let count = 0;
  for (let index = 0; index < 100; index++) {
    const npc = generator.generate(options, sequence([...prefix, (index + 0.5) / 100, 0], 0.9999));
    if (npc.titles.length) count++;
  }
  assert.equal(count, 30);
});

test('Lord and Magician bonus skill thresholds apply strictly above each level', () => {
  for (const [subtype, points, max, cases] of [
    ['Lord', 30, 40, [[9, 20], [10, 30], [19, 30], [20, 40], [29, 40], [30, 50], [39, 50], [40, 60]]],
    ['Magician', 20, 65, [[20, 20], [21, 30], [35, 30], [36, 40], [50, 40], [51, 50]]]
  ]) {
    for (const [level, bonus] of cases) {
      const npc = generator.generate({ type: 'HUMAN', subtype, age: 25, traitCategories: [] }, sequence([...Array(5).fill(0), ...Array(points).fill(0), (level - 0.5) / max], 0.9999));
      assert.equal(npc.level, level);
      assert.equal(npc.skillBonus, bonus);
      assert.equal(npc.skills.filter(skill => skill.endsWith(`${30 + bonus}%`)).length, 2);
    }
  }
});

test('profession levels cap at 20 and add to each profession skill base', () => {
  const profession = generator.generateProfession(15, sequence([0, 0]));
  assert.equal(profession.name, 'Politician');
  assert.equal(profession.level, 5);
  assert.deepEqual(generator.generateSkills({ profession, rolls: {} }, {}, () => 0), [
    'Emotional Intelligence: Insight 35%', 'Knowledge: Law 35%', 'Knowledge: Politics 35%'
  ]);
  assert.deepEqual(generator.generateSpecialitySkills({
    profession: { level: 5, skills: [{ name: 'Stealth' }, { category: 'Technical', count: 1, value: 50 }] },
    rolls: {}
  }, {}, () => 0), ['Subterfuge: Stealth 5%', 'Technical: Forensics 55%']);
  assert.equal(generator.generateProfession(15, sequence([0, 0.9999])).level, 20);
  assert.equal(generator.generateProfession(70, sequence([0, 0])).level, 20);
  const names = rolls.professions.flatMap(entry => entry.names);
  assert.deepEqual(names.map((_, index) => generator.generateProfession(30, sequence([(index + 0.5) / names.length, 0])).name), names);
  for (const entry of rolls.professions) {
    const selection = { profession: { ...entry, level: 20 }, rolls: {} };
    assert.doesNotThrow(() => generator.generateSkills(selection, {}, () => 0.5));
    assert.doesNotThrow(() => generator.generateSpecialitySkills(selection, {}, () => 0.5));
  }
});

test('bonus skills stack with existing profession skills and report repeated rolls', () => {
  const selection = {
    profession: { level: 20, skills: [{ name: 'Leadership' }] },
    rolls: { bonusSkills: 2 },
    skillBonus: 20
  };
  assert.deepEqual(generator.generateSkills(selection, {}, () => 0), ['Leadership 70% (rolled twice)', 'Survival 50%']);
});

test('Weapon combat skills add the selected weapon alongside an unarmed attack', () => {
  const npc = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 25, traitCategories: [] }, () => 0.9999);
  assert.ok(npc.skills.some(skill => skill.startsWith('Combat: Weapon (')));
  assert.equal(npc.skillWeapons.length, 1);
  const formattedAttacks = generator.formatAttacks({ ...npc, attack: { name: 'Unarmed', damage: 0 } });
  const formattedWeapon = generator.formatAttack(npc.skillWeapons[0], { name: 'Weapon skill', value: 30 });
  assert.equal(formattedAttacks, `Unarmed (+0 damage)\n${formattedWeapon}`);
});

test('multiple weapon skills preserve damage and properties without duplicate attacks', () => {
  const attackSkills = { weapons: [] };
  const profession = { level: 10, skills: Array(4).fill({ name: 'Weapon (specific)' }) };
  const random = sequence([0, 0, 0, 29.5 / 36, 0, 0.9999, 0, 0]);
  const traits = { rolls: [{ effect: { categoryBonuses: { Combat: 5 } } }] };
  const skills = generator.generateSkills({ profession, rolls: {} }, {}, random, traits, attackSkills);
  assert.ok(skills.includes('Combat: Weapon (Dagger) 55% (rolled twice)'));
  assert.deepEqual(attackSkills.weapons, [
    { name: 'Dagger', damage: 2, skillPercent: 55 },
    { name: 'Greatsword', damage: 8, twoHanded: true, skillPercent: 45 },
    { name: 'Molotov cocktail', damage: 4, radius: 50, skillPercent: 45 }
  ]);
  assert.equal(generator.formatAttacks({ attack: { name: 'Dagger', damage: 2 }, skillWeapons: attackSkills.weapons }),
    'Dagger (+2 damage, Weapon skill: 55%)\nGreatsword (+8 damage, two-handed, Weapon skill: 45%)\nMolotov cocktail (+4 damage, 50 ft radius, Weapon skill: 45%)');
});

test('Brawl and Grapple do not add weapons', () => {
  const attackSkills = { weapons: [] };
  const skills = generator.generateSkills({ rolls: { combatSkills: 2 } }, {}, sequence([0, 0]), {}, attackSkills);
  assert.deepEqual(skills, ['Combat: Brawl 30%', 'Combat: Grapple 30%']);
  assert.deepEqual(attackSkills.weapons, []);
  assert.equal(attackSkills.brawl, 30);
});

test('Unarmed displays the final Brawl percentage but never Grapple', () => {
  const attackSkills = { weapons: [] };
  const profession = { level: 20, skills: [{ name: 'Brawl' }, { name: 'Brawl' }, { name: 'Grapple' }] };
  const traits = { rolls: [{ effect: { categoryBonuses: { Combat: 5 } } }] };
  const skills = generator.generateSkills({ profession, rolls: {} }, {}, () => 0, traits, attackSkills);
  assert.ok(skills.includes('Combat: Brawl 75% (rolled twice)'));
  assert.equal(generator.formatAttacks({ attack: { name: 'Unarmed', damage: 0 }, skillWeapons: [], brawlSkill: attackSkills.brawl }), 'Unarmed (+0 damage, Brawl: 75%)');
  assert.equal(generator.formatAttacks({ attack: { name: 'Unarmed', damage: 0 }, skillWeapons: [] }), 'Unarmed (+0 damage)');
  assert.equal(generator.formatAttacks({ attack: { name: 'Mace', damage: 4 }, skillWeapons: [], brawlSkill: attackSkills.brawl }), 'Mace (+4 damage)');
});

test('generated unarmed characters include their rolled Brawl percentage in the attack', () => {
  const random = sequence([...Array(5).fill(0), ...Array(30).fill(0), 0, 0, 0, 0.99, 0, 0, 0, 0], 0.5);
  const npc = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 25, traitCategories: [] }, random);
  assert.ok(npc.skills.includes('Combat: Brawl 30%'));
  assert.ok(generator.format(npc).includes('Attack:\nUnarmed (+0 damage, Brawl: 30%)'));
});

test('Weapon combat skills remain available through direct skill generation', () => {
  const skills = generator.generateSkills({ rolls: { combatSkills: 1 } }, {}, sequence([0.9, 0]));
  assert.deepEqual(skills, ['Combat: Weapon (Dagger) 30%']);
});

test('Magicians receive distinct elemental spells; Lords show the pending martial skill', () => {
  const magician = generator.generate({ type: 'HUMAN', subtype: 'Magician', age: 25 }, () => 0.9999);
  assert.equal(magician.magicSkills.length, 2);
  assert.notEqual(magician.magicSkills[0], magician.magicSkills[1]);
  const lord = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 25 }, () => 0.9999);
  assert.ok(lord.magicSkills[0].includes('1 pending'));
  assert.ok(lord.skills.some(skill => skill.startsWith('Combat:')));
  for (const npc of [magician, lord]) {
    assert.ok(npc.traitRolls.some(trait => trait.category === 'education'));
    assert.ok(npc.traitRolls.some(trait => trait.category === 'height'));
  }
});

function undeadAtLevel(subtype, age, level, fallback = 0.9) {
  const type = types.types.find(value => value.type.toUpperCase() === 'UNDEAD');
  const entry = type.subtypes.find(value => value.subtype === subtype);
  let points = 0;
  for (let stage = entry; stage; stage = type.subtypes.find(value => value.subtype === stage.inherits)) points += stage.randomPoints ?? 0;
  return generator.generate({ type: 'UNDEAD', subtype, age, traitCategories: [] },
    sequence([...Array(points).fill(0), (level - 0.5) / entry.levelRange[1]], fallback));
}

test('Undead subtypes use specified age and uniform level ranges', () => {
  for (const [subtype, minAge, maxAge, maxLevel] of [
    ['Skeleton', 1, 100, 10], ['Walking Corpse', 1, 100, 10], ['Corpse Mage', 50, 200, 50],
    ['Lich', 100, 1000, 80], ['Fierce Corpse', 50, 300, 70], ['Skeleton Warrior', 5, 100, 10],
    ['Archer Skeleton', 15, 150, 20], ['Shield Skeleton', 15, 150, 20], ['Healer Skeleton', 1, 100, 30]
  ]) {
    const min = generator.generate({ type: 'UNDEAD', subtype, traitCategories: [] }, () => 0);
    const max = generator.generate({ type: 'UNDEAD', subtype, traitCategories: [] }, () => 0.9999);
    assert.equal(min.age, minAge, subtype);
    assert.equal(max.age, maxAge, subtype);
    assert.equal(min.level, 1, subtype);
    assert.equal(max.level, maxLevel, subtype);
    assert.throws(() => generator.generate({ type: 'UNDEAD', subtype, age: minAge - 1 }), RangeError);
  }
  assert.equal(generator.generate({ type: 'UNDEAD', age: 50 }, () => 0.9).subtype, 'Skeleton');
});

test('Undead inherited stat bonuses stack at the selected level', () => {
  for (const [subtype, age, points, perLevel] of [
    ['Skeleton', 50, 0, 1], ['Walking Corpse', 50, 10, 5], ['Corpse Mage', 50, 25, 8],
    ['Lich', 100, 75, 14], ['Fierce Corpse', 50, 30, 9],
    ['Skeleton Warrior', 50, 10, 3], ['Archer Skeleton', 50, 25, 5], ['Shield Skeleton', 50, 15, 3]
  ]) {
    const npc = undeadAtLevel(subtype, age, 10);
    assert.ok(npc.level >= 1 && npc.level <= types.types.find(value => value.type.toUpperCase() === 'UNDEAD')
      .subtypes.find(value => value.subtype === subtype).levelRange[1], subtype);
    assert.equal(Object.values(npc.stats).reduce((sum, value) => sum + value, 0), 30 + points + npc.level * perLevel, subtype);
  }
});

test('subtype inheritance accepts multiple parents, deduplicates shared ancestors, and retains string parents', () => {
  const configuredTypes = {
    types: [{
      type: 'Example',
      subtypes: [
        { subtype: 'Shared', randomPoints: 1, rolls: { skills: 1 } },
        { subtype: 'Parent A', inherits: 'Shared', randomPoints: 2, rolls: { skills: 1 } },
        { subtype: 'Parent B', inherits: ['Shared'], randomPoints: 3, rolls: { skills: 1 } },
        { subtype: 'Humanoid', inherits: ['Parent A', 'Parent B'], randomPoints: 4 }
      ]
    }]
  };
  const originalStats = generator.generateStats;
  try {
    generator.configure(rolls, configuredTypes);
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const npc = generator.generate({ type: 'Example', subtype: 'Humanoid', age: 25 }, () => 0);
    assert.equal(Object.values(npc.stats).reduce((sum, value) => sum + value, 0), 190);
    assert.equal(npc.skills.length, 3);
  } finally {
    generator.generateStats = originalStats;
    generator.configure(rolls, types);
  }
});

test('subtype inheritance rejects cycles and unknown parent names', () => {
  try {
    assert.throws(() => generator.configure(rolls, {
      types: [{
        type: 'Example',
        subtypes: [
          { subtype: 'A', inherits: ['B', 'Missing'] },
          { subtype: 'B', inherits: 'A' }
        ]
      }]
    }), /Cyclic subtype inheritance/);

    assert.throws(() => generator.configure(rolls, {
      types: [{
        type: 'Example',
        subtypes: [{ subtype: 'A', inherits: 'Missing' }]
      }]
    }), /Unknown inherited subtype: Missing/);
  } finally {
    generator.configure(rolls, types);
  }
});

test('Skeleton traits and inherited fixed skills, removals and resistance effects', () => {
  const skeleton = generator.generate({ type: 'UNDEAD', subtype: 'Skeleton', age: 10 }, () => 0.5);
  assert.equal(skeleton.traitRolls.filter(item => item.category === 'temperament').length, 2);
  assert.notEqual(skeleton.traitRolls[0].effect.name, skeleton.traitRolls[1].effect.name);
  const base = undeadAtLevel('Skeleton', 10, 1);
  assert.ok(base.traits.some(trait => trait.startsWith('Slow:')));
  assert.ok(base.traits.some(trait => trait.startsWith('Undead:')));
  assert.deepEqual(generator.visibleResistances(base.resistancesAndVulnerabilities), ['Magical Resistance: 100%', 'Damage Vulnerability']);
  const corpse = undeadAtLevel('Walking Corpse', 10, 1);
  assert.ok(corpse.traits.some(trait => trait.startsWith('Undead:')));
  assert.ok(!corpse.traits.some(trait => /^(Slow|Bony|Fragile):/.test(trait)));
  assert.deepEqual(generator.visibleResistances(corpse.resistancesAndVulnerabilities), []);
  const warrior = undeadAtLevel('Skeleton Warrior', 10, 1);
  assert.ok(warrior.traits.some(trait => trait.startsWith('Bony:')));
  assert.ok(!warrior.traits.some(trait => trait.startsWith('Fragile:')));
  assert.ok(warrior.skills.some(skill => /^Combat:.*50%/.test(skill)));
});

test('Archer randomly receives one arrow skill and one ranged weapon at +30%', () => {
  for (const [random, arrow, weapon, damage] of [
    [0, 'Frost arrow', 'Longbow', 4],
    [0.25, 'Frost arrow', 'Crossbow', 4],
    [0.5, 'Poison arrow', 'Short bow', 2],
    [0.999, 'Sleep arrow', 'Sling', 2]
  ]) {
    const npc = undeadAtLevel('Archer Skeleton', 20, 1, random);
    for (const name of ['Slow', 'Bony', 'Undead', 'Fragile', 'Sniper']) {
      assert.ok(npc.traits.some(trait => trait.startsWith(`${name}:`)), name);
    }
    assert.equal(npc.skills.filter(skill => /^(Frost arrow|Poison arrow|Sleep arrow):/.test(skill)).length, 1);
    assert.ok(npc.skills.some(skill => skill.startsWith(`${arrow}:`)));
    assert.deepEqual(npc.skillWeapons.map(value => [value.name, value.skillPercent]), [[weapon, 60]]);
    assert.deepEqual(npc.skills.filter(skill => skill.startsWith('Combat:')), [`Combat: Weapon (${weapon}) 60%`]);
    assert.ok(generator.format(npc).includes(`${weapon} (+${damage} damage, Weapon skill: 60%)`));
    assert.ok(generator.visibleResistances(npc.resistancesAndVulnerabilities).includes('Damage Vulnerability'));
  }
});

test('Shield resistances increase strictly above level 15 and retain Skeleton defenses', () => {
  for (const [level, amount] of [[15, 30], [16, 40]]) {
    const npc = undeadAtLevel('Shield Skeleton', 20, level);
    const visible = generator.visibleResistances(npc.resistancesAndVulnerabilities);
    for (const name of ['Damage', 'Limb Damage', 'Poison', 'Fire', 'Frost', 'Electric']) assert.ok(visible.includes(`${name} Resistance: ${amount}%`));
    assert.ok(visible.includes('Magical Resistance: 100%'));
    assert.ok(visible.includes('Damage Vulnerability'));
  }
});

test('Corpse Mage and Lich retain spell counts and level-dependent bonuses', () => {
  for (const [level, expected] of [[20, 50], [21, 60], [35, 60], [36, 70], [45, 70], [46, 80]]) {
    const mage = undeadAtLevel('Corpse Mage', 50, level);
    assert.equal(mage.magicSkills.length, 2);
    assert.ok(mage.magicSkills.every(skill => skill.includes(' 30%:')));
    assert.ok(mage.skills.some(skill => skill.endsWith(`${expected}%`)));
  }
  const lich = undeadAtLevel('Lich', 100, 80);
  assert.equal(lich.magicSkills.length, 5);
  assert.ok(lich.magicSkills.slice(0, 2).every(skill => skill.includes(' 30%:')));
  assert.ok(lich.magicSkills.slice(2).every(skill => skill.includes(' 130%:')));
  assert.equal(new Set(lich.magicSkills.map(skill => skill.split(' 30%:')[0].split(' 130%:')[0])).size, 5);
});

test('reserved monster traits and skills are separate from elemental Magic Skill rolls', () => {
  const reserved = [...monsters.reservedTraits, ...monsters.reservedSkills];
  const reservedNames = new Set(reserved.map(entry => entry.name.toLowerCase()));
  const randomSkills = [
    ...rolls.skills.standalone,
    ...Object.values(rolls.skills.categories).flat(),
    ...Object.values(rolls.specialitySkills).flat()
  ];
  assert.ok(randomSkills.every(name => !reservedNames.has(name.toLowerCase())));
  for (const [school, entries] of Object.entries(monsters.magic)) {
    if (['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity'].includes(school)) {
      assert.ok(entries.every(entry => !reservedNames.has(entry.name.toLowerCase())));
    }
  }
  const rolled = generator.generateMagicSkills({ rolls: { magicSkills: 38 } }, () => 0);
  assert.equal(rolled.length, 38);
  assert.ok(rolled.every(skill => / \((Light|Darkness|Fire|Water|Earth|Wind|Electricity)\) /.test(skill)));
  assert.ok(!rolled.some(skill => reserved.some(entry => skill.startsWith(`${entry.name} (`))));
});

test('reserved abilities are displayed in their respective sections when explicitly granted', () => {
  const skeleton = generator.generate({ type: 'Undead', subtype: 'Skeleton', age: 25, traitCategories: [] }, () => 0.999);
  assert.ok(skeleton.traits.some(trait => trait.startsWith('Bony:')));
  assert.ok(!skeleton.skills.some(skill => skill.startsWith('Bony:')));
  assert.ok(generator.format(skeleton).includes('Traits:\nSlow:'));

  const slime = generator.generate({ type: 'Slime', subtype: 'Poison Slime', age: 25, traitCategories: [] }, () => 0.999);
  assert.ok(slime.skills.includes(`Poison slime: ${monsters.reservedSkills.find(skill => skill.name === 'Poison slime').description}`));
  const siren = generator.generate({ type: 'Mermaid', subtype: 'Dark Siren', age: 25, traitCategories: [] }, () => 0.999);
  assert.ok(siren.skills.includes(`Hypnosis: ${monsters.reservedSkills.find(skill => skill.name === 'Hypnosis').description}`));
});

test('Daimata gains Divine flame without unconditional vulnerabilities', () => {
  const npc = generator.generate({ type: 'Animal Kin', subtype: 'Daimata', age: 25, traitCategories: [] }, () => 0.5);
  const description = 'You have three flames on each of your tails. So long as one of them is alight, you will live. All damage that would reduce you to 0 reduces you to 1, instead. However, when all three flames are out, gain all Vulnerabilities.';
  assert.ok(npc.traits.includes(`Divine flame: ${description}`));
  assert.ok(!npc.skills.some(skill => skill.startsWith('Divine flame')));
  assert.ok(!npc.resistancesAndVulnerabilities.some(value => value.endsWith('Vulnerability')));
});

test('character text places titles after the sheet and relationships last', () => {
  const npc = generator.generate({ type: 'Animal Kin', subtype: 'Daimata', age: 25, traitCategories: [] }, () => 0.5);
  const text = generator.format(npc);
  assert.ok(text.indexOf('Mana:') < text.indexOf('Titles:\n'));
  assert.ok(text.indexOf('Titles:\n') < text.indexOf('Traits:\n'));
  assert.ok(text.indexOf('Magic Skills:\n') < text.indexOf('Relationships & Organizations:\n'));
  assert.ok(text.endsWith(npc.relationships.join('\n')));
});

test('Parasite vampire gains the updated Parasite ability', () => {
  const npc = generator.generate({ type: 'Vampire', subtype: 'Parasite', age: 25, traitCategories: [] }, () => 0.999);
  const ability = monsters.reservedSkills.find(skill => skill.name === 'Parasite');
  assert.ok(npc.skills.includes(`Parasite: ${ability.description}`));
  assert.ok(!npc.skills.some(skill => skill.startsWith('Parasitic')));
});

test('elemental spell rolls never exceed available Mana', () => {
  const spell = generator.generateMagicSkills({ mana: 1, rolls: { magicSkills: 1 } }, () => 0);
  assert.equal(spell.length, 1);
  assert.ok(spell[0].includes('Light mote (Light)'));
  assert.equal(generator.magicManaCost({ description: 'Costs 1 Mana.' }), 1);
  assert.deepEqual(generator.sampleAffordableMagicSkills([
    { name: 'Affordable', description: 'Costs 1 Mana.' },
    { name: 'Too expensive', description: 'Costs 5 Mana.' }
  ], 1, 1, () => 0).map(skill => skill.name), ['Affordable']);
  assert.throws(() => generator.sampleAffordableMagicSkills([
    { name: 'Too expensive', description: 'Costs 5 Mana.' }
  ], 1, 1, () => 0), /Not enough distinct spells affordable with 1 Mana/);
  assert.deepEqual(generator.generateMagicSkills({
    mana: 1,
    fixedMagicSkills: [{ name: 'Fly', school: 'Wind' }]
  }), ['Fly (Wind): unavailable (costs 5 Mana; only 1 Mana available)']);
});

test('non-elemental schools are excluded by default but available when explicitly requested', () => {
  const defaultSpells = generator.generateMagicSkills({
    mana: Number.POSITIVE_INFINITY,
    rolls: { magicSkills: 69 }
  }, () => 0);
  assert.equal(defaultSpells.length, 69);
  assert.ok(defaultSpells.every(skill => !/\((Blood|Martial|Omniscient|Ascendant)\)/.test(skill)));

  const martial = generator.generateMagicSkills({
    mana: 2,
    magicRolls: [{ magicSkills: 1, magicSchool: 'Martial' }]
  }, () => 0);
  assert.ok(martial[0].startsWith('Flame Fury Fist (Martial)'));
  const omniscient = generator.generateMagicSkills({
    mana: 10,
    magicRolls: [{ magicSkills: 1, magicSchool: 'Omniscient' }]
  }, () => 0);
  assert.ok(omniscient[0].startsWith('Prophecy (Omniscient)'));
});

test('titles roll configured levels and Peculiar redistributes the same stat total', () => {
  const savantIndex = rolls.titles.entries.findIndex(entry => entry.name === 'Idiot Savant');
  const ageTitle = generator.generateTitles(
    { age: 40, rolls: { titles: 1 } },
    {},
    sequence([0.5, (savantIndex + 0.5) / rolls.titles.entries.length])
  );
  assert.ok(ageTitle[0].startsWith('Idiot Savant (Level 8):'));

  const originalStats = generator.generateStats;
  const originalTitles = generator.generateTitles;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const peculiar = rolls.titles.entries.find(entry => entry.name === 'Peculiar');
    generator.generateTitles = () => [`${peculiar.name}: ${peculiar.description}`];
    const npc = generator.generate({ type: 'DRAGON', age: 25 }, () => 0);
    assert.equal(Object.values(npc.stats).reduce((sum, value) => sum + value, 0), 180);
    assert.deepEqual(npc.stats, { STR: 180, CON: 0, CHA: 0, INT: 0, AGI: 0, MAG: 0 });
  } finally {
    generator.generateStats = originalStats;
    generator.generateTitles = originalTitles;
  }
});

test('Elemental race titles restrict generated spells to their chosen school', () => {
  const elemental = generator.generate({ type: 'ELEMENTAL', age: 40 }, () => 0.5);
  const title = elemental.titleData.find(item => item.entry.race === 'ELEMENTAL');
  assert.ok(title);
  assert.ok(elemental.magicSkills.every(skill => skill.includes(`(${title.school})`)));
  assert.ok(elemental.magicSkills.every(skill => skill.includes(` ${30 + title.level * 2}%:`)));
});

test('Fierce Corpse martial bonus and Healer light spell and intelligence floor', () => {
  for (const [level, percent] of [[1, 50], [9, 50], [10, 60], [80, 130]]) {
    const npc = undeadAtLevel('Fierce Corpse', 50, level);
    assert.ok(npc.magicSkills.includes(`Martial skills: 1 pending at ${percent}% (skill list not supplied)`));
    assert.equal(npc.skills.filter(skill => skill.startsWith('Combat:')).length, 2);
  }
  const healer = undeadAtLevel('Healer Skeleton', 50, 1);
  assert.equal(healer.stats.INT, 15);
  assert.ok(healer.skills.some(skill => skill.startsWith('Heal (Monster):')));
  assert.equal(healer.magicSkills.length, 1);
  assert.ok(healer.magicSkills[0].includes('(Light) 30%:'));
  assert.equal(healer.skills.filter(skill => skill.endsWith('50%')).length, 2);
  assert.equal(healer.magical, true);
});

test('configured type data can be extended without editing the selection algorithm', () => {
  try {
    generator.configure(rolls, { types: [{ type: 'Example', weight: 1 }] });
    assert.equal(generator.generate({ age: 25 }, () => 0.5).type, 'Example');
  } finally { generator.configure(rolls, types); }
});

test('listTypes exposes every type with its subtype names and default for the dropdowns', () => {
  const listed = Object.fromEntries(generator.listTypes().map(value => [value.type, value]));
  assert.deepEqual(Object.keys(listed), types.types.map(value => value.type));
  const human = Object.values(listed).find(value => value.type.toUpperCase() === 'HUMAN');
  const undead = Object.values(listed).find(value => value.type.toUpperCase() === 'UNDEAD');
  assert.deepEqual(human.subtypes, ['Child', 'Adult', 'Lord', 'Magician']);
  assert.equal(human.defaultSubtype, 'Adult');
  assert.deepEqual(undead.subtypes, ['Skeleton', 'Walking Corpse', 'Corpse Mage', 'Lich', 'Fierce Corpse', 'Skeleton Warrior', 'Archer Skeleton', 'Shield Skeleton', 'Healer Skeleton']);
  assert.equal(undead.defaultSubtype, 'Skeleton');
  for (const [type, subtypes] of Object.entries({
    Elemental: ['Sprite', 'Fairy', 'Elemental', 'Genasi'],
    Omniscient: ['Spark', 'Elemental Elf', 'World Elf', 'Solar/Lunar World Elf', 'Animal God'],
    Dragon: ['Dragon Hatchling', 'Wyrm', 'Fairy Dragon', 'Young Dragon', 'Dragon', 'Ascendant Dragon', 'Elder Dragon'],
    Lupine: ['Cub', 'Wolf', 'Werewolf', 'Alpha Werewolf', 'Lesser Wolf', 'Greater Wolf', 'Horned Wolf', 'Pegasi Wolf'],
    Vampire: ['Vampire Spawn', 'Seductress', 'Blood Caster', 'Vampire Lord', 'Monstrous', 'Parasite', 'Phantom'],
    Slime: ['Baby Slime', 'Fruit Jelly', 'Fruit Jelly Humanoid', 'Black Ooze', 'Elder Ooze', 'Blobsticker', 'Blue Slime', 'Blue Slime Humanoid', 'Poison Slime', 'Pink Slime', 'Pink Slime Humanoid'],
    Mermaid: ['Mermaid', 'Siren', 'Dark Siren', 'Enchantress', 'Sea Serpent', 'Kraken', 'Megalodon', 'Elder Mermaid', 'Keeper of Beasts', 'Witch of the Seas'],
    'Animal Kin': ['Childling', 'Kiyone', 'Daimata', 'Guardian Crow']
  })) {
    assert.deepEqual(listed[type].subtypes, subtypes, type);
  }
  const hatchling = generator.generate({ type: 'Dragon', subtype: 'Dragon Hatchling', age: 25 }, () => 0);
  assert.equal(hatchling.type, 'Dragon');
  assert.equal(hatchling.subtype, 'Dragon Hatchling');
  assert.ok(generator.statKeys.every(key => Number.isFinite(hatchling.stats[key])));
});

test('Guardian Crow gains Fly, four skills at +20%, and Guardian crow', () => {
  const options = { type: 'Animal Kin', subtype: 'Guardian Crow', age: 25, traitCategories: [] };
  const lowMana = generator.generate(options, () => 0);
  assert.deepEqual(lowMana.skills.filter(skill => skill.endsWith('50%')), [
    'Leadership 50%', 'Survival 50%', 'Athletics 50%', 'Acrobatics 50%'
  ]);
  const guardianCrow = 'Guardian crow: Choose a charge to protect and nurture. The charge must not be an adult, and must be entirely alone. You will always know where your charge is.';
  assert.equal(lowMana.traits.filter(trait => trait.startsWith('Guardian crow')).length, 1);
  assert.ok(lowMana.traits.includes(guardianCrow));
  assert.ok(generator.format(lowMana).includes(guardianCrow));
  assert.ok(lowMana.magicSkills.some(skill => skill.startsWith('Fly (Wind): unavailable')));

  const highMana = generator.generate(options, () => 0.999);
  assert.ok(highMana.magicSkills.some(skill => skill.startsWith('Fly (Wind) 30%:')));
});

test('progression chart preserves updated Slime entries and separate Humanoid parents', () => {
  const chart = types.progressionChart;
  assert.ok(chart.length > 40);
  assert.deepEqual(chart.find(row => row.type === 'Slime' && row.subtype === 'Black Ooze'), {
    type: 'Slime',
    subtype: 'Black Ooze',
    levelRange: [1, 20],
    base: '+10 CON +10 MAG',
    pointsOnLevelUp: 'MAG by 2; AGI by 1',
    netGainMaxCumulative: '3 (70) (86)',
    titleGain: 'none',
    traitGain: 'none',
    skillGain: 'Decay +40%'
  });
  const slime = types.types.find(value => value.type === 'Slime');
  for (const parent of ['Fruit Jelly', 'Blue Slime', 'Pink Slime']) {
    assert.equal(slime.subtypes.find(value => value.subtype === `${parent} Humanoid`).inherits, parent);
  }
});

test('type-restricted magic keeps its school and Ascendant Dragons replace inherited magic', () => {
  for (const [randomValue, school, skill, otherSkill] of [[0, 'Light', 'Miracle', 'Calamity'], [0.999, 'Darkness', 'Calamity', 'Miracle']]) {
    const npc = generator.generate({ type: 'Dragon', subtype: 'Ascendant Dragon', age: 25, traitCategories: [] }, () => randomValue);
    assert.equal(npc.magicSchoolRestriction, school);
    assert.ok(generator.formatType(npc).startsWith(`Dragon - ${school} (Ascendant Dragon)`));
    assert.equal(npc.titles.filter(title => ['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity'].includes(title)).length, 1);
    assert.ok(npc.titles.includes(school));
    assert.equal(npc.magicSkills.length, 3);
    assert.equal(npc.magicSkills.filter(skill => skill.includes(`(${school})`)).length, 1);
    assert.equal(npc.magicSkills.filter(skill => skill.includes('(Omniscient)')).length, 1);
    assert.ok(npc.magicSkills.some(value => value.startsWith(`${skill} (Ascendant) 30%:`)));
    assert.ok(!npc.magicSkills.some(value => value.startsWith(`${otherSkill} (`)));
    assert.ok(npc.traits.some(trait => trait.startsWith('Soulmate:')));
    assert.ok(npc.titles.some(title => title.startsWith('Obsessed (Level 10):')));
    assert.equal(npc.titleData.find(title => title.name === 'Obsessed').level, 10);
    assert.ok(npc.traits.includes('Fly (Monster): Enables flight.'));
    assert.ok(!npc.magicSkills.some(skill => skill.startsWith('Soulmate')));
  }
  for (const subtype of ['Fairy', 'Elemental', 'Genasi']) {
    const npc = generator.generate({ type: 'Elemental', subtype, age: 25, traitCategories: [] }, () => 0.5);
    assert.ok(npc.magicSkills.every(skill => skill.includes(`(${npc.magicSchoolRestriction})`)));
    assert.ok(!npc.titles.some(title => ['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity'].includes(title)));
  }
  assert.ok(monsters.reservedTraits.some(trait => trait.name === 'Soulmate'));
  assert.ok(!monsters.magic.Ascendant.some(skill => skill.name === 'Soulmate'));
});

test('Soulmate sets an already rolled Obsessed title to level 10 without duplicating it', () => {
  const original = generator.generateTitles;
  const obsessed = rolls.titles.entries.find(entry => entry.name === 'Obsessed');
  try {
    generator.generateTitles = selection => {
      selection.magicSchoolRestriction = 'Light';
      selection.titleData = [{ entry: obsessed, name: obsessed.name, level: 3 }];
      return [`${obsessed.name} (Level 3): ${obsessed.description}`];
    };
    const npc = generator.generate({ type: 'Dragon', subtype: 'Ascendant Dragon', age: 25, traitCategories: [] }, () => 0);
    assert.equal(npc.level, 1);
    assert.equal(npc.titles.filter(title => title.startsWith('Obsessed (Level ')).length, 1);
    assert.ok(npc.titles.some(title => title.startsWith('Obsessed (Level 10):')));
    assert.equal(npc.titleData.find(title => title.name === 'Obsessed').level, 10);
  } finally { generator.generateTitles = original; }
});

test('age appears only when the selected subtype specifies an age range', () => {
  for (const [type, subtype, showAge] of [
    ['Human', 'Adult', true],
    ['Undead', 'Walking Corpse', true],
    ['Elemental', 'Sprite', true],
    ['Elemental', 'Fairy', false],
    ['Dragon', 'Ascendant Dragon', false],
    ['Animal Kin', 'Daimata', false]
  ]) {
    const npc = generator.generate({ type, subtype, age: 25, traitCategories: [] }, () => 0.5);
    assert.equal(npc.age, 25);
    assert.equal(generator.formatType(npc).includes('Age: 25'), showAge, `${type} ${subtype}`);
    assert.equal(generator.format(npc).includes('Age: 25'), showAge, `${type} ${subtype}`);
  }
});

test('updated subtype grants follow each Slime parent and Mermaid inheritance', () => {
  const generate = (type, subtype) => generator.generate({ type, subtype, age: 25, traitCategories: [] }, () => 0.5);
  const fruit = generate('Slime', 'Fruit Jelly Humanoid');
  const blue = generate('Slime', 'Blue Slime Humanoid');
  const pink = generate('Slime', 'Pink Slime Humanoid');
  assert.ok(fruit.skills.some(skill => skill.startsWith('Sweet smell 50%:')));
  assert.ok(!fruit.skills.some(skill => skill.startsWith('Healing slime:')));
  assert.ok(blue.skills.some(skill => skill.startsWith('Healing slime:')));
  assert.ok(blue.magicSkills.some(skill => skill.startsWith('Heal (Light) 60%:')));
  assert.ok(!blue.skills.some(skill => skill.startsWith('Sweet smell')));
  assert.ok(pink.skills.some(skill => skill.startsWith('Aphordisiac 50%:')));
  assert.ok(!pink.skills.some(skill => skill.startsWith('Healing slime')));
  const ooze = generate('Slime', 'Elder Ooze');
  assert.ok(ooze.magicSkills.some(skill => skill.startsWith('Decay (Earth) 70%:')));
  const siren = generate('Mermaid', 'Siren');
  assert.ok(siren.skills.some(skill => skill.startsWith('Siren song 50%:')));
  assert.ok(!siren.skills.some(skill => skill.startsWith('Enchanting voice')));
  const dark = generate('Mermaid', 'Dark Siren');
  assert.ok(dark.skills.some(skill => skill.startsWith('Siren song (Dark Siren):')));
  assert.ok(!dark.skills.some(skill => skill.startsWith('Siren song 50%:')));
  assert.ok(dark.magicSkills.some(skill => skill.includes('(Darkness) 50%:')));
  const megalodon = generate('Mermaid', 'Megalodon');
  assert.ok(megalodon.traits.some(trait => trait.startsWith('Sleepless:')));
  assert.ok(megalodon.resistancesAndVulnerabilities.includes('Insomnia Resistance: 100%'));
});

test('fixed chart appearance traits apply their normal modifiers', () => {
  const example = {
    types: [{ type: 'Example', baseStats: 20, subtypes: [{ subtype: 'Fixed' }] }],
    progressionChart: [{ type: 'Example', subtype: 'Fixed', traitGain: 'beautiful, very short' }]
  };
  try {
    generator.configure(rolls, example, monsters);
    const npc = generator.generate({ type: 'Example', subtype: 'Fixed', age: 25, traitCategories: [] }, () => 0.5);
    assert.equal(npc.stats.CHA, 28);
    assert.equal(npc.stats.STR, 15);
    assert.equal(npc.stats.AGI, 25);
    assert.ok(npc.traits.includes('Beauty: Beautiful'));
    assert.ok(npc.traits.includes('Height: Very short'));
  } finally { generator.configure(rolls, types, monsters); }
});

test('updated level ranges and Fly (Monster) apply to their subtypes', () => {
  for (const [type, subtype, maximum] of [
    ['Lupine', 'Greater Wolf', 20],
    ['Vampire', 'Parasite', 15],
    ['Vampire', 'Phantom', 15],
    ['Slime', 'Fruit Jelly Humanoid', 5],
    ['Slime', 'Elder Ooze', 40]
  ]) {
    const npc = generator.generate({ type, subtype, age: 25, traitCategories: [] }, () => 0.999);
    assert.equal(npc.level, maximum, subtype);
  }
  const wolf = generator.generate({ type: 'Lupine', subtype: 'Pegasi Wolf', age: 25, traitCategories: [] }, () => 0.5);
  assert.ok(wolf.traits.includes('Fly (Monster): Enables flight.'));
  assert.ok(!wolf.magicSkills.some(skill => skill.startsWith('Fly (Wind): unavailable')));
});

test('Walking Corpse halves only profession skill percentages', () => {
  const selection = {
    profession: { level: 20, skills: [{ name: 'Leadership' }, { name: 'Stealth' }, { name: 'Survival', value: 55 }] },
    halfProfessionSkills: true,
    rolls: { skills: 1 }
  };
  assert.deepEqual(generator.generateSkills(selection, {}, () => 0.5), ['Leadership 25%', 'Survival 37%', 'Art: Performance 30%']);
  assert.deepEqual(generator.generateSpecialitySkills(selection, {}, () => 0.5), ['Subterfuge: Stealth 10%']);
  const corpse = generator.generate({ type: 'Undead', subtype: 'Walking Corpse', age: 25, traitCategories: [] }, () => 0.5);
  assert.equal(corpse.halfProfessionSkills, true);
});

test('magic type titles come from the supplied table and are distinct', () => {
  const selection = { rolls: { magicTypeTitles: 7 } };
  assert.deepEqual(generator.generateTitles(selection, {}, () => 0), ['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity']);
  assert.deepEqual(generator.generateTitles({ rolls: { titles: 1 } }, {}, () => 0), ['Make a new title']);
  assert.deepEqual(generator.generateTitles({}, {}, () => 0), []);
});

test('Forsaken is available as a title and always starts at level 1', () => {
  const index = rolls.titles.entries.findIndex(entry => entry.name === 'Forsaken');
  for (const randomValue of [0, 0.999]) {
    const selection = { age: 40, rolls: { titles: 1 } };
    const output = generator.generateTitles(selection, {}, sequence([0.5, (index + 0.5) / rolls.titles.entries.length, randomValue]));
    assert.deepEqual(output, ['Forsaken (Level 1): This creature has been forsaken by the Gods.']);
  }
});

test('relationship tables cover every level and retain boundary outcomes', () => {
  for (let level = -50; level <= 50; level++) {
    const results = generator.generateRelationships(() => (level + 50.5) / 101);
    assert.equal(results.length, 4);
    assert.ok(results.every(result => result.endsWith(`(${level})`)));
  }
  const at = level => generator.generateRelationships(() => (level + 50.5) / 101);
  assert.ok(at(-9)[1].includes('a hated sibling'));
  assert.ok(at(1)[2].includes('an ex not worth mentioning'));
  assert.ok(at(2)[1].includes('a normal family'));
  assert.ok(at(2)[3].includes('a new member'));
});

test('specified subtypes omit relationships and organizations without suppressing their descendants', () => {
  const excluded = {
    Elemental: ['Sprite', 'Elemental'],
    Omniscient: ['Spark'],
    Lupine: ['Cub', 'Wolf', 'Lesser Wolf', 'Greater Wolf', 'Horned Wolf'],
    Vampire: ['Monstrous', 'Parasite', 'Phantom'],
    Slime: ['Baby Slime', 'Fruit Jelly', 'Black Ooze', 'Elder Ooze', 'Blobsticker', 'Blue Slime', 'Poison Slime', 'Pink Slime'],
    Mermaid: ['Sea Serpent', 'Kraken', 'Megalodon'],
    Undead: ['Skeleton', 'Skeleton Warrior', 'Archer Skeleton', 'Shield Skeleton', 'Healer Skeleton'],
    'Animal Kin': ['Childling']
  };
  for (const [type, subtypes] of Object.entries(excluded)) {
    for (const subtype of subtypes) {
      const npc = generator.generate({ type, subtype, age: 25, traitCategories: [] }, () => 0.5);
      assert.deepEqual(npc.relationships, [], `${type} ${subtype}`);
      assert.ok(!generator.format(npc).includes('Relationships & Organizations:'), `${type} ${subtype}`);
    }
  }
  for (const [type, subtype] of [
    ['Elemental', 'Fairy'], ['Omniscient', 'Elemental Elf'],
    ['Lupine', 'Werewolf'], ['Lupine', 'Pegasi Wolf'],
    ['Slime', 'Fruit Jelly Humanoid'], ['Slime', 'Blue Slime Humanoid'],
    ['Slime', 'Pink Slime Humanoid'], ['Mermaid', 'Siren'],
    ['Undead', 'Walking Corpse'], ['Animal Kin', 'Guardian Crow']
  ]) {
    const npc = generator.generate({ type, subtype, age: 25, traitCategories: [] }, () => 0.5);
    assert.equal(npc.relationships.length, 4, `${type} ${subtype}`);
    assert.ok(generator.format(npc).includes('Relationships & Organizations:'), `${type} ${subtype}`);
  }
});

test('generic title rolls split at 50% and use the supplied title descriptions', () => {
  const selection = { rolls: { titles: 1 } };
  assert.deepEqual(generator.generateTitles(selection, {}, () => 0.4999), ['Make a new title']);
  const riskTaker = generator.generateTitles(selection, {}, sequence([0.5, 0, 0]));
  assert.match(riskTaker[0], /^Risk Taker \(Level (?:[1-9]|1\d|20)\): Gain \+1% per level when doing something risky\.$/);
  for (let index = 0; index < rolls.titles.entries.length; index++) {
    const output = generator.generateTitles(selection, {}, sequence([0.5, (index + 0.5) / rolls.titles.entries.length]));
    const name = rolls.titles.entries[index].magicTypeTemplate
      ? new RegExp(`^(${Object.keys(monsters.magic).join('|')}) Magician`)
      : null;
    assert.ok(name ? name.test(output[0]) : output[0].startsWith(`${rolls.titles.entries[index].name} (Level `));
  }
});

test('skill rolls retain categories and use the regular and speciality base values', () => {
  const selection = { rolls: { skills: 2, combatSkills: 1, specialitySkills: 2 } };
  assert.deepEqual(generator.generateSkills(selection, {}, () => 0), ['Leadership 30%', 'Survival 30%', 'Combat: Brawl 30%']);
  assert.deepEqual(generator.generateSpecialitySkills(selection, {}, () => 0), ['Subterfuge: Stealth 0%', 'Subterfuge: Sleight of Hand 0%']);
  assert.deepEqual(rolls.skills.categories.Art, ['Performance', 'Dance', 'Fine arts', 'Fiber arts', 'Cooking']);
  assert.ok(rolls.skills.standalone.includes('Driving'));
  assert.ok(rolls.specialitySkills.Science.includes('Psychology'));
});

test('temperament applies immediate stats, category skill bonuses, and vulnerabilities', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const index = rolls.temperaments.findIndex(item => item.name === 'Heartfelt');
    const npc = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] }, sequence([(index + 0.5) / rolls.temperaments.length], 0));
    assert.equal(npc.stats.CHA, 35);
    assert.deepEqual(npc.skills, ['Emotional Intelligence: Insight 32%', 'Emotional Intelligence: Deception 32%']);
    assert.deepEqual(generator.visibleResistances(npc.resistancesAndVulnerabilities), ['Charm Vulnerability']);
    assert.ok(generator.format(npc).includes('Temperaments:\nHeartfelt:'));
    const sturdyIndex = rolls.temperaments.findIndex(item => item.name === 'Sturdy');
    const sturdy = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] }, sequence([(sturdyIndex + 0.5) / rolls.temperaments.length], 0));
    assert.deepEqual(generator.visibleResistances(sturdy.resistancesAndVulnerabilities), ['Damage Resistance: 10%', 'Limb Damage Resistance: 10%']);
  } finally { generator.generateStats = original; }
});

test('all temperament entries generate successfully and sensitive grants ten skills and all vulnerabilities', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    for (const [index, temperament] of rolls.temperaments.entries()) {
      const npc = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] }, sequence([(index + 0.5) / rolls.temperaments.length], 0));
      assert.ok(npc.traits[0].startsWith(`Temperament: ${temperament.name}:`));
      if (temperament.name === 'Sensitive') {
        assert.equal(npc.skills.length, 10);
        assert.equal(new Set(npc.skills).size, 10);
        assert.ok(npc.skills.every(skill => skill.endsWith('40%')));
        assert.equal(generator.visibleResistances(npc.resistancesAndVulnerabilities).length, 12);
      }
    }
  } finally { generator.generateStats = original; }
});

test('new temperament entries apply immediate effects and scale Iron will resistances by level', () => {
  const originalStats = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    for (const name of ['Pacifist', 'Fixated', 'Volatile', 'Dramatic', 'Iron will', 'Dutiful', 'Obsessive', 'Lone wolf', 'Rebellious', 'Curious']) {
      assert.ok(rolls.temperaments.some(item => item.name === name), name);
    }
    const volatileIndex = rolls.temperaments.findIndex(item => item.name === 'Volatile');
    const volatile = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] },
      sequence([(volatileIndex + 0.5) / rolls.temperaments.length], 0));
    assert.equal(volatile.stats.STR, 35);
    assert.ok(generator.visibleResistances(volatile.resistancesAndVulnerabilities).includes('Frenzy Vulnerability'));

    const curiousIndex = rolls.temperaments.findIndex(item => item.name === 'Curious');
    const curious = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] },
      sequence([(curiousIndex + 0.5) / rolls.temperaments.length, 0], 0));
    assert.equal(curious.stats.INT, 35);
    assert.ok(curious.skills.some(skill => skill.startsWith('Perception:') && skill.endsWith('40%')));

    const ironWillIndex = rolls.temperaments.findIndex(item => item.name === 'Iron will');
    const ironWill = generator.generate({ type: 'HUMAN', subtype: 'Child', age: 12, traitCategories: ['temperament'] },
      sequence([(ironWillIndex + 0.5) / rolls.temperaments.length, 0.5], 0.5));
    assert.equal(ironWill.level, 3);
    for (const name of ['Magical', 'Fear', 'Charm']) {
      assert.ok(generator.visibleResistances(ironWill.resistancesAndVulnerabilities).includes(`${name} Resistance: 3%`));
    }

    const selflessIndex = rolls.temperaments.findIndex(item => item.name === 'Selfless');
    const selfless = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] },
      sequence([(selflessIndex + 0.5) / rolls.temperaments.length], 0));
    assert.equal(selfless.stats.CHA, 50);
  } finally { generator.generateStats = originalStats; }
});

test('title effects apply automatically without overriding the Human magic exceptions', () => {
  const originalStats = generator.generateStats;
  const originalTitles = generator.generateTitles;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const title = name => {
      const entry = rolls.titles.entries.find(value => value.name === name);
      return [`${entry.name}: ${entry.description}`];
    };
    generator.generateTitles = () => title('Criminal (Guild)');
    const criminal = generator.generate({ type: 'DRAGON', age: 25 }, () => 0);
    assert.deepEqual(Object.values(criminal.stats), Array(6).fill(20));
    generator.generateTitles = () => title('Protector');
    const protector = generator.generate({ type: 'DRAGON', age: 25 }, () => 0);
    assert.equal(protector.magical, true);
    assert.equal(protector.stats.MAG, 30);
    generator.generateTitles = () => [];
    const magical = generator.generate({ type: 'DRAGON', age: 25, includeMagic: true }, () => 0);
    assert.equal(magical.magical, true);
    assert.ok(generator.format(magical).includes('Magic:'));
    generator.generateTitles = selection => {
      selection.titleMagicRolls = [{ lightMagicSkills: 1 }];
      return title('Protector');
    };
    const humanChild = generator.generate({ type: 'HUMAN', subtype: 'Child', age: 12 }, () => 0.5);
    assert.equal(humanChild.magical, false);
    assert.ok(!generator.format(humanChild).includes('Magic:'));
    assert.deepEqual(humanChild.magicSkills, []);
    generator.generateTitles = () => title('Lover Boy');
    const romanticIndex = rolls.temperaments.findIndex(item => item.name === 'Romantic');
    const romantic = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] }, sequence([(romanticIndex + 0.5) / rolls.temperaments.length], 0));
    assert.ok(romantic.titles.some(value => value.startsWith('Lover Boy (Level ')));
  } finally {
    generator.generateStats = originalStats;
    generator.generateTitles = originalTitles;
  }
});