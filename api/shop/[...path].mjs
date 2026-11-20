// Vercel entry for the shop API (server/shop-api.mjs). Every /api/shop/* request lands here.
// Without BridalLive keys in the project's environment variables it runs the stand-in BridalLive.
import { shopApiFromEnv } from '../../server/index.mjs';

let api = null;
async function handle(request) {
  api = api || await shopApiFromEnv();
  return (await api(request)) || new Response('Not found', { status: 404 });
}
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
