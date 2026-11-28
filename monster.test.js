const test = require('node:test');
const assert = require('node:assert/strict');
const monster = require('./monster.js');
const data = require('./data/monsters.json');

function sequence(values, fallback = 0) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

// Rolls that land on named table entries: weighted category first, then index within the remaining list.
const BOSS = 0;
const ANIMAL = 0.3;
const TRAIT = 0.7;
const MAGICAL = 0.9;
const pick = (index, size) => (index + 0.5) / size;
const LEVEL_23 = pick(8, 11);
const cannibalistic = [TRAIT, pick(4, data.trait.length)];

test('monster data lists match the supplied tables', () => {
  assert.deepEqual(data.levels, [5, 10, 20, 30, 40, 50, 60, 70, 80]);
  assert.equal(data.boss.length, 13);
  assert.equal(data.animal.length, 36);
  assert.equal(data.trait.length, 71);
  assert.deepEqual(Object.fromEntries(Object.entries(data.magic).map(([school, skills]) => [school, skills.length])), {
    Light: 8, Darkness: 8, Fire: 10, Water: 12, Earth: 11, Wind: 10, Electricity: 10,
    Blood: 11, Martial: 11, Omniscient: 5, Ascendant: 2
  });
  assert.equal(monster.magicSkillList().length, 69);
  assert.ok(monster.magicSkillList().every(skill => ['Light', 'Darkness', 'Fire', 'Water', 'Earth', 'Wind', 'Electricity'].includes(skill.school)));
  const counts = { Boss: 0, Animal: 0, Trait: 0, Magical: 0 };
  for (let index = 0; index < 700; index++) counts[monster.rollExtras(sequence([(index + 0.5) / 700, 0], 0.999))[0].category]++;
  assert.deepEqual(counts, { Boss: 100, Animal: 300, Trait: 200, Magical: 100 });
});

test('level varies by five around the chosen area with a floor of 1', () => {
  assert.equal(monster.rollLevel(5, () => 0), 1);
  assert.equal(monster.rollLevel(5, () => 0.9999), 10);
  assert.equal(monster.rollLevel(20, () => 0.5), 20);
  assert.equal(monster.rollLevel(80, () => 0.9999), 85);
  assert.equal(monster.generate({}, () => 0).area, 5);
});

test('stats are LEVEL + 1d4 x LEVEL and substats are floored fifths with Accuracy from INT and AGI', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, 0, 0.25, 0.5, 0.75, 0.999, 0, ANIMAL, pick(7, 36), ...cannibalistic]));
  assert.equal(result.level, 23);
  assert.deepEqual(result.stats, { STR: 46, CON: 69, AGI: 92, INT: 115, CHA: 115, MAG: 46 });
  assert.deepEqual(result.substats, { Attack: 9, Defense: 13, HP: 13, Dodge: 18, Accuracy: 41, Resist: 23, Power: 9, Mana: 9 });
  assert.deepEqual(result.extras, [{ category: 'Animal', name: 'Frog' }, { category: 'Trait', name: 'Cannibalistic' }]);
  assert.deepEqual(result.skills, []);
  assert.equal(result.magical, false);
  assert.equal(monster.showsMagic(result), false);
  const text = monster.format(result);
  assert.ok(text.startsWith('MONSTER | Level: 23 (Level 20 area)\nSTR: 46 | Attack: 9\nCON: 69 | Defense: 13\nResist: 23\nINT: 115 | Accuracy: 41\nAGI: 92 | Dodge: 18\n'));
  assert.ok(text.includes('MAG: 46 (Not Applicable) | Power: 9 (Not Applicable)\nHit Points Max: 13\nMana Max: 9 (Not Applicable)\nEXP 87\n'));
  assert.ok(text.includes('Extras: Animal: Frog, Trait: Cannibalistic'));
  assert.ok(!text.includes('Magic Skills:'));
  const sheet = monster.sheet(result);
  assert.deepEqual(sheet.stats.map(entry => entry.label), ['STR', 'CON', '', 'INT', 'AGI', 'MAG']);
  assert.deepEqual(sheet.combat.map(entry => entry.label), ['Attack', 'Defense', 'Resist', 'Accuracy', 'Dodge', 'Power']);
  assert.deepEqual(sheet.side.map(entry => [entry.label, entry.prefix, entry.value]), [['Hit Points', 'Max: ', '13'], ['Mana', 'Max: ', '9 (Not Applicable)'], ['EXP', '', '87']]);
  assert.deepEqual([...sheet.stats, ...sheet.combat, ...sheet.side].filter(entry => entry.muted).map(entry => entry.key), ['MAG', 'Power', 'Mana']);
  assert.equal(monster.statTotal(result), 87);
});

