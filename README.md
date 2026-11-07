# Beloved NPC Gen

A static, browser-based NPC generator for tabletop adventures and stories, by Team Eimi. Generate fantasy, modern-day, or science-fiction characters; keep a name; save favorites on your device; copy or download character sheets.

## Preview

Open `index.html` in your browser. No build, dependencies, account, or backend is required. Fonts, Lucide icons, and the landscape photograph load from third-party hosts; the generator still works without them. Saved characters stay in this browser's local storage and are not synced. Download important characters as a backup.

Run the generator tests with Node.js 22 or later:

```sh
node --test generator.test.js
```

## Publish on GitHub Pages

1. Commit these files and push them to the `main` branch of `Team-Eimi/beloved-npc-gen`.
2. In the repository, open **Settings > Pages** and select **GitHub Actions** as the source.
3. Open **Actions > Deploy GitHub Pages** and run the workflow if the initial push did not deploy.
4. The site will be at https://team-eimi.github.io/beloved-npc-gen/ after deployment succeeds (unless a custom domain is configured).

The workflow tests the generator and publishes only the four static site files. Asset paths are relative, so the site works under the repository URL. GitHub Pages availability for private repositories depends on the account plan.

## Credits

- Icons: [Lucide](https://lucide.dev/) (ISC license), loaded from unpkg.
- Fonts: DM Sans and Fraunces, loaded from Google Fonts.
- Landscape: [Unsplash](https://unsplash.com/photos/aerial-photography-of-house-near-body-of-water-during-daytime-NRQV-hBF10M).