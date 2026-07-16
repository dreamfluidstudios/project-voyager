# Project Voyager — Local Cross-AI Continuity POC

## Copy/Paste Implementation Prompt

You are implementing the first local proof of concept for **Project Voyager**, a Dreamfluid Labs product.

Voyager’s core promise is:

> **Carry the vision. Continue the work.**

The purpose of this POC is to prove one narrow behavior:

> One AI can read and update a project’s current work state, and a second AI can immediately read that same state and continue the work without the user manually reconstructing context.

Build a small, local **TypeScript MCP server** backed by JSON files.

Do not turn this into a production platform. Do not add authentication, cloud hosting, a database, a web dashboard, vector search, embeddings, memory infrastructure, external project-management integrations, multi-user support, or agent orchestration.

The POC succeeds when two MCP-compatible AI clients can connect to the same local server, share a consistent view of one project, update a task, and see an attributed activity history.

---

# 1. Product Context

Project Voyager is a platform-neutral work-context layer intended to give authorized AI systems one consistent, current understanding of a user’s work.

This prototype is not attempting to prove the complete Voyager vision. It is only validating the smallest useful continuity loop:

1. AI Client A reads the current project context.
2. AI Client A updates a task.
3. The update is persisted locally.
4. AI Client B reads the same project context.
5. AI Client B sees the new state and continues from it.
6. The user did not need to manually repeat the project status.

Primary user story:

> As a builder using multiple AI tools, I can begin a task with one AI, switch to another, and continue without manually reconstructing the project’s current state.

---

# 2. Scope

## Required

Build a local TypeScript MCP server using the current official Model Context Protocol TypeScript SDK.

The server must expose exactly these two primary tools:

### `get_current_context`

Returns a structured snapshot containing:

- project
- current milestone
- tasks
- blockers
- recent activity
- generated timestamp

It may optionally accept:

- `projectId`
- `recentActivityLimit`

For the POC, supporting one project is sufficient.

### `update_task`

Accepts:

- `taskId`
- `status`
- `note`
- `actor`

Behavior:

1. Validate the input.
2. Find the task.
3. Update its status.
4. Update its `updatedAt` timestamp.
5. Append an attributed entry to `activity.json`.
6. Persist both changes safely.
7. Return the updated task and new activity entry.

Supported statuses:

- `backlog`
- `ready`
- `in_progress`
- `blocked`
- `done`

## Explicitly Out of Scope

Do not add:

- authentication or authorization
- hosted deployment
- database
- React or web UI
- REST API
- GraphQL
- vector database
- embeddings
- Mem0 or another memory provider
- GitHub, Linear, Notion, Trello, Jira, Azure DevOps, or other connectors
- multi-user workspaces
- permissions beyond the required `actor` attribution
- approval workflows
- autonomous agents
- scheduling
- background workers
- notifications
- event buses
- queues
- telemetry services
- custom protocol design
- speculative abstractions for future phases

Favor direct, readable code over architecture intended for hypothetical scale.

---

# 3. Technical Requirements

## Runtime

- Node.js
- TypeScript
- npm
- Current official MCP TypeScript SDK
- Local JSON-file persistence
- MCP stdio transport

Use current stable, mutually compatible package versions rather than hard-coding versions from an old example.

## Suggested Project Structure

```text
project-voyager-poc/
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── schemas.ts
│   ├── store.ts
│   └── types.ts
├── data/
│   ├── project.json
│   ├── tasks.json
│   └── activity.json
└── tests/
    └── store.test.ts
```

This structure is a recommendation, not a requirement. Keep it small.

## Data Storage

### `data/project.json`

```json
{
  "id": "voyager-poc",
  "name": "Project Voyager",
  "summary": "A local proof of concept for cross-AI work continuity.",
  "currentMilestone": {
    "id": "milestone-poc",
    "name": "Local continuity proof",
    "status": "in_progress"
  },
  "blockers": [],
  "updatedAt": "ISO_TIMESTAMP"
}
```

### `data/tasks.json`

Seed at least three tasks:

```json
[
  {
    "id": "task-001",
    "title": "Create local MCP server",
    "description": "Expose shared Voyager project context over MCP.",
    "status": "ready",
    "priority": "high",
    "updatedAt": "ISO_TIMESTAMP"
  },
  {
    "id": "task-002",
    "title": "Connect first AI client",
    "description": "Configure one MCP-compatible client to read and update Voyager state.",
    "status": "backlog",
    "priority": "high",
    "updatedAt": "ISO_TIMESTAMP"
  },
  {
    "id": "task-003",
    "title": "Verify cross-AI handoff",
    "description": "Use a second client to read the first client’s persisted update.",
    "status": "backlog",
    "priority": "high",
    "updatedAt": "ISO_TIMESTAMP"
  }
]
```

### `data/activity.json`

Start with an empty array or one seeded system entry.

Each activity entry should include:

```json
{
  "id": "activity-unique-id",
  "type": "task_updated",
  "taskId": "task-001",
  "actor": "claude",
  "note": "Started implementing the MCP server.",
  "previousStatus": "ready",
  "newStatus": "in_progress",
  "createdAt": "ISO_TIMESTAMP"
}
```