test('only explicit magic-enabling extras make monsters magical', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, pick(7, 36), ...cannibalistic]));
  assert.equal(monster.statTotal(result), 46);
  result.includeMagic = true;
  assert.equal(monster.showsMagic(result), false);
  for (const index of [2, 6, 7, 9]) {
    const magical = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(index, 13), ...cannibalistic]));
    assert.equal(magical.magical, true, magical.extras[0].name);
    assert.ok(monster.formatHeading(magical).endsWith(' | MAGICAL'));
    assert.ok([...monster.sheet(magical).stats, ...monster.sheet(magical).combat, ...monster.sheet(magical).side].every(entry => !entry.muted));
    const expected = Object.values(magical.stats).reduce((sum, value) => sum + value, 0);
    assert.equal(monster.statTotal(magical), Math.floor(expected / 5));
  }
  const extra = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), MAGICAL, ...cannibalistic]));
  assert.equal(extra.magical, true);
  assert.equal(extra.magicSkills.length, 1);
  const lair = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(4, 13), ...cannibalistic]));
  assert.equal(lair.magical, false);
  assert.equal(lair.substats.Mana, 9 + 23 * 5);
  assert.equal(monster.sheet(lair).side.find(entry => entry.key === 'Mana').muted, true);
  const shedsAndMagical = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(5, 13), MAGICAL]));
  assert.equal(shedsAndMagical.magical, true);
  assert.equal(monster.statTotal(shedsAndMagical), 83);
});

test('boss substat bonuses apply after derivation without implicitly enabling magic', () => {
  const immortal = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(0, 13), ...cannibalistic]));
  assert.equal(immortal.magical, false);
  assert.equal(immortal.substats.Defense, 9);
  assert.equal(immortal.substats.HP, 9 + 23 * 5);
  assert.deepEqual(immortal.traits.map(trait => trait.name), ['Revive']);
  const sheds = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(5, 13), ...cannibalistic]));
  assert.equal(sheds.magical, false);
  assert.deepEqual(sheds.stats, { STR: 1, CON: 1, AGI: 46, INT: 46, CHA: 46, MAG: 276 });
  assert.equal(sheds.substats.Power, 55);
  const text = monster.format(sheds);
  assert.ok(text.startsWith('MONSTER | Level: 23 (Level 20 area)\n'));
  assert.ok(text.includes('MAG: 276 (Not Applicable) | Power: 55 (Not Applicable)\nHit Points Max: 1\nMana Max: 55 (Not Applicable)\nEXP 28\n'));
});

test('Spellcaster plus the Magical extra grant three distinct magic skills', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(9, 13), MAGICAL]));
  assert.deepEqual(result.extras, [{ category: 'Boss', name: 'Spellcaster' }, { category: 'Magical', name: 'Magical' }]);
  assert.equal(result.magical, true);
  assert.deepEqual(result.magicSkills.map(skill => `${skill.name} (${skill.school})`), ['Heal (Light)', 'Light mote (Light)', 'Purify (Light)']);
  assert.ok(result.magicSkills.every(skill => {
    const cost = Number(skill.description.match(/\bCosts?\s+(\d+)\s+Mana\b/i)?.[1] ?? 0);
    return cost <= result.substats.Mana;
  }));
  assert.ok(monster.format(result).includes('Extras: Boss: Spellcaster, Magical'));
  assert.ok(monster.format(result).includes('Magic Skills: Heal (Light) +20%: Heal an amount of HP'));
});

test('Weaponmaster rolls a character weapon and adds LEVEL x 2 to STR', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(8, 13), ...cannibalistic, 0.3, 0]));
  assert.equal(result.stats.STR, 46 + 46);
  assert.equal(result.substats.Attack, 18);
  assert.deepEqual(result.attack, { name: 'Dagger', damage: 2 });
  assert.ok(monster.format(result).includes('Attack: Dagger (+2 damage)'));
});

