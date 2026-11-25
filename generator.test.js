const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./generator.js');
const rolls = require('./data/rolls.json');
const types = require('./data/types.json');

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
  const npc = generator.generate({ type: 'DRAGON', age: 25 }, () => 0);
  assert.deepEqual(npc.resistancesAndVulnerabilities, [
    'Damage Resistance: 0%', 'Limb Damage Resistance: 0%', 'Magical Resistance: 0%',
    'Poison Resistance: 0%', 'Fall Resistance: 0%', 'Fear Resistance: 0%',
    'Charm Resistance: 0%', 'Fire Resistance: 0%', 'Frost Resistance: 0%',
    'Insomnia Resistance: 0%', 'Electric Resistance: 0%', 'Frenzy Resistance: 0%'
  ]);
  assert.ok(!generator.format(npc).includes('Resistances & Vulnerabilities:'));
  assert.ok(generator.format(npc).includes('Attack: Unarmed (+0 damage)'));
  npc.resistancesAndVulnerabilities[0] = 'Damage Resistance: 25%';
  npc.resistancesAndVulnerabilities[1] = 'Limb Damage Resistance: -10%';
  const text = generator.format(npc);
  assert.ok(text.includes('Resistances & Vulnerabilities:\nDamage Resistance: 25%\nLimb Damage Resistance: -10%'));
  assert.ok(!text.includes('Resistance: 0%'));
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
  const expected = { HUMAN: 60, UNDEAD: 10 };
  assert.deepEqual(Object.fromEntries(types.types.map(value => [value.type, value.weight])), expected);
  const counts = Object.fromEntries(types.types.map(value => [value.type, 0]));
  for (let index = 0; index < 700; index++) counts[generator.selectType(() => (index + 0.5) / 700)]++;
  for (const [type, weight] of Object.entries(expected)) assert.equal(counts[type], weight * 10);
});

test('non-Human types without subtypes output only a type and use shared rules', () => {
  try {
    generator.configure(rolls, { types: [{ type: 'Example', weight: 1 }] });
    const npc = generator.generate({ type: 'Example', age: 25 }, () => 0.5);
    assert.equal(npc.type, 'Example');
    assert.equal(npc.subtype, '');
    assert.equal(npc.level, undefined);
    assert.deepEqual(npc.traits, []);
    assert.ok(generator.formatType(npc).startsWith('Example | Age: 25'));
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
    assert.ok(!generator.format(generator.generate({ type: 'ELEMENTAL', age: 25 })).includes('Traits:'));
  } finally { generator.generateStats = original; }
});

test('output uses full stat names, age, and excludes magic when not applicable', () => {
  const npc = generator.generate({ type: 'ELEMENTAL', age: 40, includeMagic: false }, () => 0.5);
  const text = generator.format(npc);
  assert.ok(text.startsWith('ELEMENTAL | Age: 40'));
  assert.ok(text.includes('Strength:'));
  assert.ok(text.includes('Constitution:'));
  assert.ok(!text.includes('Magic:'));
  assert.ok(!text.includes('Traits:'));
  npc.includeMagic = true;
  assert.ok(generator.format(npc).includes('Magic:'));
});

