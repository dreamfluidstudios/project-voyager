# Manual MCP Configuration

Project Voyager can run as a local standard-input/output (stdio) MCP server.
After cloning, install dependencies and generate local workspace configuration:

```powershell
npm ci
npm run setup:local
```

`setup:local` builds the server, then configures the local development clients:

- Claude Code: ignored project-level `.mcp.json`
- Cursor: ignored `.cursor/mcp.json`
- Visual Studio Code: ignored `.vscode/mcp.json`
- Codex app, CLI, and IDE extension: ignored `.codex/config.toml`
- Claude Desktop: copy-ready `.claude/claude-desktop-mcp.json`

Existing unrelated JSON MCP servers are preserved. The Codex installer owns
only its marked Voyager block and preserves text outside that block. Committed
templates live in `integrations/`; generated files are local developer state.

## Claude Code

Launch Claude Code from the repository after setup. It discovers the generated
root `.mcp.json`; approve the project-scoped server when prompted. Use
`claude mcp get project-voyager` from a terminal or `/mcp` inside an interactive
Claude Code session to inspect the connection.

## Visual Studio Code

The setup command generates `.vscode/mcp.json`. Open the repository root in VS
Code, then run `MCP: List Servers` from the Command Palette and start
`project-voyager`. Confirm the trust prompt the first time it starts.

VS Code uses a top-level `servers` object, while Cursor uses `mcpServers`.
Otherwise, the local server command, arguments, and environment variables are
equivalent.

The workspace configuration sets both `VOYAGER_DATA_DIR` and
`VOYAGER_PROJECT_ID`. The latter is a safety check: it must match the ID in the
selected data directory's `project.json` before Voyager will read or write it.

If the server definition changes while VS Code is open, run `MCP: Reset Cached
Tools`, then restart `project-voyager` from `MCP: List Servers`.

## Cursor

Open the repository root in Cursor, then enable or reconnect `project-voyager`
from Cursor's MCP settings. The generated configuration is scoped to this
checkout.

## Codex

The generated `.codex/config.toml` is project-scoped and is loaded only after
Codex trusts the repository. Restart/reconnect Codex after setup, then use the
MCP settings screen, `codex mcp list`, or `/mcp` to verify `project-voyager`.
Codex's app, CLI, and IDE extension share Codex MCP configuration.

## Claude Desktop

Claude Desktop does not consume the repository's Claude Code `.mcp.json`.
Open the generated `.claude/claude-desktop-mcp.json` and add its
`project-voyager` server entry through Claude Desktop's MCP/developer settings
or merge it into the Desktop configuration. Restart Claude Desktop afterward.
This manual step is intentionally not automated because it changes user-level
application configuration outside the cloned repository.

## Current scope and future installation

The generated files configure this repository checkout only. They are intended for
development and acceptance testing, not as the final end-user installation
flow.

Claude Desktop remains the only manual user-level configuration step. A future
Desktop Extension or platform plugin should replace it. The current installer
does not silently modify user-profile files or approval settings.

The server package exposes `project-voyager-mcp` (and the compatible
`project-voyager` alias) and accepts `--data-dir <path>`. A future global
installer can register that executable once per client while assigning a
separate data directory and project ID to each workspace. Voyager is not yet a
published package, so those global registrations are deliberately deferred.
