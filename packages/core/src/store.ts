import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  ActivityFileSchema,
  GetCurrentContextInputSchema,
  ProjectFileSchema,
  TasksFileSchema,
  UpdateTaskInputSchema,
} from "./schemas.js";
import type {
  ActivityEntry,
  CurrentContext,
  GetCurrentContextInput,
  Project,
  Task,
  UpdateTaskResult,
} from "./types.js";

// The JSON store remains the local POC adapter behind the core boundary.
const DEFAULT_RECENT_ACTIVITY_LIMIT = 10;

type StoreOptions = {
  now?: () => Date;
  createId?: () => string;
  expectedProjectId?: string;
};

export class VoyagerStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VoyagerStoreError";
  }
}

export class VoyagerStore {
  readonly dataDirectory: string;

  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly expectedProjectId: string | undefined;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string, options: StoreOptions = {}) {
    this.dataDirectory = path.resolve(dataDirectory);
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.expectedProjectId = options.expectedProjectId;
  }

  async getCurrentContext(input: GetCurrentContextInput = {}): Promise<CurrentContext> {
    await this.mutationQueue;

    const parsedInput = this.parseInput(
      GetCurrentContextInputSchema,
      input,
      "Invalid get_current_context input",
    );
    const [project, tasks, activity] = await Promise.all([
      this.readProject(),
      this.readTasks(),
      this.readActivity(),
    ]);

    this.validateExpectedProject(project);

    if (parsedInput.projectId !== undefined && parsedInput.projectId !== project.id) {
      throw new VoyagerStoreError(
        `Unknown projectId "${parsedInput.projectId}". This local POC contains only "${project.id}".`,
      );
    }

    const activityLimit =
      parsedInput.recentActivityLimit ?? DEFAULT_RECENT_ACTIVITY_LIMIT;
    const activityNewestFirst = activity
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          Date.parse(right.entry.createdAt) - Date.parse(left.entry.createdAt) ||
          right.index - left.index,
      )
      .map(({ entry }) => entry);
    const recentActivity = activityNewestFirst.slice(0, activityLimit);

    return {
      project,
      currentMilestone: project.currentMilestone,
      tasks,
      blockers: project.blockers,
      recentActivity,
      summary: buildContextSummary(project, tasks, activityNewestFirst[0]),
      generatedAt: this.now().toISOString(),
    };
  }

  updateTask(input: unknown): Promise<UpdateTaskResult> {
    const update = this.mutationQueue.then(() => this.performTaskUpdate(input));
    this.mutationQueue = update.then(
      () => undefined,
      () => undefined,
    );
    return update;
  }

  private async performTaskUpdate(input: unknown): Promise<UpdateTaskResult> {
    const parsedInput = this.parseInput(
      UpdateTaskInputSchema,
      input,
      "Invalid update_task input",
    );
    const [project, tasks, activity] = await Promise.all([
      this.readProject(),
      this.readTasks(),
      this.readActivity(),
    ]);
    this.validateExpectedProject(project);
    const taskIndex = tasks.findIndex((task) => task.id === parsedInput.taskId);

    if (taskIndex === -1) {
      throw new VoyagerStoreError(
        `Unknown taskId "${parsedInput.taskId}". Call get_current_context to inspect the available task IDs.`,
      );
    }

    const previousTask = tasks[taskIndex];
    if (previousTask === undefined) {
      throw new VoyagerStoreError(
        `Task "${parsedInput.taskId}" could not be loaded from tasks.json.`,
      );
    }

    const timestamp = this.now().toISOString();
    const updatedTask: Task = {
      ...previousTask,
      status: parsedInput.status,
      updatedAt: timestamp,
    };
    const activityEntry: ActivityEntry = {
      id: `activity-${this.createId()}`,
      type: "task_updated",
      taskId: updatedTask.id,
      actor: parsedInput.actor,
      note: parsedInput.note,
      previousStatus: previousTask.status,
      newStatus: parsedInput.status,
      createdAt: timestamp,
    };

    const updatedTasks = [...tasks];
    updatedTasks[taskIndex] = updatedTask;
    const updatedActivity = [...activity, activityEntry];

    await this.persistTaskUpdate(tasks, updatedTasks, updatedActivity);

    return { updatedTask, activity: activityEntry };
  }

  private async readProject(): Promise<Project> {
    return this.readAndValidate("project.json", ProjectFileSchema);
  }

  private async readTasks(): Promise<Task[]> {
    return this.readAndValidate("tasks.json", TasksFileSchema);
  }

  private async readActivity(): Promise<ActivityEntry[]> {
    return this.readAndValidate("activity.json", ActivityFileSchema);
  }

  private validateExpectedProject(project: Project): void {
    if (
      this.expectedProjectId !== undefined &&
      project.id !== this.expectedProjectId
    ) {
      throw new VoyagerStoreError(
        `Configured project ID "${this.expectedProjectId}" does not match ` +
          `project.json ID "${project.id}" in "${this.dataDirectory}".`,
      );
    }
  }

  private async readAndValidate<T>(
    fileName: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const filePath = this.filePath(fileName);
    let text: string;

    try {
      text = await readFile(filePath, "utf8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new VoyagerStoreError(
        `Could not read ${fileName} at "${filePath}": ${reason}`,
        { cause: error },
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new VoyagerStoreError(
        `Invalid JSON in ${fileName} at "${filePath}": ${reason}`,
        { cause: error },
      );
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      throw new VoyagerStoreError(
        `Invalid Voyager data in ${fileName} at "${filePath}": ${z.prettifyError(result.error)}`,
      );
    }

    return result.data;
  }

  private parseInput<T>(
    schema: z.ZodType<T>,
    value: unknown,
    label: string,
  ): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new VoyagerStoreError(`${label}: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  }

  private async persistTaskUpdate(
    originalTasks: Task[],
    updatedTasks: Task[],
    updatedActivity: ActivityEntry[],
  ): Promise<void> {
    const tasksPath = this.filePath("tasks.json");
    const activityPath = this.filePath("activity.json");
    const stagedFiles: string[] = [];
    let tasksCommitted = false;

    try {
      const stagedTasks = await this.stageJson(tasksPath, updatedTasks);
      stagedFiles.push(stagedTasks);
      const stagedActivity = await this.stageJson(activityPath, updatedActivity);
      stagedFiles.push(stagedActivity);

      await rename(stagedTasks, tasksPath);
      tasksCommitted = true;
      stagedFiles.splice(stagedFiles.indexOf(stagedTasks), 1);

      await rename(stagedActivity, activityPath);
      stagedFiles.splice(stagedFiles.indexOf(stagedActivity), 1);
    } catch (error) {
      let rollbackError: unknown;
      if (tasksCommitted) {
        try {
          await this.atomicWriteJson(tasksPath, originalTasks);
        } catch (rollbackFailure) {
          rollbackError = rollbackFailure;
        }
      }

      const reason = error instanceof Error ? error.message : String(error);
      const rollbackDetail =
        rollbackError === undefined
          ? ""
          : ` Rollback also failed: ${
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError)
            }`;
      throw new VoyagerStoreError(
        `Could not persist task and activity JSON safely: ${reason}.${rollbackDetail}`,
        { cause: error },
      );
    } finally {
      await Promise.allSettled(
        stagedFiles.map((temporaryPath) => rm(temporaryPath, { force: true })),
      );
    }
  }

  private async atomicWriteJson(filePath: string, value: unknown): Promise<void> {
    const temporaryPath = await this.stageJson(filePath, value);
    try {
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async stageJson(filePath: string, value: unknown): Promise<string> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const json = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(temporaryPath, json, { encoding: "utf8", flag: "wx" });
    return temporaryPath;
  }

  private filePath(fileName: string): string {
    return path.join(this.dataDirectory, fileName);
  }
}

function buildContextSummary(
  project: Project,
  tasks: Task[],
  latestActivity: ActivityEntry | undefined,
): string {
  const inProgress = tasks.filter((task) => task.status === "in_progress");
  const blocked = tasks.filter((task) => task.status === "blocked");
  const nextReady = tasks.find((task) => task.status === "ready");
  const parts = [
    `${project.name} is focused on milestone "${project.currentMilestone.name}" (${project.currentMilestone.status}).`,
    `In progress: ${formatTaskList(inProgress)}.`,
    `Blocked: ${formatTaskList(blocked)}.`,
  ];

  if (latestActivity !== undefined) {
    parts.push(
      `Latest update: ${latestActivity.actor} recorded ${latestActivity.taskId} ` +
        `${latestActivity.previousStatus} -> ${latestActivity.newStatus}: ${latestActivity.note} ` +
        `(${latestActivity.createdAt}).`,
    );
  } else {
    parts.push("Latest update: no activity has been recorded yet.");
  }

  if (nextReady !== undefined) {
    parts.push(`Next ready task: ${nextReady.id} (${nextReady.title}).`);
  } else {
    parts.push("Next ready task: none.");
  }

  return parts.join(" ");
}

function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "none";
  }
  return tasks.map((task) => `${task.id} (${task.title})`).join(", ");
}
