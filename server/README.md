# Shop API: the website shop on BridalLive

The website shop runs on the shop's own system, BridalLive, from January 1, 2027:

- **Stock and prices** come live from BridalLive. A size that sells out at the counter shows as sold out online.
- **Orders** are created in BridalLive with the customer, so the shop works them like any other sale.
- **Payment** is on BridalLive's own secure payment page (Client Portal, run by BridalLive Pay or Stripe). Card details never touch our code.

```
browser (docs/shop, commerce.js)  ->  shop API (this folder)  ->  BridalLive API
          cart, details form            holds the API key          stock, orders, payments
```

The browser never talks to BridalLive directly. The API key gives full access to the shop's account, so it lives only on the server.

## Running it now, before BridalLive access

```
node scripts/serve.mjs
```

Open http://localhost:4174/screens/Shop.dc.html. On the local server, the shop uses a stand-in BridalLive (`mock-bridallive.mjs`):

- Each size gets made-up stock.
- Orders take stock off.
- "Check out" goes to a test payment page. No card is charged.
- After paying, you come back to the shop with an order confirmation.

The public preview on GitHub Pages is unchanged: it has no server, so it keeps the browser-only cart.

To take a deposit instead of the full price: `PAYMENT_DUE=300 node scripts/serve.mjs`.

## Files

| File | What it does |
|---|---|
| `bridallive.mjs` | BridalLive API client: login, items, contacts, sales, payments, portal link |
| `mock-bridallive.mjs` | The stand-in BridalLive, with the same methods |
| `match.mjs` | Links each size in our catalog to a BridalLive item (name + size + colour) |
| `bridallive-map.json` | Hand fixes for that matching, when BridalLive names differ from ours |
| `shop-api.mjs` | The API the website calls: `/api/shop/catalog`, `/checkout`, `/order`, `/health` |
| `index.mjs` | Builds the API from settings (used by `scripts/serve.mjs`) |
| `worker.mjs` | The same API as a Cloudflare Worker, for deploying |
| `../scripts/bridallive-match.mjs` | Report: which sizes are linked, which aren't, which BridalLive items nothing uses |

## Settings

| Variable | Meaning |
|---|---|
| `BRIDALLIVE_BASE` | `https://qa.bridallive.com/bl-server` (testing) or `https://app.bridallive.com/bl-server` (live) |
| `BRIDALLIVE_RETAILER_ID`, `BRIDALLIVE_API_KEY` | From BridalLive: Settings > Account > API Access. Secret, never commit. |
| `BRIDALLIVE_MODE` | `mock` or `live`. Default: live when a key is set. |
| `PAYMENT_MODE` | `portal` (send the customer to pay, default) or `request` (create the order unpaid; the shop sends a payment request) |
| `PAYMENT_DUE` | `full` (default), or a deposit amount per order, e.g. `300` |
| `BRIDALLIVE_TRX_TYPE_ID` | BridalLive's transaction type for an online sale |
| `BRIDALLIVE_EMPLOYEE_ID` | The employee website orders are filed under |
| `BRIDALLIVE_STOCK_FIELD` | Which stock number counts as sellable (default `quantityInStock`) |
| `ALLOWED_ORIGINS` | The website addresses allowed to call the API |
| `CATALOG_URL` | The published `catalog.json`, for a deployed server |

## Go-live checklist

**The shop owner (in BridalLive):**
1. Be on the **Elite** plan and apply for **API access** ($50/month per location).
2. Ask BridalLive Support (help@bridallive.com) for a **QA environment**. Test and live accounts are separate.
3. Connect **BridalLive Pay or Stripe** so the Client Portal can take card payments.
4. Load the suits into inventory with clear sizes (e.g. `38R/32W`), colours and photos. Use the same style names as the website (Hampton, Madison...), or tell us the differences.
5. Send us the QA Retailer ID and API key **privately** (not by email in plain text).

**Questions for BridalLive.** Each one is marked VERIFY in `bridallive.mjs`:
1. Can the API create a payment request or payment link for a transaction, or does the Client Portal link take payment for `requestedPaymentAmount`?
2. Which `typeId` is an online sale, and does creating the transaction take the items out of stock?
3. Is sellable stock `quantityInStock` or `quantityOnHand`?
4. Which filter does `/api/items/list` take for active items, and `/api/contacts/list` for an email address?
5. Webhooks or polling for stock changes? Rate limits?
6. If Stripe: does the shop get its own Stripe API keys (an alternative payment path: Stripe Checkout, then record the payment with `addPayment`)?

**Us, with QA access:**
1. Put the QA keys in `.env` (git-ignored) and run `node scripts/bridallive-match.mjs`. Fix what doesn't link in `bridallive-map.json`.
2. Run the shop locally against QA: buy one item, check the sale, stock and payment in BridalLive QA.
3. Settle each VERIFY item above and adjust `bridallive.mjs`.
4. Deploy `worker.mjs`:
   - Run `npx wrangler deploy` from the shop's own Cloudflare account.
   - Put the keys in with `wrangler secret put`.
   - Set `ALLOWED_ORIGINS` and `CATALOG_URL`.
5. Set `apiBase` in `docs/shop/commerce.js` to the deployed API.

**After January 1, once the live data has settled:**
1. Switch the server's keys and `BRIDALLIVE_BASE` to live (`app.bridallive.com`).
2. Run the match report against live, and fix any gaps.
3. Place one real order and refund it.
