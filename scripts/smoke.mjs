import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const builtServerPath = path.join(
  projectRoot,
  "apps",
  "server",
  "dist",
  "index.js",
);
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "voyager-mcp-smoke-"));
const sharedDataDirectory = path.join(temporaryRoot, "data");
const expectedToolNames = ["get_current_context", "update_task"];
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined),
);

function createClient(name, dataDirectory = sharedDataDirectory) {
  const client = new Client({ name, version: "1.0.0" });
  const environment = { ...inheritedEnvironment };
  delete environment.VOYAGER_DATA_DIR;
  environment.VOYAGER_PROJECT_ID = "voyager-poc";
  if (dataDirectory !== null) {
    environment.VOYAGER_DATA_DIR = dataDirectory;
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [builtServerPath],
    cwd: temporaryRoot,
    env: environment,
  });
  return { client, transport };
}

function requireStructuredSuccess(result, label) {
  assert.notEqual(
    result.isError,
    true,
    `${label} failed: ${JSON.stringify(result.content)}`,
  );
  assert.ok(result.structuredContent, `${label} returned no structuredContent`);
  return result.structuredContent;
}

async function connectAndVerifyTools(name, dataDirectory = sharedDataDirectory) {
  const connection = createClient(name, dataDirectory);
  try {
    await connection.client.connect(connection.transport);
    await connection.client.ping();
    const listed = await connection.client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      expectedToolNames,
      `${name} did not see exactly the two Voyager tools`,
    );
    const contextTool = listed.tools.find(
      (tool) => tool.name === "get_current_context",
    );
    assert.equal(contextTool?.inputSchema.type, "object");
    assert.deepEqual(
      Object.keys(contextTool?.inputSchema.properties ?? {}).sort(),
      ["projectId", "recentActivityLimit"],
      "get_current_context did not advertise its two optional inputs",
    );
    assert.equal(
      contextTool?.inputSchema.additionalProperties,
      false,
      "get_current_context did not advertise strict object input",
    );
    return connection;
  } catch (error) {
    await connection.client.close().catch(() => undefined);
    throw error;
  }
}

let clientA;
let clientB;
let defaultPathClient;

