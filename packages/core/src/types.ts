// Shared core types are transport-agnostic and reusable by every Voyager app.
export const TASK_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Milestone = {
  id: string;
  name: string;
  status: string;
} & Record<string, unknown>;

export type Project = {
  id: string;
  name: string;
  summary: string;
  currentMilestone: Milestone;
  blockers: unknown[];
  updatedAt: string;
} & Record<string, unknown>;

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  updatedAt: string;
} & Record<string, unknown>;

export type ActivityEntry = {
  id: string;
  type: "task_updated";
  taskId: string;
  actor: string;
  note: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  createdAt: string;
} & Record<string, unknown>;

export type GetCurrentContextInput = {
  projectId?: string;
  recentActivityLimit?: number;
};

export type CurrentContext = {
  project: Project;
  currentMilestone: Milestone;
  tasks: Task[];
  blockers: unknown[];
  recentActivity: ActivityEntry[];
  summary: string;
  generatedAt: string;
};

export type UpdateTaskInput = {
  taskId: string;
  status: TaskStatus;
  note: string;
  actor: string;
};

export type UpdateTaskResult = {
  updatedTask: Task;
  activity: ActivityEntry;
};
