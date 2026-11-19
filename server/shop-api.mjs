// The shop's server API: what the website calls instead of BridalLive itself.
//
//   GET  /api/shop/catalog    our catalog with live stock and prices from BridalLive
//   POST /api/shop/checkout   { lines: [{ variantId, quantity }], customer: { firstName, lastName, email, phone }, returnUrl }
//                             -> checks stock, creates the customer and the order in BridalLive,
//                                and returns where the customer pays
//   GET  /api/shop/order      ?id=&email=  an order's paid status, for the page they come back to
//   GET  /api/shop/health     which BridalLive it is talking to, and how many sizes are linked
//
// Written against the web-standard Request/Response, so the same file runs in the local preview
// server (scripts/serve.mjs), a Cloudflare Worker, Vercel or Netlify (see server/worker.mjs).
//
// Settings (environment variables, all optional except the BridalLive keys for live use):
//   BRIDALLIVE_MODE         'mock' (default when no key is set) or 'live'
//   PAYMENT_MODE            'portal'  - send the customer to BridalLive's Client Portal to pay (default)
//                           'request' - create the order unpaid; the shop sends a payment request
//   PAYMENT_DUE             'full' (default), or a number to take as a deposit per order, e.g. 300
//   BRIDALLIVE_TRX_TYPE_ID  BridalLive's transaction type for an online sale (ask BridalLive)
//   BRIDALLIVE_EMPLOYEE_ID  the employee the orders are filed under (default: the API login's)
//   ALLOWED_ORIGINS         comma-separated sites allowed to call this API, e.g. https://zbarkin.github.io
//   CATALOG_CACHE_SECONDS   how long to reuse BridalLive's stock between page loads (default 60)
import { matchCatalog, stockOf, priceOf } from './match.mjs';

