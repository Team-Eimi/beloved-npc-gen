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

- `data/rolls.json` defines base stats, weaknesses, strengths, extraordinary strengths, weighted level bands, shared age adjustments, beauty/height/education rules, and the magic-type title table (light, darkness, fire, water, earth, wind, electricity).
- `data/types.json` defines type weights and subtype settings: trait categories, magic visibility, modifiers, level ranges, level bonuses, age bonuses, and required skill/title counts. The eight supplied weights are Human 60%, Elemental 6%, Omniscient 0.5%, Dragon 5.5%, Vampire 6%, Slime 6%, Mermaid 6%, and Undead 10%. They total 100%; no ninth type is invented. Types with unset weights are excluded from selection.
- `data/monsters.json` defines the monster generator: area levels, level variance, the stat die, substat divisor and derivations, the extras table, and the Boss, Animal, Trait, and Magic skill lists.
- `generator.js` and `monster.js` load these files directly in Node.js. The browser loads them through `app.js` using relative URLs, so use `npm run dev` rather than opening the HTML as a file.

The page has two generators, stacked under the heading with a faint divider between them and the shared Magic toggle beside both. **Character**: Type and Subtype dropdowns (no random option for either; Type defaults to the first type and Subtype to the heaviest-weighted subtype, so Human starts on Adult). Types without subtypes disable the Subtype dropdown. **Monster**: a Level dropdown (5, 10, 20, 30, 40, 50, 60, 70, 80) and a Monster button on the row below. Both render into the same sheet, and Copy produces HTML and plain text for whichever was generated last. The monster sheet uses three panels configured by `sheet` in `data/monsters.json`: stats (STR, CON, CHA, INT, AGI, MAG), combat substats (Attack, Defense, Resist, Accuracy, Dodge, Power), and a side column with Hit Points, Mana, and EXP. EXP is the sum of the six stats when Magic is shown, or the five non-magic stats when it is not, divided by 5 and rounded down; it follows the Magic toggle.

The generator selects a type, then rolls age, any configured subtype, and stats. The heading shows type, subtype, age, and level where applicable. Human and Elemental have subtypes; the other six types currently use shared stat/age rolls without invented subtype rules. Stat labels use full names. Magic is always rolled internally; the Magic checkbox only controls the current sheet and both clipboard formats, without deleting or rerolling stats. Each new Human starts with its subtype's display default: Child/Adult hide Magic; Lord/Magician show it. All Elemental subtypes show Magic. The checkbox remains available to override either default. Types without a configured default retain the checkbox preference when generating.

Elemental subtypes are only reachable through the dropdown (their weights are unset, so a random Elemental has no subtype). Sprite: level 1-5, each level raises 3 random stats by 1, 1 title, no skills. Fairy: level 1-80, each level raises MAG by 2 and 2 random stats by 1. Elemental: level 1-25, each level raises MAG, CON, and STR by 1. Genasi: level 1-20, each level raises 3 random stats by 3. Fairy, Elemental, and Genasi roll the Sprite title plus one additional magic-type title.

Traits are rolled only for categories explicitly requested by a subtype or `generate({ traitCategories: [...] })`. Each distinct category is rolled once per generated NPC. Generic generation does not roll or output traits. Human Child requests beauty and temperament; Adult requests education and height through its `traits` list, independently of skill/title counts in `rolls`. Temperament is skipped until its table is supplied. Education can grant `street smarts lvl 5`; average education is rolled but omitted from output.

`generateTitles` rolls `selection.rolls.magicTypeTitles` distinct entries from `titles.magicTypes` in `data/rolls.json`, output capitalised (for example `Fire`). The generic `titles` count is recorded but has no table yet. `generateResistancesAndVulnerabilities`, `generateSkills`, and `generateSpecialitySkills` remain blank hooks. They receive the selected type, subtype, age, requested roll counts (`selection.rolls`), and final stats. Add the missing tables and their selection logic here without putting it in the page renderer.

For direct testing in the browser console or Node.js:

```js
NPCGenerator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 });
```

In Node.js, use `const NPCGenerator = require('./generator.js')` first. A second argument to `generate(options, random)` injects a random function for deterministic tests.

## Monster Generator

`monster.js` exposes `MonsterGenerator` and reuses the roll helpers from `generator.js`. `MonsterGenerator.generate({ level: 20 })` picks LEVEL uniformly from the area level ±5 (minimum 1), then rolls each of STR, CON, AGI, INT, CHA, and MAG as LEVEL + 1d4 × LEVEL. Substats are stat ÷ 5 rounded down: Attack (STR), Defense and HP (CON), Dodge (AGI), Resist (INT), Power and Mana (MAG); Accuracy is INT ÷ 5 + AGI ÷ 5. Magic, Power, and Mana display in grey with `(Not Applicable)` unless the monster is MAGICAL. The Magic checkbox overrides that display (setting `includeMagic`) without rerolling; the plain-text and HTML copies follow the current display.

Two extras are rolled from a d7: 1 Boss, 2-4 Animal, 5-6 Trait, 7 Magical. The same category can be rolled twice, in which case two different entries are chosen. Extras apply stat modifiers (`perLevel` multiples of LEVEL, or a `minimum` such as Human intelligence raising INT to 50), add skills, enable MAG, grant magic skills, or roll a choice (Weaponmaster's weapon). Order of operations: stat modifiers, then a floor of 1 on every stat, then substat derivation, then substat modifiers (Immortal's HP and Lair's Mana). The Magical extra and Spellcaster grant one and two distinct magic skills respectively, drawn from all seven schools. Bosses that add MAG (Gamemaster, Sheds magic, Healer, Antimagic, Spellcaster) enable MAG; Sheds magic is treated as magical because it adds LEVEL × 10 to MAG.

```js
MonsterGenerator.generate({ level: 20 });
MonsterGenerator.format(monster);
```

Omitting `level` picks an area level at random. Tests live in `monster.test.js`.

### Current Interpretations

- Integer ranges are inclusive. Strengths and weaknesses each select distinct stats, but their groups may overlap. Two extraordinary strengths affect different stats.
- Age modifiers apply independently to each affected stat. Ages 25-29 have no shared age modifier. Magicians with level greater than 30 gain an additional 1-100 years after shared age/stat adjustments and level bonuses. This can raise age above 70; shared age modifiers are not applied a second time.
- Human age 10-16 selects Child; age 17+ selects Adult/Lord/Magician at 90/5/5. Child uses the shared age reduction, not a second duplicate reduction.
- Level 1-4 is uniform. Level 1-10 selects 1-4 / 5-7 / 8-10 at 70% / 20% / 10%; level 1-30 selects 1-10 / 11-20 / 21-30 at those weights; level 1-45 selects 1-18 / 19-30 / 31-45 at those weights. Elemental ranges use the same weights: 1-5 selects 1-2 / 3-4 / 5; 1-20 selects 1-8 / 9-14 / 15-20; 1-25 selects 1-10 / 11-18 / 19-25; 1-80 selects 1-32 / 33-56 / 57-80. The level is rolled uniformly within the selected band.
- Each rolled level grants its stated bonus, including level 1. Random level stats are distinct per level and may overlap the fixed bonuses. Child/Adult level bonuses exclude MAG.
- Beauty 1 is ugly, 10 is beautiful, and 2-9 is average (omitted). Height always displays when requested: 1-2 is very short, 3-11 is average, and 12-14 is very tall. Only short/tall height changes stats. Education 1 is uneducated, 10 is educated, and other rolls are omitted. Missing or null trait output means omit the trait; set `defaultOutput` explicitly to display a fallback such as `Average` or `N/A`.
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