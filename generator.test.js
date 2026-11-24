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

test('the eight supplied type weights total 100 and preserve fractional probabilities', () => {
  const expected = { HUMAN: 60, ELEMENTAL: 6, OMNISCIENT: 0.5, DRAGON: 5.5, VAMPIRE: 6, SLIME: 6, MERMAID: 6, UNDEAD: 10 };
  assert.deepEqual(Object.fromEntries(types.types.map(value => [value.type, value.weight])), expected);
  assert.equal(types.types.reduce((total, value) => total + value.weight, 0), 100);
  const counts = Object.fromEntries(types.types.map(value => [value.type, 0]));
  for (let index = 0; index < 1000; index++) counts[generator.selectType(() => (index + 0.5) / 1000)]++;
  for (const [type, weight] of Object.entries(expected)) assert.equal(counts[type], weight * 10);
});

test('non-Human types without subtypes output only a type and use shared rules', () => {
  for (const type of types.types.filter(value => !value.subtypes)) {
    const npc = generator.generate({ type: type.type, age: 25 }, () => 0.5);
    assert.equal(npc.type, type.type);
    assert.equal(npc.subtype, '');
    assert.equal(npc.level, undefined);
    assert.deepEqual(npc.traits, []);
    assert.ok(generator.formatType(npc).startsWith(`${type.type} | Age: 25`));
    assert.ok(Object.values(npc.stats).every(Number.isFinite));
  }
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

test('Adult rolls education and height exactly once and applies their modifiers once', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const npc = generator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 }, sequence([...Array(7).fill(0), 0.9999, 0.9999]));
    assert.deepEqual(npc.traitRolls.map(result => [result.category, result.roll]), [['education', 1], ['height', 1]]);
    assert.equal(npc.level, 1);
    assert.deepEqual(npc.stats, { STR: 25, CON: 30, CHA: 30, INT: 27, AGI: 37, MAG: 30 });
    assert.deepEqual(npc.skills, ['street smarts lvl 5']);
  } finally { generator.generateStats = original; }
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

test('Adult always displays exactly one height for all 14 rolls at ages 25 and 70', () => {
  for (const age of [25, 70]) {
    for (let value = 1; value <= 14; value++) {
      const npc = generator.generate({ type: 'HUMAN', subtype: 'Adult', age }, () => (value - 0.5) / 14);
      const expected = `Height: ${value <= 2 ? 'Very short' : value >= 12 ? 'Very tall' : 'Average'}`;
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
  assert.deepEqual(uneducated.skills, ['street smarts lvl 5']);
  assert.equal(generator.rollTrait('education', stats, () => 0.5).output, null);
  assert.equal(generator.rollTrait('education', stats, () => 0.9999).output, 'Educated');
  assert.equal(stats.INT, 35);
});

test('traits are opt-in and education skills reach the final output', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const npc = generator.generate({ age: 25, traitCategories: ['education'] }, () => 0);
    assert.deepEqual(npc.traits, ['Education: Uneducated']);
    assert.deepEqual(npc.skills, ['street smarts lvl 5']);
    assert.equal(npc.stats.INT, 25);
    assert.ok(!generator.format(generator.generate({ type: 'ELEMENTAL', age: 25 })).includes('Traits:'));
  } finally { generator.generateStats = original; }
});

test('Human ages 16 and 17 select Child versus weighted adult subtypes', () => {
  assert.equal(generator.generate({ type: 'HUMAN', age: 16 }, () => 0.5).subtype, 'Child');
  assert.equal(generator.generate({ type: 'HUMAN', age: 17 }, () => 0.5).subtype, 'Adult');
  assert.equal(generator.generate({ type: 'HUMAN', age: 25 }, () => 0.91).subtype, 'Lord');
  assert.equal(generator.generate({ type: 'HUMAN', age: 25 }, () => 0.96).subtype, 'Magician');
});

test('Human level bonuses and magician stat changes apply once per rolled level', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const lord = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 25 }, () => 0);
    assert.equal(lord.level, 1);
    assert.equal(lord.stats.STR, 33);
    assert.equal(lord.stats.CON, 33);
    assert.equal(lord.includeMagic, true);
    const magician = generator.generate({ type: 'HUMAN', subtype: 'Magician', age: 25 }, () => 0);
    assert.deepEqual(magician.stats, { STR: 21, CON: 25, CHA: 30, INT: 41, AGI: 25, MAG: 33 });
    const child = generator.generate({ type: 'HUMAN', age: 16 }, () => 0.5);
    assert.equal(child.includeMagic, false);
    assert.equal(child.stats.MAG, 30);
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
    const npc = generator.generate({ type: 'HUMAN', subtype, age: 25, includeMagic: true }, () => 0.5);
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