---

# 4. Behavioral Requirements

## `get_current_context`

Return both:

1. Structured data suitable for machine use.
2. A compact human-readable summary suitable for model context.

Suggested response shape:

```json
{
  "project": {},
  "currentMilestone": {},
  "tasks": [],
  "blockers": [],
  "recentActivity": [],
  "summary": "Project Voyager is currently focused on...",
  "generatedAt": "ISO_TIMESTAMP"
}
```

The summary should identify:

- current milestone
- tasks currently in progress
- blocked tasks
- most recent meaningful update
- next ready task, when obvious

Do not fabricate information that is not present in the local data.

## `update_task`

Validation requirements:

- reject an unknown `taskId`
- reject an unsupported status
- reject an empty actor
- reject an empty note
- preserve existing task fields
- record the previous and new status
- create an activity entry even when the status remains the same, provided the note adds meaningful progress context

Persistence requirements:

- avoid leaving partially written JSON
- use an atomic-enough local approach, such as writing a temporary file and renaming it
- format JSON for readability
- return actionable errors rather than generic failures

Concurrency only needs to be reasonable for a local POC. Do not build distributed locking.

---

# 5. MCP Requirements

Use stdio transport so the server can be configured in local MCP-compatible clients.

The server should:

- identify itself clearly as Project Voyager
- expose tool names and descriptions that make their purpose obvious
- use typed input validation
- return tool errors in a useful, client-readable form
- avoid logging normal messages to stdout because stdout is used by the MCP transport
- send diagnostics to stderr when needed

Use the current SDK’s recommended server APIs and schemas. Do not copy deprecated MCP examples without checking compatibility.

---

# 6. Developer Experience

Add npm scripts similar to:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  }
}
```

Exact tools may vary, but setup should remain minimal.

Provide a README containing:

- prerequisites
- install command
- build command
- local run command
- data file explanation
- example MCP client configuration
- manual test procedure
- cross-AI acceptance test
- known POC limitations

Use a placeholder-based MCP configuration example:

```json
{
  "mcpServers": {
    "project-voyager": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/project-voyager-poc/dist/index.js"]
    }
  }
}
```

Also include a development configuration example if practical.

---

# 7. Testing

At minimum, add focused tests for the storage and update behavior:

1. Reads seeded project and task data.
2. Updates a valid task.
3. Persists the new status.
4. Appends an attributed activity entry.
5. Rejects an invalid task ID.
6. Rejects an invalid status.
7. Preserves valid JSON after writes.

Do not overbuild an integration-test framework.

---

# 8. Acceptance Test

## Client A

1. Connect Client A to the local Voyager MCP server.
2. Ask: “Read the current Voyager project context.”
3. Client A calls `get_current_context`.
4. Ask: “Start task-001. Record that implementation has begun.”
5. Client A calls `update_task` with:
   - `taskId`: `task-001`
   - `status`: `in_progress`
   - `note`: a useful progress note
   - `actor`: a recognizable client name

## Client B

6. Connect Client B to the exact same server and data directory.
7. Ask: “Read the current Voyager project context and tell me what changed most recently.”
8. Client B calls `get_current_context`.
9. Client B must see:
   - `task-001` is `in_progress`
   - Client A’s note
   - Client A’s actor attribution
   - the activity timestamp
10. Ask Client B: “Continue the current task based on the shared state.”

## Success Criterion

The user does not manually restate that task-001 was started or explain Client A’s update to Client B.

That is the proof being tested.

---

# 9. Implementation Order

1. Initialize the TypeScript project.
2. Install the current official MCP TypeScript SDK and minimal development dependencies.
3. Create types and input schemas.
4. Add seed JSON data.
5. Build a small file store.
6. Implement `get_current_context`.
7. Implement `update_task`.
8. Register both MCP tools.
9. Add stdio transport.
10. Add tests.
11. Write the README and client configuration examples.
12. Build and run the project.
13. Fix all TypeScript and test failures.
14. Perform a local smoke test of both tools.
15. Report exactly what was created, how to run it, and any client-specific setup that still requires manual configuration.

---

# 10. Working Rules

- Make reasonable implementation decisions without asking unnecessary questions.
- Keep the POC local and small.
- Prefer a working vertical slice over reusable infrastructure.
- Do not broaden the product scope.
- Do not silently omit errors or tests.
- Do not claim success unless the project builds and tests pass.
- If the local environment prevents a true two-client test, complete everything else and clearly distinguish:
  - what was programmatically verified
  - what remains for the user to verify inside Claude, Codex, Cursor, or another MCP client

At the end, provide:

1. A concise implementation summary.
2. The final file tree.
3. Commands to install, build, test, and run.
4. MCP client configuration snippets.
5. The exact two-client test script.
6. Any known limitations.

---

# 11. Product Guardrail

This POC is an experiment, not the final Voyager architecture.

Its only job is to answer:

> Does a shared, structured work state meaningfully reduce manual context reconstruction when switching between AI clients?

Build the smallest credible test of that question.
