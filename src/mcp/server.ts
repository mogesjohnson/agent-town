#!/usr/bin/env node
// agent-town MCP server (stdio). Run: node dist/mcp/server.js. Talks only to the town on loopback.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { townUrl } from "./http.js";
import { VIEWS } from "./read.js";

let base: URL;
try { base = townUrl(); } catch (e) { console.error(`[agent-town-mcp] ${(e as Error).message}`); process.exit(1); }

export const mcp = new McpServer({ name: "agent-town", version: "0.1.0" });
export const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });

for (const v of VIEWS) {
  const uri = `town://${v.name}`;
  mcp.registerResource(v.name, uri, { title: v.title, description: v.description, mimeType: "application/json" },
    async (u) => ({ contents: [{ uri: u.href, mimeType: "application/json", text: JSON.stringify(await v.load(base), null, 2) }] }));
  mcp.registerTool(`get_${v.name}`, { title: v.title, description: `${v.description} Same as resource ${uri}.`, annotations: { readOnlyHint: true } },
    async () => text(await v.load(base)));
}

await mcp.connect(new StdioServerTransport());
console.error(`[agent-town-mcp] ready; town at ${base.origin}`);
