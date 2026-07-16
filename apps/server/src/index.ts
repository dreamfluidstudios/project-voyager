#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { VoyagerStore } from "@project-voyager/core";
import { createVoyagerServer } from "@project-voyager/mcp";

import { resolveServerConfiguration } from "./config.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDirectory = path.resolve(moduleDirectory, "../../..", "data");
const configuration = resolveServerConfiguration({ defaultDataDirectory });
if (!existsSync(configuration.dataDirectory)) {
  process.stderr.write(
    `Project Voyager data directory was not found: ${configuration.dataDirectory}\n`,
  );
}

const server = createVoyagerServer(
  new VoyagerStore(configuration.dataDirectory, {
    expectedProjectId: configuration.expectedProjectId,
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Project Voyager MCP server failed: ${message}\n`);
  process.exitCode = 1;
});
