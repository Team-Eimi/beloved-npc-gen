(function (root) {
  const names = ['Mira Vale', 'Rowan Finch', 'Ada Thorne', 'Emrys Bell', 'Nell Ashford', 'Jules Wren', 'Iona Reed', 'Felix Moss', 'Cleo Hart', 'Theo Briar'];
  const roles = {
    fantasy: ['Apothecary', 'Innkeeper', 'Cartographer', 'Traveling bard', 'Archivist', 'Blacksmith'],
    modern: ['Florist', 'Librarian', 'Cafe owner', 'Paramedic', 'Journalist', 'Mechanic'],
    scifi: ['Station medic', 'Salvage pilot', 'Botanist', 'Ship engineer', 'Signal analyst', 'Courier']
  };
  const traits = ['Remembers every name, but never a face.', 'Collects little things other people leave behind.', 'Makes tea before answering difficult questions.', 'Laughs quietly at their own terrible jokes.', 'Always offers the last piece of bread.', 'Talks to their plants as though they might reply.'];
  const wants = ['Find the friend who vanished without saying goodbye.', 'Keep their little corner of the world from changing.', 'Finish a promise made a very long time ago.', 'Earn enough to bring their family back together.', 'Be remembered for something kind.', 'See the ocean for the first time.'];
  const secrets = ['They have been writing letters under someone else\'s name.', 'They quietly support a rival they claim to dislike.', 'The treasured heirloom they carry is a convincing fake.', 'They know a hidden route out of town.', 'They were once famous, under a different name.', 'They have already met the party, but do not admit it.'];
  const hooks = ['A familiar face arrives with an unfamiliar story.', 'A small delivery turns out to matter to someone powerful.', 'An unopened letter has been waiting for years.', 'Something precious has disappeared, and asking for help is hard.', 'A celebration needs one last, impossible ingredient.', 'An old debt is called in at the worst possible time.'];
  const voices = {
    warm: ['Soft-spoken, with a smile that arrives a moment late.', 'A steady voice that makes a room feel a little safer.'],
    guarded: ['Careful words, watchful eyes, and long, thoughtful pauses.', 'A dry wit; every answer reveals a little less than it should.'],
    eccentric: ['Enthusiastic tangents, punctuated by sincere apologies.', 'Quick and bright; every sentence feels like a shared secret.']
  };
  function generate(options = {}, random = Math.random) {
    const setting = Object.hasOwn(roles, options.setting) ? options.setting : 'fantasy';
    const disposition = Object.hasOwn(voices, options.disposition) ? options.disposition : 'warm';
    const pick = values => values[Math.floor(random() * values.length)];
    return {
      id: `${Date.now()}-${Math.floor(random() * 1e9)}`,
      name: options.name || pick(names),
      setting,
      role: options.role || pick(roles[setting]),
      disposition,
      trait: pick(traits), want: pick(wants), secret: pick(secrets), hook: pick(hooks), voice: pick(voices[disposition])
    };
  }
  function format(npc) {
    return `${npc.name}\n${npc.role} | ${npc.setting} | ${npc.disposition}\n\nQuirk: ${npc.trait}\nDesire: ${npc.want}\nSecret: ${npc.secret}\nStory hook: ${npc.hook}\nVoice: ${npc.voice}`;
  }
  const api = { generate, format, roles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NPCGenerator = api;
})(globalThis);