test('Human subtype magic rules override the generic display preference', () => {
  for (const subtype of ['Child', 'Adult']) {
    const npc = generator.generate({ type: 'HUMAN', subtype, age: subtype === 'Child' ? 12 : 25, includeMagic: true }, () => 0.5);
    assert.equal(npc.includeMagic, false);
    assert.equal(npc.magicRequired, false);
    assert.ok(!generator.format(npc).includes('Magic:'));
  }
  for (const subtype of ['Lord', 'Magician']) {
    const npc = generator.generate({ type: 'HUMAN', subtype, age: 25, includeMagic: false }, () => 0.5);
    assert.equal(npc.includeMagic, true);
    assert.equal(npc.magicRequired, true);
    assert.ok(generator.format(npc).includes('Magic:'));
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
  const cases = [
    ['Child', 12, 0, { STR: 25, CON: 25, CHA: 25, INT: 25, AGI: 20, MAG: 20 }],
    ['Adult', 25, 15, { STR: 42, CON: 27, CHA: 25, INT: 25, AGI: 20, MAG: 20 }],
    ['Lord', 25, 30, { STR: 58, CON: 28, CHA: 25, INT: 25, AGI: 20, MAG: 20 }],
    ['Magician', 25, 20, { STR: 46, CON: 25, CHA: 25, INT: 26, AGI: 20, MAG: 23 }]
  ];
  for (const [subtype, age, points, expected] of cases) {
    const childRolls = subtype === 'Child' ? [] : Array(5).fill(0);
    const npc = generator.generate({ type: 'HUMAN', subtype, age, traitCategories: [] }, sequence([...childRolls, ...Array(points).fill(0), ...Array(5).fill(0)], 0.9999));
    assert.equal(npc.level, 1);
    assert.deepEqual(npc.stats, expected, subtype);
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
  const npc = generator.generate(options, sequence([0.5, 8.5 / 41, 17.5 / 40], 0.9999));
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
    ['Lord', 30, 40, [[20, 20], [21, 30], [30, 30], [31, 40]]],
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

test('profession requirements reference categories and skill levels are based on age', () => {
  const profession = generator.generateProfession(30, sequence([0, 0]));
  assert.equal(profession.name, 'Politician');
  assert.equal(profession.level, 20);
  assert.deepEqual(generator.generateSkills({ profession, rolls: {} }, {}, () => 0), [
    'Emotional Intelligence: Insight 50%', 'Knowledge: Law 50%', 'Knowledge: Politics 50%'
  ]);
  assert.equal(generator.generateProfession(30, sequence([0, 0.9999])).level, 40);
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
  const random = sequence([...Array(5).fill(0), ...Array(30).fill(0), 0, 0, 0, 0.99, 0.9, 0, 0, 0, 0], 0.5);
  const npc = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 25, traitCategories: [] }, random);
  assert.ok(npc.skills.includes('Combat: Weapon (Dagger) 30%'));
  assert.deepEqual(npc.attack, { name: 'Unarmed', damage: 0 });
  assert.deepEqual(npc.skillWeapons, [{ name: 'Dagger', damage: 2, skillPercent: 30 }]);
  assert.ok(generator.format(npc).includes('Attack: Unarmed (+0 damage)\nDagger (+2 damage, Weapon skill: 30%)'));
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
  assert.ok(generator.format(npc).includes('Attack: Unarmed (+0 damage, Brawl: 30%)'));
});

test('Weapon combat skills remain available through direct skill generation', () => {
  const skills = generator.generateSkills({ rolls: { combatSkills: 1 } }, {}, sequence([0.9, 0]));
  assert.deepEqual(skills, ['Combat: Weapon (Dagger) 30%']);
});

test('Magicians receive distinct monster-list spells; Lords show the pending martial skill', () => {
  const magician = generator.generate({ type: 'HUMAN', subtype: 'Magician', age: 25, traitCategories: [] }, () => 0.9999);
  assert.equal(magician.magicSkills.length, 2);
  assert.notEqual(magician.magicSkills[0], magician.magicSkills[1]);
  const lord = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 25, traitCategories: [] }, () => 0.9999);
  assert.ok(lord.magicSkills[0].includes('1 pending'));
  assert.ok(lord.skills.some(skill => skill.startsWith('Combat:')));
});

function undeadAtLevel(subtype, age, level, fallback = 0.9) {
  const type = types.types.find(value => value.type === 'UNDEAD');
  const entry = type.subtypes.find(value => value.subtype === subtype);
  let points = 0;
  for (let stage = entry; stage; stage = type.subtypes.find(value => value.subtype === stage.inherits)) points += stage.randomPoints ?? 0;
  return generator.generate({ type: 'UNDEAD', subtype, age, traitCategories: [] },
    sequence([...Array(points).fill(0), (level - 0.5) / entry.levelRange[1]], fallback));
}

test('Undead subtypes use specified age and uniform level ranges', () => {
  for (const [subtype, minAge, maxAge, maxLevel] of [
    ['Skeleton', 1, 100, 10], ['Walking Corpse', 1, 100, 10], ['Corpse Mage', 50, 200, 50],
    ['Lich', 100, 1000, 80], ['Fierce Corpse', 50, 300, 80], ['Skeleton Warrior', 5, 100, 10],
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
    ['Skeleton', 50, 0, 1], ['Walking Corpse', 50, 10, 3], ['Corpse Mage', 50, 25, 6],
    ['Lich', 100, 75, 12], ['Fierce Corpse', 50, 30, 7],
    ['Skeleton Warrior', 50, 10, 3], ['Archer Skeleton', 50, 25, 5], ['Shield Skeleton', 50, 15, 3]
  ]) {
    const npc = undeadAtLevel(subtype, age, 10);
    assert.equal(npc.level, 10, subtype);
    assert.equal(Object.values(npc.stats).reduce((sum, value) => sum + value, 0), 30 + points + 10 * perLevel, subtype);
  }
});

