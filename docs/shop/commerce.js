// Incognito shop: the commerce layer the Shop page talks to.
//
// The page only ever calls window.IncognitoCommerce (catalog, cart, checkout). Which store sits
// behind it is set in CONFIG below:
//   provider: 'local'   - catalog from catalog.json, cart kept in this browser, checkout not
//                         connected. This is what the preview runs today.
//   provider: 'shopify' - catalog and cart through the Shopify Storefront API, checkout on
//                         Shopify's hosted checkout. Written and ready, but switched off until
//                         the shop has a Shopify store and a Storefront access token.
//
// To connect Shopify later:
//   1. Create the products in Shopify (catalog.json has every product, variant and image).
//   2. Put each Shopify variant ID in catalog.json as shopifyVariantId (and shopifyProductId).
//   3. Create a Storefront API access token (Shopify admin > Apps > Develop apps).
//      It is a public, read-and-cart-only token, made to live in browser code.
//   4. Set provider to 'shopify' and fill in shopDomain and storefrontToken.
(function () {
  var CONFIG = {
    provider: 'local',
    // Next to this script, so pages at any depth find it.
    catalogUrl: document.currentScript ? new URL('catalog.json', document.currentScript.src).href : '../shop/catalog.json',
    shopDomain: '',          // e.g. 'incognito-menswear.myshopify.com'
    storefrontToken: '',     // Storefront API public access token
    apiVersion: '2025-01',
    cartKey: 'incognito-cart-v1'
  };

  var catalogPromise = null;
  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(CONFIG.catalogUrl).then(function (r) {
        if (!r.ok) throw new Error('Could not load the catalog (' + r.status + ').');
        return r.json();
      });
    }
    return catalogPromise;
  }

  // ---- Cart storage (local provider) -------------------------------------------------
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CONFIG.cartKey)) || { lines: [] }; } catch (e) { return { lines: [] }; }
  }
  function writeCart(cart) {
    try { localStorage.setItem(CONFIG.cartKey, JSON.stringify(cart)); } catch (e) { /* private mode: cart lives for this page only */ }
    listeners.forEach(function (fn) { fn(cart); });
    return cart;
  }
  var memoryCart = null;
  function getCart() { if (!memoryCart) memoryCart = readCart(); return memoryCart; }
  var listeners = [];

  function findVariant(catalog, variantId) {
    for (var i = 0; i < catalog.products.length; i++) {
      var p = catalog.products[i];
      for (var j = 0; j < p.variants.length; j++) if (p.variants[j].id === variantId) return { product: p, variant: p.variants[j] };
    }
    return null;
  }

  var local = {
    name: 'local',
    connected: false,
    getCatalog: loadCatalog,
    getCart: function () { return Promise.resolve(getCart()); },
    addToCart: function (variantId, quantity) {
      return loadCatalog().then(function (catalog) {
        var hit = findVariant(catalog, variantId);
        if (!hit) throw new Error('That size isn’t in the catalog.');
        if (!hit.variant.available) throw new Error('That size is sold out.');
        var cart = getCart();
        var line = cart.lines.filter(function (l) { return l.variantId === variantId; })[0];
        if (line) line.quantity += quantity || 1;
        else cart.lines.push({ variantId: variantId, handle: hit.product.handle, title: hit.product.title, size: hit.variant.size, color: hit.variant.color, price: hit.variant.price, image: hit.product.images[0] && hit.product.images[0].src, quantity: quantity || 1 });
        return writeCart(cart);
      });
    },
    updateLine: function (variantId, quantity) {
      var cart = getCart();
      cart.lines = cart.lines.map(function (l) { if (l.variantId === variantId) l.quantity = quantity; return l; }).filter(function (l) { return l.quantity > 0; });
      return Promise.resolve(writeCart(cart));
    },
    clearCart: function () { memoryCart = { lines: [] }; return Promise.resolve(writeCart(memoryCart)); },
    checkout: function () {
      return Promise.resolve({ ok: false, reason: 'not-connected', message: 'Online checkout isn’t connected yet. Your cart is saved in this browser.' });
    }
  };

  // ---- Shopify Storefront API (ready, not active) ------------------------------------
  function storefront(query, variables) {
    return fetch('https://' + CONFIG.shopDomain + '/api/' + CONFIG.apiVersion + '/graphql.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': CONFIG.storefrontToken },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.errors) throw new Error(res.errors[0].message);
      return res.data;
    });
  }
  var CART_FIELDS = 'id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } } lines(first: 50) { nodes { id quantity merchandise { ... on ProductVariant { id title product { handle title } } } } }';
  var shopify = {
    name: 'shopify',
    connected: true,
    // The page keeps reading catalog.json for copy and images; live availability comes from Shopify.
    getCatalog: loadCatalog,
    getCart: function () {
      var id = localStorage.getItem(CONFIG.cartKey + '-shopify');
      if (!id) return Promise.resolve({ lines: [] });
      return storefront('query($id: ID!) { cart(id: $id) { ' + CART_FIELDS + ' } }', { id: id }).then(function (d) { return d.cart || { lines: [] }; });
    },
    addToCart: function (variantId, quantity) {
      return loadCatalog().then(function (catalog) {
        var hit = findVariant(catalog, variantId);
        if (!hit || !hit.variant.shopifyVariantId) throw new Error('This size isn’t linked to Shopify yet.');
        var line = [{ merchandiseId: hit.variant.shopifyVariantId, quantity: quantity || 1 }];
        var id = localStorage.getItem(CONFIG.cartKey + '-shopify');
        if (!id) {
          return storefront('mutation($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { ' + CART_FIELDS + ' } userErrors { message } } }', { lines: line })
            .then(function (d) { localStorage.setItem(CONFIG.cartKey + '-shopify', d.cartCreate.cart.id); return d.cartCreate.cart; });
        }
        return storefront('mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { ' + CART_FIELDS + ' } userErrors { message } } }', { id: id, lines: line })
          .then(function (d) { return d.cartLinesAdd.cart; });
      });
    },
    updateLine: function (lineId, quantity) {
      var id = localStorage.getItem(CONFIG.cartKey + '-shopify');
      return storefront('mutation($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { ' + CART_FIELDS + ' } } }', { id: id, lines: [{ id: lineId, quantity: quantity }] })
        .then(function (d) { return d.cartLinesUpdate.cart; });
    },
    clearCart: function () { localStorage.removeItem(CONFIG.cartKey + '-shopify'); return Promise.resolve({ lines: [] }); },
    checkout: function () {
      return this.getCart().then(function (cart) {
        if (!cart.checkoutUrl) return { ok: false, reason: 'empty', message: 'Your cart is empty.' };
        return { ok: true, url: cart.checkoutUrl };
      });
    }
  };

  var api = CONFIG.provider === 'shopify' && CONFIG.shopDomain && CONFIG.storefrontToken ? shopify : local;
  api.onCartChange = function (fn) { listeners.push(fn); };
  api.config = { provider: api.name, connected: api.connected };
  window.IncognitoCommerce = api;
})();
