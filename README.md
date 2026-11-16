# Incognito · Wedding registration styles

A client preview of the wedding party sign-up and tracking screens for Incognito Menswear & Tux Shop. It includes every screen from the design canvas:

- **Style options:** step 1 of the sign-up in Kodak, Silver Birch, Tuxedo Park green and Tuxedo Park burgundy, plus each style's detail sheet
- **Register the wedding party:** the four sign-up steps, in the Kodak style
- **Track the party:** the groom's status page, and the groomsman's page, measurements form and measuring walkthrough on a phone
- **How to measure:** all ten measuring animations
- **Staff:** the parties board and the one-party assessment view

Use the GitHub Pages link, or serve `docs/` locally. The menu at the top picks a screen, the arrows step through them, and links inside the screens move between them. Phone screens show in a phone-sized frame. The form controls work.

## How it's put together

- `designs/` holds the design files exactly as they are on the design canvas.
- `scripts/build.mjs` copies them into `docs/screens/` as plain pages, keeping their names so links between screens work.
- `docs/dc-lite.js` is a small script that runs those design files in an ordinary browser, including the shared measuring animation.
- `docs/index.html` is the screen menu.

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
