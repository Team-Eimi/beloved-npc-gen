# Beloved NPC Gen

## Preview

For a local preview, install Node.js 22.12 or later and run:

```sh
npm install
npm run dev
```

Open the localhost URL printed in the terminal, normally http://127.0.0.1:5173/. If that port is occupied, Vite chooses the next available port. The preview updates when you edit the files. Press Ctrl+C in the terminal to stop the server.

The deployed site is still plain HTML, CSS, and JavaScript; no build, account, or backend is required. Fonts and Lucide icons load from third-party hosts; the page still works without them. There is no character saving, browser storage, or name generation.

Copy puts both a formatted HTML table and plain text on the clipboard. In Google Docs, use the page's Copy button, then paste with Ctrl+V to keep the table and headings. Ctrl+Shift+V pastes plain text and removes formatting. Browsers without rich clipboard support fall back to plain text; blocked clipboard access displays a message.

Run the generator tests:

```sh
npm test
```

## Generator Logic

Data belongs in JSON; roll algorithms and special-case logic belong in `generator.js`:

- `data/rolls.json` defines base stats, weaknesses, strengths, extraordinary strengths, weighted level bands, age and trait rules, temperament, relationships, resistance names, character weapons, skill categories, titles, and professions.
- `data/types.json` defines type weights and subtype settings. Its `progressionChart` supplies the authoritative level ranges, base-stat rules, and level-up bonuses for matching subtypes; `+N` bases distribute N individual +1 points, while values such as `20 all` and `all stats 30 minimum` are applied literally. Subtypes may inherit from one parent (`"inherits": "Parent"`) or several (`"inherits": ["Parent A", "Parent B"]`). Parents are applied before children, shared ancestors only once, and cycles or missing parents are errors. Types with unset weights are excluded from random selection.
- `data/monsters.json` defines the monster generator: area levels, level variance, the stat die, substat divisor and derivations, the extras table, the Boss, Animal, and Trait lists, the elemental Magic Skills rolls, and separate reserved trait and skill catalogs. Reserved abilities are not random skill or spell rolls; a subtype or monster extra can explicitly grant them.
- `generator.js` and `monster.js` load these files directly in Node.js. The browser loads them through `app.js` using relative URLs, so use `npm run dev` rather than opening the HTML as a file.

The page has two generators, stacked under the heading with a faint divider between them. **Character**: Type and Subtype dropdowns (no random option for either; Human defaults to Adult). The Human subtype is selected, never randomly rolled. Types without subtypes disable the Subtype dropdown. **Monster**: a Level dropdown (5, 10, 20, 30, 40, 50, 60, 70, 80) and a Monster button on the row below. Both render into the same sheet, and Copy produces HTML and plain text for whichever was generated last. The NPC sheet has three panels for stats, combat substats (Attack, Defense, Resist, Accuracy, Dodge, Power), and Hit Points, Mana, and resistances/vulnerabilities; its weapon attack is listed separately. The monster sheet uses three panels configured by `sheet` in `data/monsters.json`: stats, the same six combat substats, and a side column with Hit Points, Mana, and EXP. CHA is shown and included in EXP only for Pretends to be human, Emotion manipulator, Cat, Dog, Humanlike, or Human intelligence. EXP is the sum of displayed stats divided by 5 and rounded down; MAG is always included.

The generator selects a type and subtype, then rolls age and stats. The heading shows type, subtype, and level, and shows age only when the selected subtype or type specifies an age range; it displays `Not configured` when neither the subtype nor its ancestors have a level rule. The internal age roll is still used for existing age-based calculations even when hidden. The type and subtype dropdowns are populated from `data/types.json`; subtype inheritance applies configured traits, stat grants, level bonuses, skills, and resistance effects, including an inherited level range when a subtype does not define its own. Progression chart rules are applied across all matching subtypes, including base points and level-up bonuses. Blank or missing source cells are not inferred; types without any configured level progression are labeled `Not configured`. Stat labels use full names. Magic is enabled for every character subtype except Human Child and Adult; there is no manual display override.

All Humans start with 20 in each stat, beauty, two distinct temperaments, and a 30% chance of a non-profession title. Adult, Lord, and Magician first roll a separate Child level from 1–4 and apply its level bonuses, then roll and apply the chosen subtype's level. The heading shows the chosen subtype's level; the generated object also records `childLevel`. Each level applies its bonuses, including level 1; random stats are distinct within a level and include MAG.

