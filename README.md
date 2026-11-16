# Incognito · Wedding registration styles

A client preview of the wedding party sign-up for Incognito Menswear & Tux Shop, showing step 1 of the sign-up in each of the four styles under review:

- **Kodak:** charcoal, brass and brushed aluminum
- **Silver Birch:** black, silver and ivory, with Cesso for titles
- **Tuxedo Park, green:** bottle-green walls, engraved stationery and gilt
- **Tuxedo Park, burgundy:** the same, on burgundy

Open `docs/index.html` through a local server, or use the GitHub Pages link. The buttons at the top switch styles, and the form controls work.

## How it's put together

- `designs/` holds the design files exactly as they are on the design canvas.
- `scripts/build.mjs` copies them into `docs/styles/` as plain pages.
- `docs/dc-lite.js` is a small script that runs those design files in an ordinary browser.
- `docs/index.html` is the style switcher.

To update after changing a design on the canvas, replace its file in `designs/`, then:

```
node scripts/build.mjs
node scripts/serve.mjs
```

The second command serves the site at http://localhost:4174.

## Fonts

Silver Birch loads Cesso from the Adobe Fonts web project "Incognito Project" (`euq1ofl`). Add any domain the preview is served from (for example the GitHub Pages address) to that project's domain list in Adobe Fonts, or the titles fall back to Plaster. The other fonts come from Google Fonts.

## Sample data

The couple, wedding party, venue and phone numbers are made-up sample data. The shop's address, hours and phone number are real.
