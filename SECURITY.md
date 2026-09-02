# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public issue.**

Instead, please use [GitHub's private vulnerability reporting](https://github.com/Digilac/simap-mcp/security/advisories/new) to submit your report.

You can expect:
- An acknowledgment within 48 hours
- A follow-up with an assessment within 7 days
- A fix timeline based on severity

## Scope

This project is an MCP server that acts as a read-only client to the public simap API. It does not handle authentication, store credentials, or process sensitive user data.

Relevant concerns include:
- Dependency vulnerabilities
- Input validation issues
- Unexpected data exposure through tool outputs
- When run remotely over HTTP (see below), unauthenticated access to the `/mcp` endpoint

## Best Practices for Users

- Keep the package updated to the latest version
- Run the server in a sandboxed environment when possible
- Review tool outputs before acting on them

## Production Deployment Guidance

- **Keep `SIMAP_MCP_DEBUG` unset (or set to an empty value) in production.** Debug mode logs the full request URL, including user-supplied search terms and filter values, to stderr. In most MCP hosts these stderr logs are captured and retained, so enabling debug in production effectively persists user queries.
- The server does not talk to simap.ch using any secrets, tokens, or API keys — do not configure any for that purpose; if you see an example asking you to set one, it is likely a phishing attempt. The only credential this project defines is `MCP_HTTP_AUTH_TOKEN`, and only you set it, to protect your own remote deployment (see [Remote HTTP Deployment](#remote-http-deployment)).
- stdout is reserved for the MCP JSON-RPC protocol; never redirect it into log files.

## Debug Mode

The `SIMAP_MCP_DEBUG` environment variable, when set to `1` or `true`, switches the HTTP client to verbose stderr logging:

- Full outbound URL (with all query parameters)
- Response status, byte size, and request duration

This is intended for local troubleshooting only. It is off by default precisely because the extra payload can contain user-intent data (search terms, CPV codes, canton filters) that should not leak into shared log infrastructure.

## Remote HTTP Deployment

The default deployment model is a local stdio process spawned by your MCP client, with no network exposure. When `PORT` is set in the environment (as on Railway and most PaaS hosts), the server instead listens over the Streamable HTTP transport (`src/http-server.ts`) so a remote MCP client (e.g. a custom connector in Claude) can reach it over the network.

- **Set `MCP_HTTP_AUTH_TOKEN` in any remote deployment.** When set, `POST /mcp` requires `Authorization: Bearer <token>`; without it, anyone who discovers the URL can invoke every tool (all of which only read public simap.ch data, but can still be used to run up your simap API traffic or probe your deployment). The server logs a stderr warning on startup if this is left unset.
- `GET /healthz` is always unauthenticated — it returns a static `ok` for platform health checks and exposes nothing else.
- Put the deployment behind HTTPS (Railway does this by default for generated domains) so the bearer token isn't sent in cleartext.
- The rate limiter (60 req/min by default) is per-process, not per-client — a shared deployment's limit is shared across everyone using it.
