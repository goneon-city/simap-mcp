---
"@digilac/simap-mcp": minor
---

`src/http-server.ts`: add a Streamable HTTP transport, used automatically when `PORT` is set in the environment, so the server can be deployed remotely (e.g. on Railway) instead of only being spawned locally over stdio. Set `MCP_HTTP_AUTH_TOKEN` to require a bearer token on the `/mcp` endpoint; `GET /healthz` is available for platform health checks. Added a `Dockerfile` and `railway.json` for container-based deployment.
