# Scintle usage-count collector

A Cloudflare Worker that receives the opt-in daily message described in D26 (`context/decisions.md`) and
keeps only totals. The message format lives in `server/telemetry-schema.ts`, shared with the client.

- `POST /v1/ping`: validates the message, adds 1 to that day's counters in D1, returns 204. Nothing else is stored.
- `GET /v1/stats` and `GET /`: the public totals. Breakdowns hide groups under 10.

Request logging is off (`[observability] enabled = false`), and the code never reads the IP, headers or
`request.cf`.

## Deploy (free plan)

```sh
cd telemetry && npm install
export WRANGLER_SEND_METRICS=false        # wrangler has its own telemetry
npx wrangler login
npx wrangler d1 create scintle-telemetry  # paste the id into wrangler.toml
npm run deploy                            # applies migrations, then deploys
```

Then build releases with that address, which compiles it into `server/telemetry.ts`:

```sh
TELEMETRY_ENDPOINT=https://scintle-telemetry.<account>.workers.dev/v1/ping scripts/build-release.sh <ref> <version> dist
```

## Try it locally

```sh
npm run migrate:local && npm run dev   # http://localhost:8787
SCINTLE_TELEMETRY_ENDPOINT=http://localhost:8787/v1/ping   # point a dev Scintle at it
```
