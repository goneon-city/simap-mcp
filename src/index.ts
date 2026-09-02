#!/usr/bin/env node

/**
 * simap MCP Server
 *
 * A Model Context Protocol server for interacting with simap.ch,
 * Switzerland's public procurement platform.
 */

import { startServer } from "./server.js";
import { startHttpServer } from "./http-server.js";

/**
 * Railway (and most PaaS hosts) set PORT to indicate the server must accept
 * network connections; local MCP clients spawn this process over stdio and
 * leave PORT unset.
 */
const portEnv = process.env.PORT;

async function run(): Promise<void> {
  if (portEnv === undefined) return startServer();

  const port = Number(portEnv);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: "${portEnv}"`);
  }
  return startHttpServer(port).then(() => undefined);
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
