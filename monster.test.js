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
    Light: 5, Darkness: 6, Fire: 4, Water: 6, Earth: 6, Wind: 6, Electricity: 5
  });
  assert.equal(monster.magicSkillList().length, 38);
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
  assert.equal(result.includeMagic, false);
  const text = monster.format(result);
  assert.ok(text.startsWith('MONSTER | Level: 23 (Level 20 area)\nSTR: 46 | Attack: 9\nCON: 69 | Defense: 13\nCHA: 115 | Resist: 23\nINT: 115 | Accuracy: 41\nAGI: 92 | Dodge: 18\n'));
  assert.ok(text.includes('MAG: 46 (Not Applicable) | Power: 9 (Not Applicable)\nHit Points Max: 13\nMana Max: 9 (Not Applicable)\nEXP 87\n'));
  assert.ok(text.includes('Extras: Animal: Frog, Trait: Cannibalistic'));
  assert.ok(!text.includes('Magic Skills:'));
  const sheet = monster.sheet(result);
  assert.deepEqual(sheet.stats.map(entry => entry.label), ['STR', 'CON', 'CHA', 'INT', 'AGI', 'MAG']);
  assert.deepEqual(sheet.combat.map(entry => entry.label), ['Attack', 'Defense', 'Resist', 'Accuracy', 'Dodge', 'Power']);
  assert.deepEqual(sheet.side.map(entry => [entry.label, entry.prefix, entry.value]), [['Hit Points', 'Max: ', '13'], ['Mana', 'Max: ', '9 (Not Applicable)'], ['EXP', '', '87']]);
  assert.deepEqual([...sheet.stats, ...sheet.combat, ...sheet.side].filter(entry => entry.muted).map(entry => entry.label), ['MAG', 'Power', 'Mana']);
  assert.equal(monster.statTotal(result), 87);
});

test('the Magic checkbox override shows magic numbers without Not Applicable and adds MAG to EXP', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), ANIMAL, pick(7, 36), ...cannibalistic]));
  assert.equal(monster.statTotal(result), 46);
  result.includeMagic = true;
  const text = monster.format(result);
  assert.ok(text.startsWith('MONSTER | Level: 23 (Level 20 area) | MAGICAL'));
  assert.ok(text.includes('MAG: 46 | Power: 9\nHit Points Max: 9\nMana Max: 9\nEXP 55\n'));
  assert.ok(!text.includes('Not Applicable'));
  const sheet = monster.sheet(result);
  assert.ok([...sheet.stats, ...sheet.combat, ...sheet.side].every(entry => !entry.muted));
  assert.equal(result.magical, false);
});

test('boss substat bonuses apply after derivation and magic bosses enable MAG', () => {
  const immortal = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(0, 13), ...cannibalistic]));
  assert.equal(immortal.substats.Defense, 9);
  assert.equal(immortal.substats.HP, 9 + 23 * 5);
  assert.deepEqual(immortal.skills.map(skill => skill.name), ['Revive']);
  const sheds = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(5, 13), ...cannibalistic]));
  assert.equal(sheds.magical, true);
  assert.deepEqual(sheds.stats, { STR: 1, CON: 1, AGI: 46, INT: 46, CHA: 46, MAG: 276 });
  assert.equal(sheds.substats.Power, 55);
  const text = monster.format(sheds);
  assert.ok(text.startsWith('MONSTER | Level: 23 (Level 20 area) | MAGICAL'));
  assert.ok(text.includes('MAG: 276 | Power: 55\nHit Points Max: 0\nMana Max: 55\nEXP 83\n'));
  assert.ok(!text.includes('Not Applicable'));
});

test('Spellcaster plus the Magical extra grant three distinct magic skills', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(9, 13), MAGICAL]));
  assert.deepEqual(result.extras, [{ category: 'Boss', name: 'Spellcaster' }, { category: 'Magical', name: 'Magical' }]);
  assert.equal(result.magical, true);
  assert.deepEqual(result.magicSkills.map(skill => `${skill.name} (${skill.school})`), ['Heal (Light)', 'Light mote (Light)', 'Seal (Light)']);
  assert.ok(monster.format(result).includes('Extras: Boss: Spellcaster, Magical'));
  assert.ok(monster.format(result).includes('Magic Skills: Heal (Light): Heal an amount of HP'));
});

test('Weaponmaster rolls a weapon and adds LEVEL x 2 to STR', () => {
  const result = monster.generate({ level: 20 }, sequence([LEVEL_23, ...Array(6).fill(0), BOSS, pick(8, 13), ...cannibalistic, 0.5]));
  assert.equal(result.stats.STR, 46 + 46);
  assert.equal(result.substats.Attack, 18);
  assert.deepEqual(result.choices, [{ label: 'Weapon', value: 'Sword' }]);
  assert.ok(monster.format(result).includes('Weapon: Sword'));
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