test('two animal extras are distinct and apply their modifiers and skills', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, 0, ANIMAL, 0]));
  assert.deepEqual(result.extras.map(extra => extra.name), ['Bird', 'Bear']);
  assert.deepEqual(result.skills.map(skill => skill.name), ['Flying']);
  assert.equal(result.stats.CON, 69);
  assert.equal(result.stats.STR, 69);
});

test('trait minimums raise INT to 50 and reductions never drop a stat below 1', () => {
  const smart = monster.generate({ level: 5 }, sequence([0, ...Array(6).fill(0), TRAIT, pick(0, 71), TRAIT, pick(8, 70)]));
  assert.equal(smart.level, 1);
  assert.deepEqual(smart.extras.map(extra => extra.name), ['Human intelligence', 'Loud']);
  assert.deepEqual(smart.stats, { STR: 2, CON: 2, AGI: 2, INT: 50, CHA: 2, MAG: 2 });
  assert.equal(smart.substats.Accuracy, 10);
  const useless = monster.generate({ level: 5 }, sequence([0, ...Array(6).fill(0), TRAIT, pick(13, 71), TRAIT, pick(4, 70)]));
  assert.deepEqual(useless.extras.map(extra => extra.name), ['Useless', 'Cannibalistic']);
  assert.deepEqual(useless.stats, { STR: 1, CON: 1, AGI: 1, INT: 1, CHA: 1, MAG: 1 });
});

test('Parasite trait grants the updated Parasite ability and retains its stat penalty', () => {
  const index = data.trait.findIndex(trait => trait.name === 'Parasite');
  const result = monster.generate({ level: 20 }, sequence([
    LEVEL_23, ...Array(6).fill(0), TRAIT, pick(index, data.trait.length), ANIMAL, pick(7, data.animal.length)
  ]));
  const ability = data.reservedSkills.find(skill => skill.name === 'Parasite');
  assert.deepEqual(result.skills, [{ ...ability, value: 0 }]);
  assert.ok(Object.values(result.stats).every(value => value === 1));
  assert.ok(monster.format(result).includes(`Parasite +0%: ${ability.description}`));
});

test('explicit monster extras grant reserved traits and skills in separate sections', () => {
  const hypnotic = data.trait.findIndex(trait => trait.name === 'Hypnotic');
  const result = monster.generate({ level: 20 }, sequence([
    LEVEL_23, ...Array(6).fill(0), BOSS, pick(0, data.boss.length), TRAIT, pick(hypnotic, data.trait.length)
  ]));
  assert.deepEqual(result.traits, [data.reservedTraits.find(trait => trait.name === 'Revive')]);
  assert.deepEqual(result.skills, [{ ...data.reservedSkills.find(skill => skill.name === 'Hypnosis'), value: 0 }]);
  assert.ok(monster.sections(result).some(section => section.label === 'Traits:' && section.text.startsWith('Revive:')));
  assert.ok(monster.sections(result).some(section => section.label === 'Skills:' && section.text.startsWith('Hypnosis +0%:')));
});

test('Gelatinous grants Swallow as a trait without a skill percentage', () => {
  const gelatinous = data.trait.findIndex(trait => trait.name === 'Gelatinous');
  const result = monster.generate({ level: 20 }, sequence([
    LEVEL_23, ...Array(6).fill(0), TRAIT, pick(gelatinous, data.trait.length), ANIMAL, pick(7, data.animal.length)
  ]));
  const swallow = data.reservedTraits.find(trait => trait.name === 'Swallow');
  assert.deepEqual(result.traits, [swallow]);
  assert.ok(!result.skills.some(skill => skill.name === 'Swallow'));
  assert.ok(monster.sections(result).some(section => section.label === 'Traits:' && section.text === `Swallow: ${swallow.description}`));
});

