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
- `data/types.json` defines type weights and subtype settings: age and level ranges, trait categories, magic visibility, modifiers, level bonuses, and required skill/title counts. The eight supplied weights are Human 60%, Elemental 6%, Omniscient 0.5%, Dragon 5.5%, Vampire 6%, Slime 6%, Mermaid 6%, and Undead 10%. They total 100%; no ninth type is invented. Types with unset weights are excluded from selection.
- `data/monsters.json` defines the monster generator: area levels, level variance, the stat die, substat divisor and derivations, the extras table, and the Boss, Animal, Trait, and Magic skill lists.
- `generator.js` and `monster.js` load these files directly in Node.js. The browser loads them through `app.js` using relative URLs, so use `npm run dev` rather than opening the HTML as a file.

The page has two generators, stacked under the heading with a faint divider between them and the shared Magic toggle beside both. **Character**: Type and Subtype dropdowns (no random option for either; Human defaults to Adult). The Human subtype is selected, never randomly rolled. Types without subtypes disable the Subtype dropdown. **Monster**: a Level dropdown (5, 10, 20, 30, 40, 50, 60, 70, 80) and a Monster button on the row below. Both render into the same sheet, and Copy produces HTML and plain text for whichever was generated last. The monster sheet uses three panels configured by `sheet` in `data/monsters.json`: stats, combat substats (Attack, Defense, Resist, Accuracy, Dodge, Power), and a side column with Hit Points, Mana, and EXP. CHA is shown and included in EXP only for Pretends to be human, Emotion manipulator, Cat, Dog, Humanlike, or Human intelligence. EXP is the sum of displayed stats divided by 5 and rounded down; MAG is included only when Magic is shown.

The generator selects a type and subtype, then rolls age and stats. The heading shows type, subtype, age, and level where applicable. Human, Elemental, and Undead have subtypes; the other five types currently use shared stat/age rolls without invented subtype rules. Stat labels use full names. Magic is always tracked internally; the Magic checkbox only controls the current sheet and both clipboard formats, without deleting or rerolling stats. Each new Human starts with its subtype's display default: Child/Adult hide Magic; Lord/Magician show it. All Elemental subtypes show Magic. The checkbox remains available to override either default. Types without a configured default retain the checkbox preference when generating.

All Humans start with 20 in each stat, beauty, two distinct temperaments, and a 30% chance of a non-profession title. Adult, Lord, and Magician first roll a separate Child level from 1–4 and apply its level bonuses, then roll and apply the chosen subtype's level. The heading shows the chosen subtype's level; the generated object also records `childLevel`. Each level applies its bonuses, including level 1; random stats are distinct within a level and include MAG.

- Child: age 12–16, level 1–4, +5 to four random stats per level.
- Adult: age 17–100, level 1–10, 15 independently distributed stat points, +2 to two random stats per level, education, height, a profession, and two random skills at +20%.
- Lord: age 17–300, level 1–40, 30 independently distributed stat points, +1 to two random stats and +2 each to CON and STR per level, a combat skill, one pending martial magic skill, and two random skills at +20% (+30% above level 20; +40% above level 30).
- Magician: age 17–500, level 1–65, 20 independently distributed stat points, +1 to one random stat, +3 MAG and +1 INT per level, two magic skills, and two random skills at +20% (+30% above level 20; +40% above level 35; +50% above level 50).

Elemental subtypes are only reachable through the dropdown (their weights are unset, so a random Elemental has no subtype). Sprite: level 1-5, each level raises 3 random stats by 1, 1 title, no skills. Fairy: level 1-80, each level raises MAG by 2 and 2 random stats by 1. Elemental: level 1-25, each level raises MAG, CON, and STR by 1. Genasi: level 1-20, each level raises 3 random stats by 3. Fairy, Elemental, and Genasi roll the Sprite title plus one additional magic-type title.

Undead defaults to Skeleton; the dropdown selects Skeleton, Walking Corpse, Corpse Mage, Lich, Fierce Corpse, Skeleton Warrior, Archer Skeleton, Shield Skeleton, or Healer Skeleton. They start with 5 in each stat and two distinct temperaments. Subtypes inherit fixed features, random point grants, skills, and per-level bonuses through their configured parent chain; all per-level bonuses use the selected subtype's single uniformly rolled level. Walking Corpse removes Slow, Bony, and Fragile; Skeleton Warrior removes Fragile, while Archer adds it back. Shield Skeleton inherits Skeleton. Magic is shown by default for Corpse Mage, Lich, and Healer Skeleton. Healer uses the monster's Heal (Monster) skill, rolls one Light spell and two skills, and has at least 15 INT. Lich retains the Corpse Mage's two spells and adds three distinct spells at 30% base +20% +1% per level. Fierce Corpse's martial skill is shown as pending at 30% base +20% +10% per ten levels until its list is supplied.

