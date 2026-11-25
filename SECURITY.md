# Security

Please report security problems privately through
[GitHub's private vulnerability reporting](https://github.com/scintle/scintle/security/advisories/new),
not as a public issue.

Worth reporting:

- anything that lets another process or website reach the board or its API (it listens on `127.0.0.1` and
  requires a token);
- a secret that survives redaction into Scintle's database, the model call, or diagnostics;
- the plugin reading outside `~/.claude` and the folders you added;
- the usage count sending anything beyond its published schema (`server/telemetry-schema.ts`).

We'll acknowledge within a few days and credit you in the changelog unless you'd rather we didn't.
