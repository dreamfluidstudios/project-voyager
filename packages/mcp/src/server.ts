import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  CurrentContextSchema,
  GetCurrentContextMcpInputSchema,
  UpdateTaskInputSchema,
  UpdateTaskResultSchema,
} from "./schemas.js";
import { VoyagerStore, type CurrentContext } from "@project-voyager/core";

export const SERVER_NAME = "project-voyager";
export const SERVER_VERSION = "0.1.0";

export function createVoyagerServer(store: VoyagerStore): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Use get_current_context to read the shared Project Voyager state before continuing work. " +
        "Use update_task to persist a status change and an attributed progress note for the next AI client.",
    },
  );

  server.registerTool(
    "get_current_context",
    {
      title: "Get Current Voyager Context",
      description:
        "Read the shared local Project Voyager snapshot, including its milestone, tasks, blockers, and recent attributed activity.",
      inputSchema: GetCurrentContextMcpInputSchema,
      outputSchema: CurrentContextSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const context = await store.getCurrentContext(input);
        return {
          content: [{ type: "text", text: formatCurrentContext(context) }],
          structuredContent: { ...context },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Update Voyager Task",
      description:
        "Persist a Voyager task status and append an attributed progress note that another AI client can read immediately.",
      inputSchema: UpdateTaskInputSchema,
      outputSchema: UpdateTaskResultSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await store.updateTask(input);
        return {
          content: [
            {
              type: "text",
              text:
                `Updated ${result.updatedTask.id} from ${result.activity.previousStatus} ` +
                `to ${result.activity.newStatus}. ${result.activity.actor}: ${result.activity.note}`,
            },
          ],
          structuredContent: { ...result },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

export function formatCurrentContext(context: CurrentContext): string {
  const activityLines = context.recentActivity.length
    ? context.recentActivity.map(
        (activity) =>
          `- ${activity.createdAt} | ${activity.actor} | ${activity.taskId} | ` +
          `${activity.previousStatus} -> ${activity.newStatus} | ${activity.note}`,
      )
    : ["- None returned."];

  return [
    context.summary,
    "",
    `Recent activity (${context.recentActivity.length}, newest first):`,
    ...activityLines,
  ].join("\n");
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}
