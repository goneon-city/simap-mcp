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
const port = process.env.PORT;

const run = port ? startHttpServer(Number(port)) : startServer();

run.catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