test('Magician age bonus starts at level 31, is inclusive, and can exceed 70', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const options = { type: 'HUMAN', subtype: 'Magician', age: 70 };
    const level30 = generator.generate(options, sequence([...Array(4).fill(0.5), 0.7, 0.9999, ...Array(30).fill(0.5), 0.9999]));
    assert.equal(level30.level, 30);
    assert.equal(level30.age, 70);
    const minimum = generator.generate(options, sequence([...Array(4).fill(0.5), 0.9, 0, ...Array(31).fill(0.5), 0]));
    assert.equal(minimum.level, 31);
    assert.equal(minimum.age, 71);
    const maximum = generator.generate(options, sequence([...Array(4).fill(0.5), 0.9, 0, ...Array(31).fill(0.5), 0.9999]));
    assert.equal(maximum.level, 31);
    assert.equal(maximum.age, 170);
    assert.deepEqual(maximum.stats, minimum.stats);
    assert.ok(generator.format(maximum).includes('Age: 170'));
    const lord = generator.generate({ type: 'HUMAN', subtype: 'Lord', age: 70 }, () => 0.9999);
    assert.equal(lord.age, 70);
  } finally { generator.generateStats = original; }
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
  assert.deepEqual(listed.ELEMENTAL.subtypes, ['Sprite', 'Fairy', 'Elemental', 'Genasi']);
  assert.equal(listed.ELEMENTAL.defaultSubtype, 'Sprite');
  assert.deepEqual(listed.DRAGON.subtypes, []);
  assert.equal(listed.DRAGON.defaultSubtype, undefined);
});

test('Elemental subtypes are never selected at random and must be chosen explicitly', () => {
  const random = generator.generate({ type: 'ELEMENTAL', age: 25 }, () => 0.5);
  assert.equal(random.subtype, '');
  assert.equal(random.level, undefined);
  for (const subtype of ['Sprite', 'Fairy', 'Elemental', 'Genasi']) {
    const npc = generator.generate({ type: 'ELEMENTAL', subtype, age: 25, includeMagic: false }, () => 0.5);
    assert.equal(npc.subtype, subtype);
    assert.equal(npc.includeMagic, true);
    assert.deepEqual(npc.traits, []);
    assert.deepEqual(npc.skills, []);
    assert.ok(generator.formatType(npc).startsWith(`ELEMENTAL (${subtype}) | Age: 25 | Level: `));
  }
});

test('Elemental subtype level ranges, bonuses, and title rolls match the configured rules', () => {
  const original = generator.generateStats;
  try {
    generator.generateStats = () => Object.fromEntries(generator.statKeys.map(key => [key, 30]));
    const options = subtype => ({ type: 'ELEMENTAL', subtype, age: 25 });
    const maxLevel = () => sequence([0.9999, 0.9999], 0);
    const sprite = generator.generate(options('Sprite'), () => 0);
    assert.equal(sprite.level, 1);
    assert.deepEqual(sprite.stats, { STR: 31, CON: 31, CHA: 31, INT: 30, AGI: 30, MAG: 30 });
    assert.deepEqual(sprite.titles, []);
    assert.equal(generator.generate(options('Sprite'), maxLevel()).level, 5);
    const fairy = generator.generate(options('Fairy'), () => 0);
    assert.equal(fairy.level, 1);
    assert.deepEqual(fairy.stats, { STR: 31, CON: 31, CHA: 30, INT: 30, AGI: 30, MAG: 32 });
    assert.deepEqual(fairy.titles, ['Light']);
    assert.equal(generator.generate(options('Fairy'), maxLevel()).level, 80);
    const elemental = generator.generate(options('Elemental'), () => 0);
    assert.equal(elemental.level, 1);
    assert.deepEqual(elemental.stats, { STR: 31, CON: 31, CHA: 30, INT: 30, AGI: 30, MAG: 31 });
    assert.deepEqual(elemental.titles, ['Light']);
    assert.equal(generator.generate(options('Elemental'), maxLevel()).level, 25);
    const genasi = generator.generate(options('Genasi'), () => 0);
    assert.equal(genasi.level, 1);
    assert.deepEqual(genasi.stats, { STR: 33, CON: 33, CHA: 33, INT: 30, AGI: 30, MAG: 30 });
    assert.deepEqual(genasi.titles, ['Light']);
    assert.equal(generator.generate(options('Genasi'), maxLevel()).level, 20);
    const levelled = generator.generate(options('Elemental'), sequence([0.9999, 0.9999], 0.9999));
    assert.equal(levelled.level, 25);
    assert.deepEqual(levelled.stats, { STR: 55, CON: 55, CHA: 30, INT: 30, AGI: 30, MAG: 55 });
    assert.deepEqual(levelled.titles, ['Electricity']);
  } finally { generator.generateStats = original; }
});

test('magic type titles come from the supplied table and are distinct', () => {
  const selection = { rolls: { magicTypeTitles: 7 } };
  assert.deepEqual(generator.generateTitles(selection, {}, () => 0), ['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity']);
  assert.deepEqual(generator.generateTitles({ rolls: { titles: 1 } }, {}, () => 0), []);
  assert.deepEqual(generator.generateTitles({}, {}, () => 0), []);
});