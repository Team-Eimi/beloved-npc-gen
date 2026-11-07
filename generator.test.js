const test = require('node:test');
const assert = require('node:assert/strict');
const { generate, format, roles } = require('./generator.js');

test('generates complete characters in each setting', () => {
  for (const setting of Object.keys(roles)) {
    const npc = generate({ setting });
    assert.equal(npc.setting, setting);
    assert.ok(roles[setting].includes(npc.role));
    for (const field of ['id', 'name', 'trait', 'want', 'secret', 'hook', 'voice']) assert.ok(npc[field]);
  }
});

test('preserves a locked name and selected role', () => {
  const npc = generate({ name: 'Mira Vale', role: 'Archivist', disposition: 'guarded' });
  assert.equal(npc.name, 'Mira Vale');
  assert.equal(npc.role, 'Archivist');
  assert.equal(npc.disposition, 'guarded');
});

test('disposition changes the character voice', () => {
  const warm = generate({ disposition: 'warm' }, () => 0);
  const guarded = generate({ disposition: 'guarded' }, () => 0);
  const eccentric = generate({ disposition: 'eccentric' }, () => 0);
  assert.notEqual(warm.voice, guarded.voice);
  assert.notEqual(guarded.voice, eccentric.voice);
});

test('invalid settings fall back safely and export includes character details', () => {
  const npc = generate({ setting: '__proto__', disposition: 'invalid' }, () => 0);
  assert.equal(npc.setting, 'fantasy');
  assert.equal(npc.disposition, 'warm');
  assert.ok(format(npc).includes(npc.name));
  assert.ok(format(npc).includes(npc.secret));
});