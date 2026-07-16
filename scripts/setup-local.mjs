import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const serverPath = path.join(projectRoot, "apps", "server", "dist", "index.js");
const dataDirectory = path.join(projectRoot, "data");
const codexBlockStart = "# BEGIN PROJECT VOYAGER LOCAL SETUP";
const codexBlockEnd = "# END PROJECT VOYAGER LOCAL SETUP";

await access(serverPath).catch(() => {
  throw new Error(
    `Built MCP server not found at "${serverPath}". Run npm run build first.`,
  );
});

const project = JSON.parse(
  await readFile(path.join(dataDirectory, "project.json"), "utf8"),
);
if (typeof project.id !== "string" || project.id.trim().length === 0) {
  throw new Error("data/project.json must contain a non-blank project ID.");
}

const tokens = new Map([
  ["{{NODE_COMMAND}}", process.execPath],
  ["{{SERVER_PATH}}", serverPath],
  ["{{PROJECT_ROOT}}", projectRoot],
  ["{{DATA_DIRECTORY}}", dataDirectory],
  ["{{PROJECT_ID}}", project.id],
  ["{{NODE_COMMAND_TOML}}", tomlString(process.execPath)],
  ["{{SERVER_PATH_TOML}}", tomlString(serverPath)],
  ["{{PROJECT_ROOT_TOML}}", tomlString(projectRoot)],
  ["{{DATA_DIRECTORY_TOML}}", tomlString(dataDirectory)],
  ["{{PROJECT_ID_TOML}}", tomlString(project.id)],
]);

const configurations = [
  {
    name: "Claude Code",
    templatePath: path.join(
      projectRoot,
      "integrations",
      "claude-code-plugin",
      "mcp.template.json",
    ),
    targetPath: path.join(projectRoot, ".mcp.json"),
    rootKey: "mcpServers",
  },
  {
    name: "Cursor",
    templatePath: path.join(
      projectRoot,
      "integrations",
      "cursor",
      "mcp.template.json",
    ),
    targetPath: path.join(projectRoot, ".cursor", "mcp.json"),
    rootKey: "mcpServers",
  },
  {
    name: "Visual Studio Code",
    templatePath: path.join(
      projectRoot,
      "integrations",
      "manual-mcp",
      "vscode.mcp.template.json",
    ),
    targetPath: path.join(projectRoot, ".vscode", "mcp.json"),
    rootKey: "servers",
  },
  {
    name: "Claude Desktop snippet",
    templatePath: path.join(
      projectRoot,
      "integrations",
      "manual-mcp",
      "claude-desktop.mcp.template.json",
    ),
    targetPath: path.join(
      projectRoot,
      ".claude",
      "claude-desktop-mcp.json",
    ),
    rootKey: "mcpServers",
  },
];

for (const configuration of configurations) {
  const template = JSON.parse(
    await readFile(configuration.templatePath, "utf8"),
  );
  const generated = replaceTokens(template);
  const existing = await readExistingConfiguration(configuration.targetPath);
  const existingServers = objectAt(existing, configuration.rootKey);
  const generatedServers = objectAt(generated, configuration.rootKey);

  existing[configuration.rootKey] = {
    ...existingServers,
    ...generatedServers,
  };

  await mkdir(path.dirname(configuration.targetPath), { recursive: true });
  await writeFile(
    configuration.targetPath,
    `${JSON.stringify(existing, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Configured ${configuration.name}: ${configuration.targetPath}\n`,
  );
}

const codexTemplatePath = path.join(
  projectRoot,
  "integrations",
  "codex-plugin",
  "config.template.toml",
);
const codexTargetPath = path.join(projectRoot, ".codex", "config.toml");
const codexTemplate = await readFile(codexTemplatePath, "utf8");
const codexBlock = replaceTextTokens(codexTemplate).trim();
await mergeManagedCodexBlock(codexTargetPath, codexBlock);
process.stdout.write(`Configured Codex: ${codexTargetPath}\n`);

process.stdout.write(
  [
    "",
    "Local Voyager MCP values for user-level clients:",
    `  Node: ${process.execPath}`,
    `  Server: ${serverPath}`,
    `  Data: ${dataDirectory}`,
    `  Project ID: ${project.id}`,
    `Claude Desktop snippet: ${path.join(
      projectRoot,
      ".claude",
      "claude-desktop-mcp.json",
    )}`,
    "Claude Desktop still requires a manual add/import step; the other local clients are project-configured.",
    "See integrations/manual-mcp/README.md for verification and reconnect steps.",
    "",
  ].join("\n"),
);

function replaceTokens(value) {
  if (typeof value === "string") {
    return tokens.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(replaceTokens);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceTokens(entry)]),
    );
  }
  return value;
}

function replaceTextTokens(text) {
  let result = text;
  for (const [token, value] of tokens) {
    result = result.replaceAll(token, value);
  }
  const unresolved = result.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (unresolved !== null) {
    throw new Error(`Unresolved setup template tokens: ${unresolved.join(", ")}`);
  }
  return result;
}

async function readExistingConfiguration(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    if (!isObject(value)) {
      throw new Error("the root value must be a JSON object");
    }
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not safely update existing configuration at "${filePath}": ${reason}`,
      { cause: error },
    );
  }
}

function objectAt(value, key) {
  const nested = value[key];
  if (nested === undefined) {
    return {};
  }
  if (!isObject(nested)) {
    throw new Error(`Configuration property "${key}" must be a JSON object.`);
  }
  return nested;
}

async function mergeManagedCodexBlock(filePath, generatedBlock) {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read Codex configuration at "${filePath}": ${reason}`, {
        cause: error,
      });
    }
  }

  const startIndex = existing.indexOf(codexBlockStart);
  const endIndex = existing.indexOf(codexBlockEnd);
  if ((startIndex === -1) !== (endIndex === -1) || endIndex < startIndex) {
    throw new Error(
      `Codex configuration at "${filePath}" contains an incomplete Voyager managed block.`,
    );
  }

  let updated;
  if (startIndex !== -1) {
    const afterBlock = endIndex + codexBlockEnd.length;
    updated = `${existing.slice(0, startIndex)}${generatedBlock}${existing.slice(afterBlock)}`;
  } else {
    if (/^\s*\[mcp_servers\.project-voyager(?:\.|\])/m.test(existing)) {
      throw new Error(
        `Codex configuration at "${filePath}" already defines project-voyager outside the managed block.`,
      );
    }
    const prefix = existing.trimEnd();
    updated = prefix.length === 0 ? generatedBlock : `${prefix}\n\n${generatedBlock}`;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${updated.trimEnd()}\n`, "utf8");
}

function tomlString(value) {
  return JSON.stringify(value);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
