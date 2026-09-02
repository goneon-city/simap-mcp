---
"@digilac/simap-mcp": minor
---

`src/http-server.ts`: add a Streamable HTTP transport, used automatically when `PORT` is set in the environment, so the server can be deployed remotely (e.g. on Railway) instead of only being spawned locally over stdio. `MCP_HTTP_AUTH_TOKEN` is required whenever `PORT` is set — the server refuses to start over HTTP without it unless `MCP_HTTP_ALLOW_ANONYMOUS=1` is explicitly set — and gates `/mcp` with a bearer-token check; `GET /healthz` is available for platform health checks. `src/api/rate-limiter.ts`'s `acquire()` now accepts an `AbortSignal` so a request queued behind others on the shared rate limiter still times out instead of waiting indefinitely (wired up in `src/api/client.ts`). Added a `Dockerfile` (runs as a non-root user) and `railway.json` for container-based deployment.
