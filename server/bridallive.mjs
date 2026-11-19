// BridalLive API client: the only code that talks to BridalLive. It runs on the server, never in
// the browser, because the API key gives full access to the shop's BridalLive account.
//
// Built from BridalLive's published Swagger spec (assets.bridallive.com/docs/swagger, v1).
// Fields and endpoints marked VERIFY are read from the spec but not yet tried against a real
// account. Check them in BridalLive's QA environment before going live.
//
// Settings (environment variables):
//   BRIDALLIVE_BASE          https://qa.bridallive.com/bl-server (testing) or https://app.bridallive.com/bl-server (live)
//   BRIDALLIVE_RETAILER_ID   from Settings > Account > API Access
//   BRIDALLIVE_API_KEY       from the same page. Secret: never commit it, never send it to a browser.

export function bridalLiveClient(env = process.env) {
  const base = (env.BRIDALLIVE_BASE || 'https://qa.bridallive.com/bl-server').replace(/\/$/, '');
  const retailerId = env.BRIDALLIVE_RETAILER_ID;
  const apiKey = env.BRIDALLIVE_API_KEY;
  if (!retailerId || !apiKey) throw new Error('BridalLive is not configured: set BRIDALLIVE_RETAILER_ID and BRIDALLIVE_API_KEY.');

  let token = null, expires = 0, employee = null;

  // POST /api/auth/apiLogin -> { token, expires, employee }. Tokens last about 8 hours; we renew
  // after 7, and again on any 401.
  async function login() {
    const r = await fetch(base + '/api/auth/apiLogin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ retailerId, apiKey })
    });
    if (!r.ok) throw new Error('BridalLive login failed (' + r.status + ').');
    const d = await r.json();
    token = d.token; employee = d.employee || null;
    expires = Date.now() + 7 * 3600e3;
    return token;
  }

  async function call(method, path, body, retry = true) {
    if (!token || Date.now() > expires) await login();
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', token },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (r.status === 401 && retry) { token = null; return call(method, path, body, false); }
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      const why = data && (data.message || (data.errors && JSON.stringify(data.errors))) || text.slice(0, 200);
      const e = new Error('BridalLive ' + method + ' ' + path + ' failed (' + r.status + '): ' + why);
      e.status = r.status; throw e;
    }
    return data;
  }

  // List endpoints are POST with a filter object as the body and paging in the query string,
  // returning { page, size, total, result: [...] }.
  async function listAll(path, filter = {}, size = 200) {
    const out = [];
    for (let page = 0; ; page++) {
      const d = await call('POST', path + '?page=' + page + '&size=' + size, filter);
      const rows = (d && d.result) || [];
      out.push(...rows);
      if (!rows.length || out.length >= (d.total ?? out.length)) break;
    }
    return out;
  }

  return {
    name: 'bridallive',
    base,
    get employee() { return employee; },
    login,
    call,

    // Every inventory item with its stock. VERIFY: status 'A' (active) as the filter, and whether
    // quantityInStock or quantityOnHand is the right "can sell now" number for this shop.
    listItems: () => listAll('/api/items/list', { status: 'A' }),
    getItem: (id) => call('GET', '/api/items/' + id),

    // Contacts: find by email, or create. VERIFY: list filter on emailAddress.
    async findOrCreateContact(c) {
      const found = c.email ? await call('POST', '/api/contacts/list?page=0&size=5', { emailAddress: c.email }) : null;
      const hit = found && found.result && found.result.find((x) => (x.emailAddress || '').toLowerCase() === c.email.toLowerCase());
      if (hit) return hit;
      return call('POST', '/api/contacts', {
        firstName: c.firstName, lastName: c.lastName, emailAddress: c.email,
        mobilePhoneNumber: c.phone || '', smsOptIn: false, howHeardDescription: 'Website'
      });
    },

    // A sale with its line items. VERIFY: the typeId for an online sale, and that the
    // transaction takes the items out of stock when it is created (or only when completed).
    createTransaction: (trx) => call('POST', '/api/posTransactions', trx),
    getTransaction: (id) => call('GET', '/api/posTransactions/' + id),

    // Record a payment taken elsewhere (for example Stripe Checkout) on a transaction.
    addPayment: (trxId, payment) => call('POST', '/api/posTransactions/' + trxId + '/addPayment', payment),

    // The customer's Client Portal link. VERIFY: whether this link lets the customer pay the
    // transaction's requestedPaymentAmount online (the PortalHash model has hasPayment,
    // paymentAmount and trxId, which suggests it can).
    portalUrl: (contactId) => call('GET', '/api/contacts/' + contactId + '/generatePortalDashboardURL')
  };
}
