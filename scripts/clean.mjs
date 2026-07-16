import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectories = [
  path.join(projectRoot, "dist"),
  path.join(projectRoot, "apps", "server", "dist"),
  path.join(projectRoot, "packages", "core", "dist"),
  path.join(projectRoot, "packages", "mcp", "dist"),
];

await Promise.all(
  outputDirectories.map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ),
);