test('Skeleton traits and inherited fixed skills, removals and resistance effects', () => {
  const skeleton = generator.generate({ type: 'UNDEAD', subtype: 'Skeleton', age: 10 }, () => 0.5);
  assert.equal(skeleton.traitRolls.filter(item => item.category === 'temperament').length, 2);
  assert.notEqual(skeleton.traitRolls[0].effect.name, skeleton.traitRolls[1].effect.name);
  const base = undeadAtLevel('Skeleton', 10, 1);
  assert.ok(base.skills.some(skill => skill.startsWith('Slow:')));
  assert.ok(base.skills.some(skill => skill.startsWith('Undead:')));
  assert.deepEqual(generator.visibleResistances(base.resistancesAndVulnerabilities), ['Magical Resistance: 100%', 'Damage Vulnerability']);
  const corpse = undeadAtLevel('Walking Corpse', 10, 1);
  assert.ok(corpse.skills.some(skill => skill.startsWith('Undead:')));
  assert.ok(!corpse.skills.some(skill => /^(Slow|Bony|Fragile):/.test(skill)));
  assert.deepEqual(generator.visibleResistances(corpse.resistancesAndVulnerabilities), []);
  const warrior = undeadAtLevel('Skeleton Warrior', 10, 1);
  assert.ok(warrior.skills.some(skill => skill.startsWith('Bony:')));
  assert.ok(!warrior.skills.some(skill => skill.startsWith('Fragile:')));
  assert.ok(warrior.skills.some(skill => /^Combat:.*50%/.test(skill)));
});

test('Archer retains warrior skills and adds longbow, arrow skills and Fragile', () => {
  const npc = undeadAtLevel('Archer Skeleton', 20, 1);
  for (const name of ['Slow', 'Bony', 'Undead', 'Fragile', 'Sniper', 'Frost arrow', 'Poison arrow', 'Sleep arrow']) {
    assert.ok(npc.skills.some(skill => skill.startsWith(`${name}:`)), name);
  }
  assert.ok(npc.skills.includes('Combat: Weapon (Longbow) 60%'));
  assert.ok(generator.format(npc).includes('Longbow (+4 damage, Weapon skill: 60%)'));
  assert.ok(generator.visibleResistances(npc.resistancesAndVulnerabilities).includes('Damage Vulnerability'));
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
  assert.equal(healer.skills.filter(skill => skill.endsWith('30%')).length, 2);
  assert.equal(healer.includeMagic, true);
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
  assert.deepEqual(listed.HUMAN.subtypes, ['Child', 'Adult', 'Lord', 'Magician']);
  assert.equal(listed.HUMAN.defaultSubtype, 'Adult');
  assert.deepEqual(listed.UNDEAD.subtypes, ['Skeleton', 'Walking Corpse', 'Corpse Mage', 'Lich', 'Fierce Corpse', 'Skeleton Warrior', 'Archer Skeleton', 'Shield Skeleton', 'Healer Skeleton']);
  assert.equal(listed.UNDEAD.defaultSubtype, 'Skeleton');
});

test('magic type titles come from the supplied table and are distinct', () => {
  const selection = { rolls: { magicTypeTitles: 7 } };
  assert.deepEqual(generator.generateTitles(selection, {}, () => 0), ['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity']);
  assert.deepEqual(generator.generateTitles({ rolls: { titles: 1 } }, {}, () => 0), ['Make a new title']);
  assert.deepEqual(generator.generateTitles({}, {}, () => 0), []);
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

test('generic title rolls split at 50% and use the supplied title descriptions', () => {
  const selection = { rolls: { titles: 1 } };
  assert.deepEqual(generator.generateTitles(selection, {}, () => 0.4999), ['Make a new title']);
  assert.deepEqual(generator.generateTitles(selection, {}, sequence([0.5, 0])), ['Risk Taker: Gain +1% per level when doing something risky.']);
  for (let index = 0; index < rolls.titles.entries.length; index++) {
    const output = generator.generateTitles(selection, {}, sequence([0.5, (index + 0.5) / rolls.titles.entries.length]));
    assert.ok(output[0].startsWith(`${rolls.titles.entries[index].name}: `));
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
    assert.ok(generator.format(npc).includes('Temperament: Heartfelt:'));
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

test('immediate title effects alter stats and magic without requiring a title level', () => {
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
    assert.equal(protector.includeMagic, true);
    assert.equal(protector.stats.MAG, 15);
    const magical = generator.generate({ type: 'DRAGON', age: 25, includeMagic: true }, () => 0);
    assert.equal(magical.stats.MAG, 30);
    generator.generateTitles = () => title('Lover Boy');
    const romanticIndex = rolls.temperaments.findIndex(item => item.name === 'Romantic');
    const romantic = generator.generate({ type: 'DRAGON', age: 25, traitCategories: ['temperament'] }, sequence([(romanticIndex + 0.5) / rolls.temperaments.length], 0));
    assert.deepEqual(romantic.titles, title('Lover Boy'));
  } finally {
    generator.generateStats = originalStats;
    generator.generateTitles = originalTitles;
  }
});