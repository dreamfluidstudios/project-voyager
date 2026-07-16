import { describe, expect, it } from "vitest";

import type { CurrentContext } from "@project-voyager/core";
import { formatCurrentContext } from "@project-voyager/mcp";

function contextWithActivity(): CurrentContext {
  return {
    project: {
      id: "voyager-poc",
      name: "Project Voyager",
      summary: "A continuity test.",
      currentMilestone: {
        id: "milestone-poc",
        name: "Local continuity proof",
        status: "in_progress",
      },
      blockers: [],
      updatedAt: "2026-07-12T07:30:00.000Z",
    },
    currentMilestone: {
      id: "milestone-poc",
      name: "Local continuity proof",
      status: "in_progress",
    },
    tasks: [],
    blockers: [],
    recentActivity: [
      {
        id: "activity-2",
        type: "task_updated",
        taskId: "task-001",
        actor: "cursor",
        note: "Continued the handoff.",
        previousStatus: "in_progress",
        newStatus: "in_progress",
        createdAt: "2026-07-14T04:22:59.051Z",
      },
      {
        id: "activity-1",
        type: "task_updated",
        taskId: "task-001",
        actor: "claude-desktop",
        note: "Started the handoff.",
        previousStatus: "ready",
        newStatus: "in_progress",
        createdAt: "2026-07-14T04:14:28.038Z",
      },
    ],
    summary: "Project Voyager summary.",
    generatedAt: "2026-07-14T04:30:00.000Z",
  };
}

describe("formatCurrentContext", () => {
  it("includes all returned activity in portable text, newest first", () => {
    const text = formatCurrentContext(contextWithActivity());

    expect(text).toContain("Project Voyager summary.");
    expect(text).toContain("Recent activity (2, newest first):");
    expect(text).toContain(
      "2026-07-14T04:22:59.051Z | cursor | task-001 | in_progress -> in_progress | Continued the handoff.",
    );
    expect(text).toContain(
      "2026-07-14T04:14:28.038Z | claude-desktop | task-001 | ready -> in_progress | Started the handoff.",
    );
    expect(text.indexOf("cursor")).toBeLessThan(text.indexOf("claude-desktop"));
  });

  it("states when no activity was returned", () => {
    const context = contextWithActivity();
    context.recentActivity = [];

    expect(formatCurrentContext(context)).toContain(
      "Recent activity (0, newest first):\n- None returned.",
    );
  });
});