- Child: age 12–16, level 1–4, +5 to four random stats per level.
- Adult: age 17–100, level 1–10, 15 independently distributed stat points, +2 to two random stats per level, education, height, a profession, and five random skills at +20%.
- Lord: age 17–300, level 1–40, 30 independently distributed stat points, +1 to two random stats and +2 each to CON and STR per level, education and height, a combat skill, one pending martial magic skill, and two random skills at +20%, increasing by 10% at each ten-level boundary.
- Magician: age 17–500, level 1–65, 20 independently distributed stat points, +1 to one random stat, +3 MAG and +1 INT per level, education and height, two magic skills, and two random skills.

Undead defaults to Skeleton; the dropdown selects Skeleton, Walking Corpse, Corpse Mage, Lich, Fierce Corpse, Skeleton Warrior, Archer Skeleton, Shield Skeleton, or Healer Skeleton. They start with 5 in each stat and two distinct temperaments. Subtypes inherit fixed features, random point grants, skills, and per-level bonuses through their configured parent chain; all per-level bonuses use the selected subtype's single uniformly rolled level. Walking Corpse removes Slow, Bony, and Fragile and halves its profession skill percentages, rounded down; Skeleton Warrior removes Fragile, while Archer adds it back. Archer randomly receives one of Frost arrow, Poison arrow, or Sleep arrow, plus one of Longbow, Crossbow, Short bow, or Sling with a +30% skill bonus, and does not inherit the Warrior's random combat skill. Shield Skeleton inherits Skeleton. Healer uses the monster's Heal (Monster) skill, rolls one Light spell and two skills, and has at least 15 INT. Lich retains the Corpse Mage's two spells and adds three distinct spells at +20% +1% per level. Fierce Corpse's martial skill is shown as pending at +20% +10% per ten levels until its list is supplied.

Dragons other than Ascendant Dragons use either Bite or Claws as their attack; Cubs and Dragon Hatchlings cannot add weapon attacks. Combat-category skills are excluded for Dragon subtypes unless their inheritance chain includes Ascendant Dragon. Ascendant Dragons use weapon attacks and replace Young Dragon's magic type and associated spell with a choice of Light or Darkness, one spell of that type, one Omniscient spell, and Miracle for Light or Calamity for Darkness. Their Soulmate trait grants the Obsessed title at title level 10. Dragon Hatchlings and Pegasi Wolves gain the reserved Fly (Monster) trait, which is distinct from the Wind spell.

Slime Humanoids are separate Fruit Jelly, Blue Slime, and Pink Slime subtypes; each inherits only its named parent. Explicit chart traits such as Beautiful and Very short apply their configured stat effects. Named chart skills and spells retain their listed percentage bonuses.

Traits are rolled only for categories explicitly requested by a type, subtype, or `generate({ traitCategories: [...] })`. Human subtypes inherit beauty and two distinct temperaments; Adults, Lords, and Magicians also roll education and height. Generic generation does not roll or output traits. Uneducated grants Street smarts without an additional bonus; average education is omitted. Temperaments and other traits are displayed in separate sections. Temperament descriptions are retained, and fully specified immediate stat, Mana, skill, resistance, vulnerability, and fixed-title effects are applied.

Characters normally roll independently on all four relationship tables, with a level from -50 to 50. Subtypes marked `generateRelationships: false` omit relationships and organizations; this setting applies only to the selected subtype, not its descendants. For each requested generic title, a roll below 50% outputs `Make a new title`; otherwise it selects a supplied title and level. Age-based title levels are floored from age ÷ 5. Elementals automatically receive a race-specific elemental title, which restricts generated spells to that school. Peculiar redistributes the same total stat points randomly after generation. `generateTitles` also rolls distinct entries from `titles.magicTypes` for `magicTypeTitles`. Skills, speciality skills, monster skills, and magic skills have no default base percentage: their specified bonuses are displayed as `+N%` (or `-N%` for penalties). Skill and speciality skill rolls select uniformly among eligible individual skills and preserve their categories. Repeated grants add their bonuses and are marked as rolled twice (or more). A Combat Weapon skill rolls a specific armed weapon and adds it to the attack section alongside the independently rolled attack. Duplicate weapons appear once. Attacks show the matching Weapon skill bonus, or the Brawl bonus for Unarmed; Brawl and Grapple do not add weapons.

Adults roll one profession uniformly among the named professions, with a profession level rolled from age minus 10 to age plus 10 and capped at 20. Its structured requirements select named skills, a category, or one of a set of alternatives. The profession level is added as a skill bonus; Technical specialist's specified skill also receives its specified 50%. Magic Skills rolls default to the seven elemental schools; other schools, including Martial and Omniscient, are only used when explicitly requested. Reserved traits and skills are only granted explicitly, not rolled from those catalogs. Reserved traits do not have skill percentages. Every selected spell must cost no more Mana than the generated character's Mana (MAG ÷ 5, rounded down, plus temperament Mana bonuses) or monster's Mana substat. Spells with no stated cost are treated as costing 0 Mana. Protector grants one Light spell when affordable. Effects requiring unspecified choices or future level-ups remain descriptions rather than invented values. Category-wide temperament bonuses apply to the currently generated skills; their descriptions retain the rule for future skills.

