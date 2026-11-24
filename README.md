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

- `data/rolls.json` defines base stats, weaknesses, strengths, extraordinary strengths, weighted level bands, shared age adjustments, and beauty/height/education rules.
- `data/types.json` defines type weights and subtype settings: trait categories, magic visibility, modifiers, level ranges, level bonuses, age bonuses, and required skill/title counts. The eight supplied weights are Human 60%, Elemental 6%, Omniscient 0.5%, Dragon 5.5%, Vampire 6%, Slime 6%, Mermaid 6%, and Undead 10%. They total 100%; no ninth type is invented. Types with unset weights are excluded from selection.
- `generator.js` loads these files directly in Node.js. The browser loads them through `app.js` using relative URLs, so use `npm run dev` rather than opening the HTML as a file.

The generator selects a type, then rolls age, any configured subtype, and stats. The heading shows type, subtype, age, and level where applicable. The seven non-Human types currently use shared stat/age rolls without invented subtype rules. Stat labels use full names. Magic is always rolled internally; the Magic checkbox only controls the current sheet and both clipboard formats, without deleting or rerolling stats. Each new Human starts with its subtype's display default: Child/Adult hide Magic; Lord/Magician show it. The checkbox remains available to override either default. Types without a configured default retain the checkbox preference when generating.

Traits are rolled only for categories explicitly requested by a subtype or `generate({ traitCategories: [...] })`. Each distinct category is rolled once per generated NPC. Generic generation does not roll or output traits. Human Child requests beauty and temperament; Adult requests education and height through its `traits` list, independently of skill/title counts in `rolls`. Temperament is skipped until its table is supplied. Education can grant `street smarts lvl 5`; average education is rolled but omitted from output.

`generateResistancesAndVulnerabilities`, `generateTitles`, `generateSkills`, and `generateSpecialitySkills` remain blank hooks. They receive the selected type, subtype, age, requested roll counts (`selection.rolls`), and final stats. Add the missing tables and their selection logic here without putting it in the page renderer.

For direct testing in the browser console or Node.js:

```js
NPCGenerator.generate({ type: 'HUMAN', subtype: 'Adult', age: 25 });
```

In Node.js, use `const NPCGenerator = require('./generator.js')` first. A second argument to `generate(options, random)` injects a random function for deterministic tests.

### Current Interpretations

- Integer ranges are inclusive. Strengths and weaknesses each select distinct stats, but their groups may overlap. Two extraordinary strengths affect different stats.
- Age modifiers apply independently to each affected stat. Ages 25-29 have no shared age modifier. Magicians with level greater than 30 gain an additional 1-100 years after shared age/stat adjustments and level bonuses. This can raise age above 70; shared age modifiers are not applied a second time.
- Human age 10-16 selects Child; age 17+ selects Adult/Lord/Magician at 90/5/5. Child uses the shared age reduction, not a second duplicate reduction.
- Level 1-4 is uniform. Level 1-10 selects 1-4 / 5-7 / 8-10 at 70% / 20% / 10%; level 1-30 selects 1-10 / 11-20 / 21-30 at those weights; level 1-45 selects 1-18 / 19-30 / 31-45 at those weights. The level is rolled uniformly within the selected band.
- Each rolled level grants its stated bonus, including level 1. Random level stats are distinct per level and may overlap the fixed bonuses. Child/Adult level bonuses exclude MAG.
- Beauty 1 is ugly, 10 is beautiful, and 2-9 is average (omitted). Height always displays when requested: 1-2 is very short, 3-11 is average, and 12-14 is very tall. Only short/tall height changes stats. Education 1 is uneducated, 10 is educated, and other rolls are omitted. Missing or null trait output means omit the trait; set `defaultOutput` explicitly to display a fallback such as `Average` or `N/A`.
- No stat floor or ceiling is applied after modifiers. Unspecified probabilities and skill/title tables are not invented.

## Publish on GitHub Pages

1. Commit these files and push them to the `main` branch of `Team-Eimi/beloved-npc-gen`.
2. In the repository, open **Settings > Pages** and select **GitHub Actions** as the source.
3. Open **Actions > Deploy GitHub Pages** and run the workflow if the initial push did not deploy.
4. The site will be at https://team-eimi.github.io/beloved-npc-gen/ after deployment succeeds (unless a custom domain is configured).

The workflow tests the generator and publishes the four static site files plus `data/`. Asset paths are relative, so the site works under the repository URL. GitHub Pages availability for private repositories depends on the account plan.

## Credits

- Icons: [Lucide](https://lucide.dev/) (ISC license), loaded from unpkg.
- Fonts: DM Sans and Fraunces, loaded from Google Fonts.