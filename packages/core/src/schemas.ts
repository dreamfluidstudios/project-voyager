import { z } from "zod";

import { TASK_STATUSES } from "./types.js";

const TrimmedNonBlankIdSchema = z.string().trim().min(1).max(200);
const StoredNonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");
const StoredNonBlankIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => value === value.trim(),
    "Must not contain surrounding whitespace",
  );
const IsoTimestampSchema = z.string().datetime({ offset: true });

export const TaskStatusSchema = z.enum(TASK_STATUSES);

export const MilestoneSchema = z
  .object({
    id: StoredNonBlankIdSchema,
    name: StoredNonBlankStringSchema,
    status: StoredNonBlankStringSchema,
  })
  .passthrough();

export const ProjectSchema = z
  .object({
    id: StoredNonBlankIdSchema,
    name: StoredNonBlankStringSchema,
    summary: z.string(),
    currentMilestone: MilestoneSchema,
    blockers: z.array(z.unknown()),
    updatedAt: IsoTimestampSchema,
  })
  .passthrough();

export const TaskSchema = z
  .object({
    id: StoredNonBlankIdSchema,
    title: StoredNonBlankStringSchema,
    description: z.string(),
    status: TaskStatusSchema,
    priority: StoredNonBlankStringSchema,
    updatedAt: IsoTimestampSchema,
  })
  .passthrough();

export const ActivityEntrySchema = z
  .object({
    id: StoredNonBlankIdSchema,
    type: z.literal("task_updated"),
    taskId: StoredNonBlankIdSchema,
    actor: z
      .string()
      .max(100)
      .refine((value) => value.trim().length > 0, "Must not be blank"),
    note: z
      .string()
      .max(2_000)
      .refine((value) => value.trim().length > 0, "Must not be blank"),
    previousStatus: TaskStatusSchema,
    newStatus: TaskStatusSchema,
    createdAt: IsoTimestampSchema,
  })
  .passthrough();

export const ProjectFileSchema = ProjectSchema;
export const TasksFileSchema = z.array(TaskSchema);
export const ActivityFileSchema = z.array(ActivityEntrySchema);

export const GetCurrentContextInputSchema = z
  .object({
    projectId: TrimmedNonBlankIdSchema.optional().describe(
      "Project identifier. This POC supports voyager-poc.",
    ),
    recentActivityLimit: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Maximum recent activity entries to return, newest first."),
  })
  .strict();

export const UpdateTaskInputSchema = z
  .object({
    taskId: TrimmedNonBlankIdSchema.describe("Identifier of the task to update."),
    status: TaskStatusSchema.describe("New task status."),
    note: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .describe("Meaningful progress context for the shared activity history."),
    actor: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe("Recognizable name of the AI client or person making the update."),
  })
  .strict();

export const CurrentContextSchema = z.object({
  project: ProjectSchema,
  currentMilestone: MilestoneSchema,
  tasks: z.array(TaskSchema),
  blockers: z.array(z.unknown()),
  recentActivity: z.array(ActivityEntrySchema),
  summary: z.string(),
  generatedAt: IsoTimestampSchema,
});

export const UpdateTaskResultSchema = z.object({
  updatedTask: TaskSchema,
  activity: ActivityEntrySchema,
});
