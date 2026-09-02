/**
 * Streamable HTTP transport for the MCP server, used when deployed as a
 * remote (network-reachable) service instead of being spawned over stdio.
 */

import {
  createServer as createNodeHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";

/**
 * Checks a request's `Authorization` header against the expected bearer token.
 * When no token is configured, every request is authorized (open access).
 */
export function isAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) return true;
  return authorizationHeader === `Bearer ${expectedToken}`;
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req.headers.authorization, process.env.MCP_HTTP_AUTH_TOKEN)) {
    sendJsonRpcError(res, 401, "Unauthorized");
    return;
  }

  if (req.method !== "POST") {
    sendJsonRpcError(res, 405, "Method not allowed. Use POST.");
    return;
  }

  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, "Internal server error");
    }
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const path = (req.url ?? "/").split("?")[0];

  if (path === HEALTH_PATH) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (path !== MCP_PATH) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  void handleMcpRequest(req, res);
}

/** Builds the underlying Node HTTP server without starting it. Exported for tests. */
export function createHttpServer(): Server {
  return createNodeHttpServer(handleRequest);
}

/** Starts the MCP server with the Streamable HTTP transport, listening on `port`. */
export async function startHttpServer(port: number): Promise<Server> {
  const httpServer = createHttpServer();
  if (!process.env.MCP_HTTP_AUTH_TOKEN) {
    console.error(
      "Warning: MCP_HTTP_AUTH_TOKEN is not set; the /mcp endpoint is open to anyone who can reach it."
    );
  }
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.error(
        `simap MCP Server listening on port ${port} (Streamable HTTP, ${MCP_PATH})`
      );
      resolve(httpServer);
    });
  });
}
