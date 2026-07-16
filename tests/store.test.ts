import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VoyagerStore } from "@project-voyager/core";

const seedDataDirectory = fileURLToPath(
  new URL("./fixtures/data", import.meta.url),
);
const fixedTimestamp = "2026-07-12T08:00:00.000Z";

describe("VoyagerStore", () => {
  let temporaryRoot: string;
  let dataDirectory: string;
  let nextId: number;
  let store: VoyagerStore;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "voyager-store-test-"));
    dataDirectory = path.join(temporaryRoot, "data");
    await cp(seedDataDirectory, dataDirectory, { recursive: true });
    nextId = 0;
    store = new VoyagerStore(dataDirectory, {
      now: () => new Date(fixedTimestamp),
      createId: () => `test-${++nextId}`,
    });
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("reads the seeded project and task data", async () => {
    const context = await store.getCurrentContext();

    expect(context.project).toMatchObject({
      id: "voyager-poc",
      name: "Project Voyager",
    });
    expect(context.currentMilestone.id).toBe("milestone-poc");
    expect(context.tasks).toHaveLength(3);
    expect(context.tasks.map((task) => task.id)).toEqual([
      "task-001",
      "task-002",
      "task-003",
    ]);
    expect(context.blockers).toEqual([]);
    expect(context.recentActivity).toEqual([]);
    expect(context.generatedAt).toBe(fixedTimestamp);
    expect(context.summary).toContain("Local continuity proof");
    expect(context.summary).toContain("Next ready task: task-001");
  });

  it("updates a valid task and appends attributed activity", async () => {
    const result = await store.updateTask({
      taskId: "task-001",
      status: "in_progress",
      note: "Started the shared MCP implementation.",
      actor: "client-a",
    });

    expect(result.updatedTask.status).toBe("in_progress");
    expect(result.updatedTask.updatedAt).toBe(fixedTimestamp);
    expect(result.activity).toEqual({
      id: "activity-test-1",
      type: "task_updated",
      taskId: "task-001",
      actor: "client-a",
      note: "Started the shared MCP implementation.",
      previousStatus: "ready",
      newStatus: "in_progress",
      createdAt: fixedTimestamp,
    });

    const tasksOnDisk = JSON.parse(
      await readFile(path.join(dataDirectory, "tasks.json"), "utf8"),
    ) as Array<{ id: string; status: string }>;
    const activityOnDisk = JSON.parse(
      await readFile(path.join(dataDirectory, "activity.json"), "utf8"),
    ) as Array<Record<string, unknown>>;

    expect(tasksOnDisk.find((task) => task.id === "task-001")?.status).toBe(
      "in_progress",
    );
    expect(activityOnDisk).toContainEqual(result.activity);
  });

  it("preserves existing task fields", async () => {
    const tasksPath = path.join(dataDirectory, "tasks.json");
    const tasks = JSON.parse(await readFile(tasksPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    const firstTask = tasks[0];
    if (firstTask === undefined) {
      throw new Error("Seed task missing");
    }
    firstTask.title = "  Create local MCP server  ";
    firstTask.priority = " high ";
    firstTask.clientHint = "preserve this field";
    await writeFile(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");

    const result = await store.updateTask({
      taskId: "task-001",
      status: "in_progress",
      note: "Testing field preservation.",
      actor: "test-client",
    });

    expect(result.updatedTask).toMatchObject({
      id: "task-001",
      title: "  Create local MCP server  ",
      description: "Expose shared Voyager project context over MCP.",
      priority: " high ",
      clientHint: "preserve this field",
      status: "in_progress",
      updatedAt: fixedTimestamp,
    });
  });

  it("rejects an unknown task ID without changing the files", async () => {
    const tasksBefore = await readFile(path.join(dataDirectory, "tasks.json"), "utf8");
    const activityBefore = await readFile(
      path.join(dataDirectory, "activity.json"),
      "utf8",
    );

    await expect(
      store.updateTask({
        taskId: "task-does-not-exist",
        status: "done",
        note: "This should fail.",
        actor: "test-client",
      }),
    ).rejects.toThrow(/Unknown taskId.*get_current_context/s);

    expect(await readFile(path.join(dataDirectory, "tasks.json"), "utf8")).toBe(
      tasksBefore,
    );
    expect(
      await readFile(path.join(dataDirectory, "activity.json"), "utf8"),
    ).toBe(activityBefore);
  });

  it("rejects an unsupported status", async () => {
    await expect(
      store.updateTask({
        taskId: "task-001",
        status: "started",
        note: "This should fail.",
        actor: "test-client",
      }),
    ).rejects.toThrow(/Invalid update_task input.*status/s);
  });

  it.each([
    ["actor", { actor: "   ", note: "A useful note." }],
    ["note", { actor: "test-client", note: "\n\t " }],
  ])("rejects a whitespace-only %s", async (_field, values) => {
    await expect(
      store.updateTask({
        taskId: "task-001",
        status: "in_progress",
        ...values,
      }),
    ).rejects.toThrow(/Invalid update_task input/);
  });

  it("records same-status progress notes", async () => {
    const result = await store.updateTask({
      taskId: "task-001",
      status: "ready",
      note: "Clarified the implementation approach while keeping the task ready.",
      actor: "client-a",
    });

    expect(result.updatedTask.status).toBe("ready");
    expect(result.activity.previousStatus).toBe("ready");
    expect(result.activity.newStatus).toBe("ready");
    const activity = JSON.parse(
      await readFile(path.join(dataDirectory, "activity.json"), "utf8"),
    ) as unknown[];
    expect(activity).toHaveLength(1);
  });

  it("returns limited activity newest first while the summary uses the latest update", async () => {
    let minute = 0;
    store = new VoyagerStore(dataDirectory, {
      now: () => new Date(`2026-07-12T08:0${minute++}:00.000Z`),
      createId: () => `ordered-${minute}`,
    });
    await store.updateTask({
      taskId: "task-001",
      status: "in_progress",
      note: "First update.",
      actor: "client-a",
    });
    await store.updateTask({
      taskId: "task-001",
      status: "blocked",
      note: "Second update.",
      actor: "client-b",
    });

    const context = await store.getCurrentContext({ recentActivityLimit: 1 });
    expect(context.recentActivity).toHaveLength(1);
    expect(context.recentActivity[0]?.note).toBe("Second update.");
    expect(context.summary).toContain("client-b");
    expect(context.summary).toContain("Second update.");

    const noActivity = await store.getCurrentContext({ recentActivityLimit: 0 });
    expect(noActivity.recentActivity).toEqual([]);
    expect(noActivity.summary).toContain("Second update.");
  });

  it("uses append order when activity timestamps are identical", async () => {
    await store.updateTask({
      taskId: "task-001",
      status: "in_progress",
      note: "First same-time update.",
      actor: "client-a",
    });
    await store.updateTask({
      taskId: "task-001",
      status: "blocked",
      note: "Second same-time update.",
      actor: "client-b",
    });

    const context = await store.getCurrentContext({ recentActivityLimit: 1 });
    expect(context.recentActivity[0]?.note).toBe("Second same-time update.");
    expect(context.summary).toContain("Second same-time update.");
  });

  it("validates project IDs and activity limits", async () => {
    await expect(
      store.getCurrentContext({ projectId: "another-project" }),
    ).rejects.toThrow(/Unknown projectId.*voyager-poc/s);
    await expect(
      store.getCurrentContext({ recentActivityLimit: -1 }),
    ).rejects.toThrow(/Invalid get_current_context input/);
    await expect(
      store.getCurrentContext({ recentActivityLimit: 1.5 }),
    ).rejects.toThrow(/Invalid get_current_context input/);
  });

  it("rejects reads and writes when storage belongs to another configured project", async () => {
    store = new VoyagerStore(dataDirectory, {
      expectedProjectId: "another-project",
    });

    await expect(store.getCurrentContext()).rejects.toThrow(
      /Configured project ID.*another-project.*voyager-poc/s,
    );
    await expect(
      store.updateTask({
        taskId: "task-001",
        status: "in_progress",
        note: "This must not be written to the wrong project.",
        actor: "test-client",
      }),
    ).rejects.toThrow(/Configured project ID.*another-project.*voyager-poc/s);
  });

  it("leaves readable, formatted JSON and no temporary files after writes", async () => {
    await store.updateTask({
      taskId: "task-001",
      status: "in_progress",
      note: "First atomic write.",
      actor: "client-a",
    });
    await store.updateTask({
      taskId: "task-002",
      status: "ready",
      note: "Second atomic write.",
      actor: "client-b",
    });

    for (const fileName of ["project.json", "tasks.json", "activity.json"]) {
      const text = await readFile(path.join(dataDirectory, fileName), "utf8");
      expect(() => JSON.parse(text)).not.toThrow();
      expect(text.endsWith("\n")).toBe(true);
      expect(text).toContain("\n  ");
    }

    expect((await readdir(dataDirectory)).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    );
  });

  it("reports malformed and missing data files with actionable paths", async () => {
    const tasksPath = path.join(dataDirectory, "tasks.json");
    await writeFile(tasksPath, "{ definitely not JSON", "utf8");
    await expect(store.getCurrentContext()).rejects.toThrow(
      /Invalid JSON in tasks\.json.*tasks\.json/s,
    );

    await rm(tasksPath);
    await expect(store.getCurrentContext()).rejects.toThrow(
      /Could not read tasks\.json.*tasks\.json/s,
    );
  });

  it("rejects padded stored IDs instead of making them impossible to address", async () => {
    const tasksPath = path.join(dataDirectory, "tasks.json");
    const tasks = JSON.parse(await readFile(tasksPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    const firstTask = tasks[0];
    if (firstTask === undefined) {
      throw new Error("Seed task missing");
    }
    firstTask.id = " task-001 ";
    await writeFile(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");

    await expect(store.getCurrentContext()).rejects.toThrow(
      /Invalid Voyager data in tasks\.json.*surrounding whitespace/s,
    );
  });
});