try {
  await cp(path.join(projectRoot, "data"), sharedDataDirectory, {
    recursive: true,
  });

  defaultPathClient = await connectAndVerifyTools(
    "voyager-smoke-default-path",
    null,
  );
  const defaultPathResult = await defaultPathClient.client.callTool({
    name: "get_current_context",
  });
  const defaultPathContext = requireStructuredSuccess(
    defaultPathResult,
    "Default-path get_current_context",
  );
  assert.equal(
    defaultPathContext.project.id,
    "voyager-poc",
    "The built server did not resolve repository data from an unrelated cwd",
  );
  const unexpectedArgument = await defaultPathClient.client.callTool({
    name: "get_current_context",
    arguments: { unexpected: "must be rejected" },
  });
  assert.equal(
    unexpectedArgument.isError,
    true,
    "Unknown get_current_context input was not rejected",
  );
  await defaultPathClient.client.close();
  defaultPathClient = undefined;

  clientA = await connectAndVerifyTools("voyager-smoke-client-a");
  const beforeResult = await clientA.client.callTool({
    name: "get_current_context",
    arguments: { projectId: "voyager-poc" },
  });
  const before = requireStructuredSuccess(
    beforeResult,
    "Client A get_current_context",
  );
  const taskBefore = before.tasks.find((task) => task.id === "task-001");
  assert.ok(taskBefore, "Client A could not find task-001");

  const invalidStatus = await clientA.client.callTool({
    name: "update_task",
    arguments: {
      taskId: "task-001",
      status: "not-a-voyager-status",
      note: "The schema must reject this status.",
      actor: "voyager-smoke-client-a",
    },
  });
  assert.equal(invalidStatus.isError, true, "Invalid status was not rejected");

  const invalidTask = await clientA.client.callTool({
    name: "update_task",
    arguments: {
      taskId: "task-missing",
      status: "in_progress",
      note: "The store must reject this task ID.",
      actor: "voyager-smoke-client-a",
    },
  });
  assert.equal(invalidTask.isError, true, "Unknown task ID was not rejected");
  assert.match(
    invalidTask.content[0]?.text ?? "",
    /Unknown taskId.*get_current_context/s,
    "Unknown task error was not actionable",
  );

  const unexpectedUpdateArgument = await clientA.client.callTool({
    name: "update_task",
    arguments: {
      taskId: "task-001",
      status: "in_progress",
      note: "The strict schema must reject the extra field.",
      actor: "voyager-smoke-client-a",
      unexpected: true,
    },
  });
  assert.equal(
    unexpectedUpdateArgument.isError,
    true,
    "Unknown update_task input was not rejected",
  );

  const note = `Implementation began in Client A at ${new Date().toISOString()}.`;
  const updateResult = await clientA.client.callTool({
    name: "update_task",
    arguments: {
      taskId: "task-001",
      status: "in_progress",
      note,
      actor: "voyager-smoke-client-a",
    },
  });
  const update = requireStructuredSuccess(updateResult, "Client A update_task");
  assert.equal(update.updatedTask.status, "in_progress");
  assert.equal(update.activity.previousStatus, taskBefore.status);
  assert.equal(update.activity.newStatus, "in_progress");
  assert.equal(update.activity.actor, "voyager-smoke-client-a");
  assert.equal(update.activity.note, note);
  assert.ok(!Number.isNaN(Date.parse(update.activity.createdAt)));

  await clientA.client.close();
  clientA = undefined;

  clientB = await connectAndVerifyTools("voyager-smoke-client-b");
  const afterResult = await clientB.client.callTool({
    name: "get_current_context",
    arguments: { recentActivityLimit: 10 },
  });
  const after = requireStructuredSuccess(
    afterResult,
    "Client B get_current_context",
  );
  assert.equal(
    after.tasks.find((task) => task.id === "task-001")?.status,
    "in_progress",
    "Client B did not see Client A's task update",
  );
  const sharedActivity = after.recentActivity.find(
    (entry) =>
      entry.actor === "voyager-smoke-client-a" && entry.note === note,
  );
  assert.ok(sharedActivity, "Client B did not see Client A's activity entry");
  assert.equal(sharedActivity.id, update.activity.id);
  assert.equal(sharedActivity.createdAt, update.activity.createdAt);
  assert.match(after.summary, /voyager-smoke-client-a/);
  assert.match(after.summary, /Implementation began in Client A/);

  const invalidProject = await clientB.client.callTool({
    name: "get_current_context",
    arguments: { projectId: "not-voyager-poc" },
  });
  assert.equal(invalidProject.isError, true, "Unknown project ID was not rejected");

  const diskTasks = JSON.parse(
    await readFile(path.join(sharedDataDirectory, "tasks.json"), "utf8"),
  );
  const diskActivity = JSON.parse(
    await readFile(path.join(sharedDataDirectory, "activity.json"), "utf8"),
  );
  assert.equal(
    diskTasks.find((task) => task.id === "task-001")?.status,
    "in_progress",
  );
  assert.ok(diskActivity.some((entry) => entry.id === update.activity.id));
  assert.deepEqual(
    (await readdir(sharedDataDirectory)).filter((name) => name.endsWith(".tmp")),
    [],
  );

  process.stdout.write(
    "Two-client MCP stdio smoke passed: Client B read Client A's persisted update.\n",
  );
} finally {
  await Promise.allSettled(
    [
      defaultPathClient?.client.close(),
      clientA?.client.close(),
      clientB?.client.close(),
    ].filter(Boolean),
  );
  await rm(temporaryRoot, { recursive: true, force: true });
}
