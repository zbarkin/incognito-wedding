// Deploy target: a Cloudflare Worker (free plan covers this shop's traffic). The same
// fetch(request, env) shape also works as a Vercel or Netlify edge function.
//
//   npx wrangler deploy server/worker.mjs --name incognito-shop-api
//   npx wrangler secret put BRIDALLIVE_API_KEY        (and BRIDALLIVE_RETAILER_ID)
//   vars: BRIDALLIVE_BASE, CATALOG_URL, ALLOWED_ORIGINS, PAYMENT_MODE, PAYMENT_DUE, ...
//
// The account, the deploy and the secrets are set up by the shop (or you), not by this code.
import map from './bridallive-map.json' with { type: 'json' };
import { bridalLiveClient } from './bridallive.mjs';
import { mockBridalLive } from './mock-bridallive.mjs';
import { createShopApi } from './shop-api.mjs';

let api = null;
async function build(env) {
  const loadCatalog = () => fetch(env.CATALOG_URL).then((r) => r.json());
  const live = env.BRIDALLIVE_MODE === 'live' || (env.BRIDALLIVE_MODE !== 'mock' && env.BRIDALLIVE_API_KEY);
  const client = live ? bridalLiveClient(env) : mockBridalLive(await loadCatalog());
  return createShopApi({ loadCatalog, client, map, env });
}

export default {
  async fetch(request, env) {
    api = api || await build(env);
    return (await api(request)) || new Response('Not found', { status: 404 });
  }
};