export function createShopApi({ loadCatalog, client, map = {}, env = process.env }) {
  const cacheMs = 1000 * Number(env.CATALOG_CACHE_SECONDS || 60);
  const payMode = env.PAYMENT_MODE || 'portal';
  const due = env.PAYMENT_DUE && env.PAYMENT_DUE !== 'full' ? Number(env.PAYMENT_DUE) : null;
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const returns = new Map();    // trx id -> where the customer goes back to after paying (mock only)
  let cached = null, cachedAt = 0;

  async function linked(force) {
    if (!force && cached && Date.now() - cachedAt < cacheMs) return cached;
    const [catalog, items] = await Promise.all([loadCatalog(), client.listItems()]);
    const { links, missing } = matchCatalog(catalog, items, map);
    cached = { catalog, links, missing }; cachedAt = Date.now();
    return cached;
  }

  // Our catalog, with each size's stock and price replaced by BridalLive's. Sizes that aren't
  // linked to a BridalLive item can't be bought online.
  async function catalog() {
    const { catalog, links } = await linked();
    const out = structuredClone(catalog);
    out.source = 'BridalLive (' + client.name + ')';
    for (const p of out.products) {
      for (const v of p.variants) {
        const it = links.get(v.id);
        v.linked = !!it;
        v.stock = it ? stockOf(it) : 0;
        v.available = !!it && v.stock > 0;
        if (it) v.price = priceOf(it, v.price);
        delete v.shopifyVariantId;
      }
      p.available = p.variants.some((v) => v.available);
      const prices = p.variants.filter((v) => v.linked).map((v) => v.price);
      if (prices.length) p.price = Math.min(...prices);
    }
    return out;
  }

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  async function checkout(body) {
    const c = body && body.customer || {};
    const customer = { firstName: clean(c.firstName, 60), lastName: clean(c.lastName, 60), email: clean(c.email, 120), phone: clean(c.phone, 30) };
    if (!customer.firstName || !customer.lastName) return fail(400, 'Please add your first and last name.');
    if (!EMAIL.test(customer.email)) return fail(400, 'Please add a valid email address.');
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length || lines.length > 20) return fail(400, 'Your cart is empty.');

    // Stock and price come from BridalLive at this moment, never from the browser.
    const { catalog, links } = await linked(true);
    const lineItems = [];
    for (const l of lines) {
      const q = Math.floor(Number(l.quantity));
      if (!(q >= 1 && q <= 5)) return fail(400, 'Quantities are 1 to 5 per size.');
      const it = links.get(l.variantId);
      const p = catalog.products.find((x) => x.variants.some((v) => v.id === l.variantId));
      const v = p && p.variants.find((x) => x.id === l.variantId);
      if (!it || !v) return fail(409, 'One of the sizes in your cart can’t be ordered online. Please call the shop.');
      if (stockOf(it) < q) return fail(409, p.title + ', ' + v.size + ' just sold out. Please pick another size.', { variantId: l.variantId });
      lineItems.push({ inventoryItemId: it.id, quantity: q, price: priceOf(it, v.price), itemName: it.name, itemSize: it.size || v.size, itemColor: it.color || v.color || '', note: 'Website order' });
    }
    const total = lineItems.reduce((a, l) => a + l.price * l.quantity, 0);
    const payNow = due ? Math.min(due, total) : total;

    const contact = await client.findOrCreateContact(customer);
    const emp = Number(env.BRIDALLIVE_EMPLOYEE_ID) || (client.employee && client.employee.id) || undefined;
    const trx = await client.createTransaction({
      contactId: contact.id, employeeId: emp,
      typeId: env.BRIDALLIVE_TRX_TYPE_ID ? Number(env.BRIDALLIVE_TRX_TYPE_ID) : undefined,
      lineItems, requestedPaymentAmount: payNow, deposit: due ? payNow : undefined,
      source: 'Website', notes: 'Online order from the website shop.' + (due ? ' Deposit due now: $' + payNow + '.' : '')
    });
    cached = null;  // stock changed

    const order = { id: trx.id, number: trx.trxNumber, total, payNow };
    if (payMode === 'request') {
      return ok({ ok: true, mode: 'request', order, message: 'Your order is in. We’ll email you a secure link to pay $' + payNow + ' within one business day.' });
    }
    const portal = await client.portalUrl(contact.id);
    if (!portal || !portal.url) return ok({ ok: true, mode: 'request', order, message: 'Your order is in. We’ll email you a secure link to pay.' });
    if (body.returnUrl && allowedReturn(body.returnUrl)) returns.set(trx.id, body.returnUrl);
    return ok({ ok: true, mode: 'portal', order, url: portal.url });
  }

  async function order(id, email) {
    const t = await client.getTransaction(id);
    // Only answer for the customer's own email, so order numbers can't be guessed through.
    const onFile = t && t.contact && t.contact.emailAddress;
    if (!t || !onFile || onFile.toLowerCase() !== String(email || '').toLowerCase()) return fail(404, 'Order not found.');
    return ok({ ok: true, number: t.trxNumber, total: t.totalAmount, paid: t.totalPaymentAmount, balanceDue: t.balanceDue });
  }

  // Test payment page for the mock BridalLive: stands in for the Client Portal.
  async function mockPay(req, url) {
    const id = Number(url.searchParams.get('trx'));
    const t = await client.getTransaction(id);
    if (!t) return new Response('No such order', { status: 404 });
    const back = returns.get(id) || '/screens/Shop.dc.html';
    if (req.method === 'POST') {
      await client.addPayment(id, { amount: t.requestedPaymentAmount || t.balanceDue, methodDescription: 'Test card', provider: 'mock' });
      const to = new URL(back, url); to.searchParams.set('order', t.trxNumber); to.searchParams.set('paid', '1');
      return new Response(null, { status: 303, headers: { location: to.href } });
    }
    const amt = (t.requestedPaymentAmount || t.balanceDue).toFixed(2);
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test payment</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:440px;margin:48px auto;padding:0 16px;color:#1d1d1f;background:#fafaf7">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a33">Test mode: no card is charged</p>
<h1 style="font-size:24px;margin:0 0 4px">Pay Incognito Menswear</h1>
<p style="margin:0 0 20px;color:#555">Stands in for BridalLive’s Client Portal until the shop’s account is connected.</p>
<p>Order ${t.trxNumber} · ${t.lineItems.map((l) => esc(l.itemName + ', ' + l.itemSize)).join(' · ')}</p>
<p style="font-size:20px"><b>Due now: $${amt}</b>${t.totalAmount > Number(amt) ? ' <span style="color:#555">of $' + t.totalAmount.toFixed(2) + '</span>' : ''}</p>
<form method="post"><button style="height:48px;padding:0 24px;font:inherit;font-weight:600;background:#1d1d1f;color:#fff;border:0;border-radius:4px;cursor:pointer">Pay $${amt} (test)</button>
<a href="${esc(back)}" style="margin-left:16px;color:#555">Cancel</a></form></body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  function allowedReturn(u) {
    try { const o = new URL(u).origin; return !origins.length || origins.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o); } catch { return false; }
  }
  function cors(req, res) {
    const o = req.headers.get('origin');
    if (o && (origins.includes(o) || (!origins.length && /^http:\/\/localhost(:\d+)?$/.test(o)))) {
      res.headers.set('access-control-allow-origin', o);
      res.headers.set('vary', 'origin');
      res.headers.set('access-control-allow-headers', 'content-type');
      res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    return res;
  }

  return async function handle(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/shop/')) return null;
    const route = url.pathname.slice('/api/shop/'.length);
    if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
    try {
      let res;
      if (route === 'catalog' && req.method === 'GET') res = ok(await catalog(), { 'cache-control': 'public, max-age=30' });
      else if (route === 'checkout' && req.method === 'POST') res = await checkout(await req.json().catch(() => null));
      else if (route === 'order' && req.method === 'GET') res = await order(url.searchParams.get('id'), url.searchParams.get('email'));
      else if (route === 'health' && req.method === 'GET') { const l = await linked(true); res = ok({ ok: true, bridallive: client.name, base: client.base || null, paymentMode: payMode, deposit: due, linkedSizes: l.links.size, unlinkedSizes: l.missing.length }); }
      else if (route === 'mock-pay' && client.name === 'mock') res = await mockPay(req, url);
      else res = fail(404, 'Not found.');
      return cors(req, res);
    } catch (e) {
      console.error('[shop-api]', e);
      return cors(req, fail(e.status === 409 ? 409 : 502, 'The shop’s system didn’t answer. Please try again, or call the shop.'));
    }
  };
}

function ok(data, headers = {}) { return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...headers } }); }
function fail(status, message, extra = {}) { return new Response(JSON.stringify({ ok: false, message, ...extra }), { status, headers: { 'content-type': 'application/json' } }); }
function clean(s, n) { return String(s || '').trim().slice(0, n); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
