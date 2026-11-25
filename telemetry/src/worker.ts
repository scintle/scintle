/** Entry point. Workers treat every named export as a handler, so all logic lives in collector.ts. */

import { ingest, json, PAGE, stats, type Env } from './collector.ts';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && path === '/v1/ping') return ingest(req, env);
    if (req.method === 'GET' && path === '/v1/stats') return json(await stats(env));
    if (req.method === 'GET' && path === '/') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    return new Response(null, { status: 404 });
  },
};