Characters and monsters start with all 12 listed resistances at 0%; zero values are omitted from the sheet and copies. NPC sheets show `None` when no resistance or vulnerability is active. Lists such as temperaments, traits, titles, and skills appear on separate lines in the sheet and copies. Each character has a 30% chance of being unarmed; otherwise one of the listed weapons is chosen uniformly. The attack shows additional damage and, where applicable, two-handed use or a 50 ft radius.

For direct testing in the browser console or Node.js:

```js
NPCGenerator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 });
```

In Node.js, use `const NPCGenerator = require('./generator.js')` first. A second argument to `generate(options, random)` injects a random function for deterministic tests.

## Monster Generator

`monster.js` exposes `MonsterGenerator` and reuses the roll helpers from `generator.js`. `MonsterGenerator.generate({ level: 20 })` picks LEVEL uniformly from the area level ±5 (minimum 1), then rolls each of STR, CON, AGI, INT, CHA, and MAG as LEVEL + 1d4 × LEVEL. Substats are stat ÷ 5 rounded down: Attack (STR), Defense and HP (CON), Dodge (AGI), Resist (INT), Power and Mana (MAG); Accuracy is INT ÷ 5 + AGI ÷ 5. NPCs use these same six combat substat formulas and derive Hit Points from CON using the same divisor. All monsters display MAG, Power, and Mana as magical stats. Generated monster spells come from the seven elemental schools and must fit the monster's Mana.

Two extras are rolled from a d7: 1 Boss, 2-4 Animal, 5-6 Trait, 7 Magical. The same category can be rolled twice, in which case two different entries are chosen. Extras apply stat modifiers (`perLevel` multiples of LEVEL, or a `minimum` such as Human intelligence raising INT to 50), add skills, and may grant magic skills. Ordinary monsters roll uniformly among Claws, Bite, and Impale (+2 damage), and Smash and Slam (+4 damage). Weaponmasters instead use the character weapon roll, including the 30% unarmed chance. Order of operations: stat modifiers, then a floor of 1 on every stat, then substat derivation, then substat modifiers (Immortal's HP and Lair's Mana). The Magical extra and Spellcaster grant one and two distinct magic skills respectively, drawn from all seven schools. Boss modifiers still adjust MAG, but do not control whether magic stats are displayed.

```js
MonsterGenerator.generate({ level: 20 });
MonsterGenerator.format(monster);
```

Omitting `level` picks an area level at random. Tests live in `monster.test.js`.

### Current Interpretations

- Integer ranges are inclusive. Strengths and weaknesses each select distinct stats, but their groups may overlap. Two extraordinary strengths affect different stats.
- Shared age modifiers apply only to types using shared stat generation, independently to each affected stat; ages 25–29 have no shared age modifier. Humans and Undead use their subtype-specific age ranges and base stats instead.
- Human levels are uniform within each subtype's stated range. Configured level bands use 70% / 20% / 10%, with the level uniform within the selected band.
- Beauty and height each have a 10% chance of either extreme and an 80% chance of average. Average beauty is omitted; height always displays when requested. Education is 10% uneducated (-5 INT), 10% well educated (+15 INT), and 80% average (omitted). Missing or null trait output means omit the trait; set `defaultOutput` explicitly to display a fallback such as `Average` or `N/A`.
- No stat floor or ceiling is applied after modifiers. Unspecified probabilities and skill/title tables are not invented.

## Publish on GitHub Pages

1. Commit these files and push them to the `main` branch of `Team-Eimi/beloved-npc-gen`.
2. In the repository, open **Settings > Pages** and select **GitHub Actions** as the source.
3. Open **Actions > Deploy GitHub Pages** and run the workflow if the initial push did not deploy.
4. The site will be at https://team-eimi.github.io/beloved-npc-gen/ after deployment succeeds (unless a custom domain is configured).

The workflow tests the generators and uploads the five static site files plus `data/` in a `build` job, then a separate `deploy` job publishes the artifact. Asset paths are relative, so the site works under the repository URL. GitHub Pages availability for private repositories depends on the account plan.

If a deploy fails with "No artifacts named github-pages were found" or "Multiple artifacts named github-pages", GitHub's artifact index lagged behind the upload. Push a new commit or trigger **Run workflow** to start a fresh run; re-running the failed job reuses the stale run and will not recover.

## Credits

- Icons: [Lucide](https://lucide.dev/) (ISC license), loaded from unpkg.
- Fonts: DM Sans and Fraunces, loaded from Google Fonts.