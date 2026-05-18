# @dainami/kie-mcp

> Let Claude generate **images, videos, and music** with the latest AI models — Seedance, Kling, GPT Image 2, Nano Banana, Suno V4, and anything new KIE ships — without leaving the chat.

A tiny MCP server that lets Claude (Desktop, Code, or any MCP client) call **any** model on [KIE.ai](https://kie.ai) on your behalf. Make a 9:16 video with Seedance 2.0 Pro. Edit a product photo with Nano Banana 2. Render a 5-panel storyboard with GPT Image 2. Compose a soundtrack with Suno V4.

It's intentionally **dumb on purpose**: 3 generic tools instead of one tool per model. Claude reads the JSON shape from [docs.kie.ai](https://docs.kie.ai) when it needs to, and constructs the payload itself. When KIE ships a new model tomorrow, this package doesn't have to update — Claude just points at the new docs.

---

## Install in Claude Desktop (3 minutes, no terminal needed)

1. **Get a KIE.ai API key** at [kie.ai](https://kie.ai) → Dashboard → API Keys. Copy it.
2. **Download `kie-mcp.mcpb`** from the [latest release](https://github.com/mrdainami/kie-mcp/releases).
3. In Claude Desktop: open **Settings → Extensions** (or drag the `.mcpb` file directly onto the Claude Desktop window).
4. When prompted, paste your KIE API key.
5. Restart Claude Desktop.

Done. To check it's connected, open a chat → click the **+** button → **Connectors** — you should see "KIE.ai" listed with 3 tools.

> **Why `.mcpb`?** It's Anthropic's drag-and-drop install format for local MCP servers. No JSON editing, no Node.js install required (Claude Desktop bundles its own Node runtime). [Read more about local MCP servers →](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

---

## Install manually (Claude Code, or Claude Desktop without `.mcpb`)

Requires Node.js 18+.

**Claude Code:**

```bash
claude mcp add kie --env KIE_API_KEY=kie-xxxxxxxxxxxxxxxxxxxx -- npx -y @dainami/kie-mcp
```

Or add it to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "kie": {
      "command": "npx",
      "args": ["-y", "@dainami/kie-mcp"],
      "env": { "KIE_API_KEY": "kie-xxxxxxxxxxxxxxxxxxxx" }
    }
  }
}
```

**Claude Desktop (manual JSON):** edit `claude_desktop_config.json`

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kie": {
      "command": "npx",
      "args": ["-y", "@dainami/kie-mcp"],
      "env": { "KIE_API_KEY": "kie-xxxxxxxxxxxxxxxxxxxx" }
    }
  }
}
```

Restart Claude Desktop.

---

## What the agent does with these tools

Typical flow for "make me an image with GPT Image 2":

1. Agent thinks: "I need GPT Image 2."
2. Agent (optionally) WebFetches `https://docs.kie.ai/gpt-image-2` to confirm the current JSON shape.
3. Agent calls `kie_run_and_wait`:
   ```ts
   kie_run_and_wait({
     submitPath: "/api/v1/jobs/createTask",
     body: {
       model: "gpt-image-2",
       input: {
         prompt: "A serene cabin in the mountains, golden hour",
         aspect_ratio: "9:16",
         quality: "high"
       }
     },
     pollPath: "/api/v1/jobs/recordInfo?taskId={taskId}"
   })
   ```
4. MCP submits to KIE → polls every 8s → returns the result URL when `state === "success"`.

---

## The 3 tools

### `kie_post(path, body)`

POST to any KIE endpoint. Returns whatever KIE returns. Use when you want fine control.

### `kie_get(path)`

GET from any KIE endpoint (typically polling a task by ID).

### `kie_run_and_wait(submitPath, body, pollPath, …)`

Submit a task and poll until done. **Use this 90% of the time.**

Defaults match KIE's unified jobs API:

| Param | Default | What it means |
|---|---|---|
| `taskIdPath` | `data.taskId` | Where the taskId lives in the submit response |
| `stateField` | `data.state` | Field in poll response that signals state |
| `successValue` | `"success"` | State value that means done |
| `failValue` | `"failed"` | State value that means failure |
| `timeoutSec` | `900` (15 min) | Bump to 1800+ for Suno music |
| `intervalSec` | `8` | Poll cadence |

Override only if a specific model uses a non-standard envelope.

---

## Environment variables

| Variable | Default | Required |
|---|---|---|
| `KIE_API_KEY` | — | **Yes** |
| `KIE_BASE_URL` | `https://api.kieai.com` | No (override for testing / proxy) |

---

## Develop locally

```bash
git clone https://github.com/mrdainami/kie-mcp
cd kie-mcp
npm install
npm run build
```

Point Claude at your local copy:

```json
{
  "mcpServers": {
    "kie": {
      "command": "node",
      "args": ["/absolute/path/to/kie-mcp/dist/index.js"],
      "env": { "KIE_API_KEY": "kie-..." }
    }
  }
}
```

For dev with auto-reload:

```bash
KIE_API_KEY=kie-... npm run dev
```

---

## Why it's tiny

Most MCP wrappers around AI APIs hard-code one tool per model: `generate_seedance()`, `generate_gpt_image_2()`, `generate_suno()`. That means:

- You have to update the wrapper every time the provider ships a new model
- The wrapper's mental model of each model's JSON shape drifts from reality
- The wrapper becomes the bottleneck

This package goes the opposite direction: **three generic tools** that work for everything KIE has, with KIE's docs as the source of truth for shapes. Claude is smart enough to read docs and construct payloads. The MCP just makes the HTTP call.

When KIE ships a new model tomorrow, no PR here. Just point your agent's knowledge files at the new docs URL.

---

## License

MIT — see [LICENSE](./LICENSE).

By [mrdainami](https://github.com/mrdainami). PRs and issues welcome.
