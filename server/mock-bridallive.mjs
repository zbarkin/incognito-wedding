// A stand-in BridalLive with the same methods as bridallive.mjs, so the whole shop flow (stock,
// order, payment) runs before the shop has API access. Items come from our own catalog, one per
// size and colour, with made-up stock. Orders take stock off, the way the real one should.
// Nothing is saved: restarting the server resets it.

export function mockBridalLive(catalog, { payBase = '/api/shop/mock-pay' } = {}) {
  const items = [], contacts = [], trxs = [];
  let nextItem = 5001, nextContact = 9001, nextTrx = 70001;

  // Stable fake stock: most sizes 1 to 4, a few sold out, and the catalog's sold-out sizes at 0.
  const stock = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 9 === 0 ? 0 : 1 + (h % 4); };
  for (const p of catalog.products) for (const v of p.variants) {
    const qty = v.available === false ? 0 : stock(v.id);
    items.push({
      id: nextItem++, name: p.title, vendorItemName: p.title, departmentName: p.type === 'suit' ? 'Suits' : 'Accessories',
      size: v.size, sizeString: v.size, color: v.color || '', colorString: v.color || '',
      regularPrice: v.price ?? p.price, currentPrice: v.price ?? p.price, status: 'A',
      inventoryItem: true, quantityInStock: qty, quantityOnHand: qty
    });
  }

  const delay = (x) => new Promise((r) => setTimeout(() => r(structuredClone(x)), 15));

  return {
    name: 'mock',
    employee: { id: 1, firstName: 'Website' },
    listItems: () => delay(items),
    getItem: (id) => delay(items.find((i) => i.id === Number(id)) || null),

    async findOrCreateContact(c) {
      let hit = contacts.find((x) => x.emailAddress.toLowerCase() === c.email.toLowerCase());
      if (!hit) contacts.push(hit = { id: nextContact++, firstName: c.firstName, lastName: c.lastName, emailAddress: c.email, mobilePhoneNumber: c.phone || '' });
      return delay(hit);
    },

    async createTransaction(trx) {
      for (const li of trx.lineItems) {
        const it = items.find((i) => i.id === li.inventoryItemId);
        if (!it || it.quantityInStock < li.quantity) { const e = new Error('Not enough stock for item ' + li.inventoryItemId); e.status = 409; throw e; }
      }
      for (const li of trx.lineItems) { const it = items.find((i) => i.id === li.inventoryItemId); it.quantityInStock -= li.quantity; it.quantityOnHand -= li.quantity; }
      const total = trx.lineItems.reduce((a, l) => a + l.price * l.quantity, 0);
      const who = contacts.find((c) => c.id === trx.contactId);
      const t = { ...trx, contact: who && { id: who.id, emailAddress: who.emailAddress }, id: nextTrx++, trxNumber: trxs.length + 1001, status: 'Pending', totalAmount: total, totalPaymentAmount: 0, balanceDue: total, payments: [] };
      trxs.push(t);
      return delay(t);
    },
    getTransaction: (id) => delay(trxs.find((t) => t.id === Number(id)) || null),

    async addPayment(trxId, payment) {
      const t = trxs.find((x) => x.id === Number(trxId));
      if (!t) { const e = new Error('No such transaction'); e.status = 404; throw e; }
      t.payments.push({ ...payment, id: t.payments.length + 1 });
      t.totalPaymentAmount += payment.amount; t.balanceDue = Math.max(0, t.totalAmount - t.totalPaymentAmount);
      return delay(t);
    },

    // The real portal link opens BridalLive's Client Portal. Ours opens a local test payment page.
    async portalUrl(contactId) {
      const t = [...trxs].reverse().find((x) => x.contactId === contactId);
      return delay({ contactId, trxId: t && t.id, hasPayment: true, paymentAmount: t && t.requestedPaymentAmount, url: payBase + '?trx=' + (t && t.id) });
    }
  };
}