Traits are rolled only for categories explicitly requested by a type, subtype, or `generate({ traitCategories: [...] })`. Human subtypes inherit beauty and two distinct temperaments; Adults additionally roll education and height. Generic generation does not roll or output traits. Uneducated grants Street smarts at the normal 30% base; average education is omitted. Temperament descriptions are retained, and fully specified immediate stat, skill, resistance, vulnerability, and fixed-title effects are applied.

Each character rolls independently on all four relationship tables, with a level from -50 to 50. For each requested generic title, a roll below 50% outputs `Make a new title`; otherwise it selects a supplied title and its description. `generateTitles` also rolls distinct entries from `titles.magicTypes` for `magicTypeTitles`. Skill and speciality skill rolls select uniformly among eligible individual skills and preserve their categories; their base values are 30% and 0% respectively. Repeated grants add their bonuses and are marked as rolled twice (or more). A Combat Weapon skill rolls a specific armed weapon and adds it to the attack section alongside the independently rolled attack. Duplicate weapons appear once. Attacks show the matching Weapon skill percentage, or the Brawl percentage for Unarmed; Brawl and Grapple do not add weapons.

Adults roll one profession uniformly among the named professions, with a profession level uniformly from age minus 10 to age plus 10. Its structured requirements select named skills, a category, or one of a set of alternatives. The profession level adds to the normal 30% skill base or 0% speciality base; Technical specialist's specified skill is 50%. Magicians use the existing monster magic list; martial magic remains pending until its list is supplied. Effects requiring an unspecified choice, title level, future level-up, or character Mana calculation remain descriptions rather than invented values; in particular, Protector enables magic and sets MAG to 15 if previously unavailable, but its light spell is not selected yet. Category-wide temperament bonuses apply to the currently generated skills; their descriptions retain the rule for future skills.

Characters and monsters start with all 12 listed resistances at 0%; zero values and an empty resistance section are omitted from the sheet and copies. Each character has a 30% chance of being unarmed; otherwise one of the listed weapons is chosen uniformly. The attack shows additional damage and, where applicable, two-handed use or a 50 ft radius.

For direct testing in the browser console or Node.js:

```js
NPCGenerator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 });
```

In Node.js, use `const NPCGenerator = require('./generator.js')` first. A second argument to `generate(options, random)` injects a random function for deterministic tests.

## Monster Generator

`monster.js` exposes `MonsterGenerator` and reuses the roll helpers from `generator.js`. `MonsterGenerator.generate({ level: 20 })` picks LEVEL uniformly from the area level ±5 (minimum 1), then rolls each of STR, CON, AGI, INT, CHA, and MAG as LEVEL + 1d4 × LEVEL. Substats are stat ÷ 5 rounded down: Attack (STR), Defense and HP (CON), Dodge (AGI), Resist (INT), Power and Mana (MAG); Accuracy is INT ÷ 5 + AGI ÷ 5. Magic, Power, and Mana display in grey with `(Not Applicable)` unless the monster is MAGICAL. The Magic checkbox overrides that display (setting `includeMagic`) without rerolling; the plain-text and HTML copies follow the current display.

Two extras are rolled from a d7: 1 Boss, 2-4 Animal, 5-6 Trait, 7 Magical. The same category can be rolled twice, in which case two different entries are chosen. Extras apply stat modifiers (`perLevel` multiples of LEVEL, or a `minimum` such as Human intelligence raising INT to 50), add skills, enable MAG, or grant magic skills. Ordinary monsters roll uniformly among Claws, Bite, and Impale (+2 damage), and Smash and Slam (+4 damage). Weaponmasters instead use the character weapon roll, including the 30% unarmed chance. Order of operations: stat modifiers, then a floor of 1 on every stat, then substat derivation, then substat modifiers (Immortal's HP and Lair's Mana). The Magical extra and Spellcaster grant one and two distinct magic skills respectively, drawn from all seven schools. Bosses that add MAG (Gamemaster, Sheds magic, Healer, Antimagic, Spellcaster) enable MAG; Sheds magic is treated as magical because it adds LEVEL × 10 to MAG.

```js
MonsterGenerator.generate({ level: 20 });
MonsterGenerator.format(monster);
```

Omitting `level` picks an area level at random. Tests live in `monster.test.js`.

### Current Interpretations

- Integer ranges are inclusive. Strengths and weaknesses each select distinct stats, but their groups may overlap. Two extraordinary strengths affect different stats.
- Shared age modifiers apply only to types using shared stat generation, independently to each affected stat; ages 25–29 have no shared age modifier. Humans and Undead use their subtype-specific age ranges and base stats instead.
- Human levels are uniform within each subtype's stated range. Elemental level bands use 70% / 20% / 10%: 1-5 selects 1-2 / 3-4 / 5; 1-20 selects 1-8 / 9-14 / 15-20; 1-25 selects 1-10 / 11-18 / 19-25; 1-80 selects 1-32 / 33-56 / 57-80. The level is uniform within the selected band.
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