test('only the specified extras show CHA, but CHA always contributes to EXP', () => {
  const eligible = [
    [BOSS, 3, 13], [BOSS, 10, 13],
    [ANIMAL, 3, 36], [ANIMAL, 17, 36], [ANIMAL, 27, 36],
    [TRAIT, 0, 71]
  ];
  for (const [category, index, size] of eligible) {
    const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), category, pick(index, size), ...cannibalistic]));
    assert.equal(result.showCharm, true, result.extras[0].name);
    assert.ok(monster.format(result).includes(`CHA: ${result.stats.CHA}`));
    const expected = Object.entries(result.stats).filter(([key]) => key !== 'MAG' || result.magical).reduce((sum, [, value]) => sum + value, 0);
    assert.equal(monster.statTotal(result), Math.floor(expected / 5));
  }
  const ordinary = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, 0, ...cannibalistic]));
  assert.equal(ordinary.showCharm, false);
  assert.ok(!monster.format(ordinary).includes('CHA:'));
});

test('EXP sums the specified stats, includes MAG only when magical, and rounds down', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, pick(3, 36), ...cannibalistic]));
  result.stats = { STR: 4, CON: 4, INT: 4, AGI: 4, MAG: 9, CHA: 999 };
  assert.equal(monster.statTotal(result), 203);
  result.showCharm = false;
  assert.equal(monster.statTotal(result), 203);
  result.magical = true;
  assert.equal(monster.statTotal(result), 204);
  assert.equal(monster.sheet(result).side.find(entry => entry.label === 'EXP').value, '204');
});

test('monster hit points have a minimum of one after modifiers', () => {
  const low = monster.generate({ level: 5 }, sequence([0, ...Array(6).fill(0), ANIMAL, pick(7, 36), ...cannibalistic]));
  assert.equal(low.stats.CON, 2);
  assert.equal(low.substats.HP, 1);
  assert.equal(low.substats.Defense, 0);
  assert.equal(monster.sheet(low).side.find(entry => entry.label === 'Hit Points').value, '1');
  const immortal = monster.generate({ level: 5 }, sequence([0, ...Array(6).fill(0), BOSS, pick(0, 13), ...cannibalistic]));
  assert.equal(immortal.substats.HP, 5);
});

test('ordinary monsters roll each natural attack and hide zero resistance defaults', () => {
  const attacks = [
    { name: 'Claws', damage: 2 }, { name: 'Bite', damage: 2 }, { name: 'Impale', damage: 2 },
    { name: 'Smash', damage: 4 }, { name: 'Slam', damage: 4 }
  ];
  for (const [index, attack] of attacks.entries()) {
    const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, pick(7, 36), ...cannibalistic, pick(index, attacks.length)]));
    assert.deepEqual(result.attack, attack);
    assert.equal(result.resistancesAndVulnerabilities.length, 12);
    assert.ok(!monster.format(result).includes('Resistances & Vulnerabilities:'));
    assert.ok(!monster.sections(result).some(section => section.label === 'Resistances & Vulnerabilities:'));
    assert.ok(monster.format(result).includes(`Attack: ${attack.name} (+${attack.damage} damage)`));
  }
});

test('monster output shows nonzero resistances and vulnerabilities only', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, pick(7, 36), ...cannibalistic]));
  result.resistancesAndVulnerabilities[0] = 'Damage Resistance: 25%';
  result.resistancesAndVulnerabilities[1] = 'Limb Damage Resistance: -10%';
  const section = monster.sections(result).find(value => value.label === 'Resistances & Vulnerabilities:');
  assert.equal(section.text, 'Damage Resistance: 25%\nLimb Damage Resistance: -10%');
  assert.ok(monster.format(result).includes(section.text));
});

test('Weaponmasters can be unarmed and retain weapon properties', () => {
  const prefix = [LEVEL_23, ...Array(6).fill(0), BOSS, pick(8, 13), ...cannibalistic];
  const unarmed = monster.generate({ level: 20 }, sequence([...prefix, 0.2999]));
  assert.equal(unarmed.attack.name, 'Unarmed');
  const grenade = monster.generate({ level: 20 }, sequence([...prefix, 0.3, 0.9999]));
  assert.deepEqual(grenade.attack, { name: 'Molotov cocktail', damage: 4, radius: 50 });
  assert.ok(monster.format(grenade).includes('Attack: Molotov cocktail (+4 damage, 50 ft radius)'));
});
