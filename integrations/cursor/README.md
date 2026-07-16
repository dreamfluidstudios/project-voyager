# Cursor Integration

Reserved for future Cursor rules and hosted MCP configuration. The current POC
uses a generated project-local `.cursor/mcp.json` file. Run
`npm run setup:local` after cloning to build the server and create or refresh
that ignored file from `mcp.template.json`.

That local configuration sets `VOYAGER_DATA_DIR` and `VOYAGER_PROJECT_ID` so
Cursor shares the same guarded project state as the other development clients.
A future published package or plugin will use the stable
`project-voyager-mcp` executable without embedding a source-checkout path.
