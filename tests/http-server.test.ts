/**
 * Tests for the Streamable HTTP transport: bearer-token gating, health
 * check, and routing. The full MCP JSON-RPC handshake is exercised via the
 * SDK's own transport tests, so here we only verify our wiring.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import { createHttpServer, isAuthorized } from "../src/http-server.js";

describe("isAuthorized", () => {
  it("allows any request when no token is configured", () => {
    expect(isAuthorized(undefined, undefined)).toBe(true);
    expect(isAuthorized("Bearer wrong", undefined)).toBe(true);
  });

  it("requires a matching bearer header when a token is configured", () => {
    expect(isAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isAuthorized("Bearer wrong", "secret")).toBe(false);
    expect(isAuthorized(undefined, "secret")).toBe(false);
  });
});

describe("HTTP server routing", () => {
  const originalToken = process.env.MCP_HTTP_AUTH_TOKEN;
  let baseUrl: string;
  let server: ReturnType<typeof createHttpServer>;

  beforeEach(async () => {
    process.env.MCP_HTTP_AUTH_TOKEN = "test-token";
    server = createHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    if (originalToken === undefined) delete process.env.MCP_HTTP_AUTH_TOKEN;
    else process.env.MCP_HTTP_AUTH_TOKEN = originalToken;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("responds to the health check without auth", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it("rejects unauthenticated /mcp requests", async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Unauthorized");
  });

  it("rejects non-POST /mcp requests once authorized", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(405);
  });
});
