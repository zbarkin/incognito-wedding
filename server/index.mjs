// Puts the shop API together from the environment: the real BridalLive when its keys are set,
// otherwise the stand-in (mock) one.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridalLiveClient } from './bridallive.mjs';
import { mockBridalLive } from './mock-bridallive.mjs';
import { createShopApi } from './shop-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Local keys live in .env at the repo root (git-ignored), e.g. BRIDALLIVE_API_KEY=...
try { process.loadEnvFile(join(here, '..', '.env')); } catch { /* no .env: mock mode */ }
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; } };

export async function shopApiFromEnv(env = process.env) {
  // Our catalog: copy, photos and the list of sizes. In a deployed server, CATALOG_URL points at
  // the published catalog.json instead of the file.
  const loadCatalog = env.CATALOG_URL
    ? () => fetch(env.CATALOG_URL).then((r) => r.json())
    : () => readJson(join(here, '..', 'docs', 'shop', 'catalog.json'));
  const map = await readJson(join(here, 'bridallive-map.json'), {});
  const live = env.BRIDALLIVE_MODE === 'live' || (env.BRIDALLIVE_MODE !== 'mock' && env.BRIDALLIVE_API_KEY);
  const client = live ? bridalLiveClient(env) : mockBridalLive(await loadCatalog());
  console.log('[shop-api] BridalLive: ' + (live ? client.base : 'mock (no account connected)'));
  return createShopApi({ loadCatalog, client, map, env });
}
