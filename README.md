# @dainami/kie-mcp

> Let Claude generate **images, videos, and music** with the latest AI models — Seedance, Kling, GPT Image 2, Nano Banana, Suno V4, and anything new KIE ships — without leaving the chat.

A tiny MCP server that lets Claude (Desktop, Code, or any MCP client) call **any** model on [KIE.ai](https://kie.ai) on your behalf. Make a 9:16 video with Seedance 2.0 Pro. Edit a product photo with Nano Banana 2. Render a 5-panel storyboard with GPT Image 2. Compose a soundtrack with Suno V4.

It's intentionally **dumb on purpose**: 5 generic tools instead of one tool per model. Claude reads the JSON shape from [docs.kie.ai](https://docs.kie.ai) when it needs to, and constructs the payload itself. When KIE ships a new model tomorrow, this package doesn't have to update — Claude just points at the new docs.

---

## Which install do I need?

Pick the row that matches how you run Claude:

- **Claude Code (terminal)** → use **Quick start: Claude Code** below — one command, the fastest option.
- **Regular Claude Desktop chat** → use **Path A** (drag-and-drop `.mcpb`, 2 minutes, no terminal).
- **Claude Desktop co-work** → use **Path B** (download source, build once, edit a config file). Co-work ignores `.mcpb` files, so you set it up by hand.

If you use both Desktop modes, do Path B — it works for both.

---

## Quick start: Claude Code (fastest)

One command — no `.mcpb`, no JSON editing.

1. **Get a KIE.ai API key** at [kie.ai](https://kie.ai) → Dashboard → API Keys.
2. **Clone + build** (once, somewhere permanent):

   ```bash
   git clone https://github.com/mrdainami/kie-mcp.git ~/mcp/kie-mcp
   cd ~/mcp/kie-mcp && npm install && npm run build
   ```

3. **Register it** (`--scope user` makes it available in every project; drop it to add only to the current project):

   ```bash
   claude mcp add --scope user kie --env KIE_API_KEY=YOUR_KEY -- node ~/mcp/kie-mcp/dist/index.js
   ```

4. **Verify:** `claude mcp list` should show `kie  ✓ Connected`.

Your key lives in Claude Code's own config, never in this repo. To update later: `git pull && npm run build` in the folder, then restart Claude Code.

---

## Path A — Regular Claude Desktop (drag-and-drop)

1. **Get a KIE.ai API key** at [kie.ai](https://kie.ai) → Dashboard → API Keys. Copy it somewhere — you'll paste it in step 4.
2. **Download the latest `.mcpb`** from the [releases page](https://github.com/mrdainami/kie-mcp/releases).
3. **Drag that file onto the Claude Desktop window** (or open Settings → Extensions and pick it).
4. When Claude pops up a box asking for your KIE API key, paste it.
5. **Quit Claude Desktop fully and reopen it.**

Done. To check it's connected, open a chat → click the **+** button → **Connectors** — you should see "KIE.ai" listed with its tools.

> **Why `.mcpb`?** It's Anthropic's drag-and-drop install format for local MCP servers. No JSON editing, no Node.js install required (Claude Desktop bundles its own Node runtime). [Read more →](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

---

## Path B — Claude co-work (manual install)

Co-work doesn't load `.mcpb` files. You have to install Node.js, download this repo, build it once, then point Claude at the built file via the config JSON. One-time setup, ~10 minutes.

### 1. Get your API key

Sign up at [kie.ai](https://kie.ai) → Dashboard → API Keys → copy the key. Keep it handy.

### 2. Install Node.js

If you don't have it: go to [nodejs.org](https://nodejs.org) → click the big **LTS** download button → run the installer → click Next a few times. Done. This adds Node to your system so the MCP can run.

### 3. Download this repo and build it

You only do this once. The folder you create here is **permanent** — Claude will look at it forever, so put it somewhere you won't move or delete (`~/Documents/kie-mcp` is a good spot).

- Go to [github.com/mrdainami/kie-mcp](https://github.com/mrdainami/kie-mcp)
- Click the green **Code** button → **Download ZIP**
- Unzip it. Rename the folder from `kie-mcp-main` to `kie-mcp` if you like, and put it in `~/Documents/`.
- Open **Terminal** (Spotlight → type "Terminal") and run these three lines, one at a time:

  ```bash
  cd ~/Documents/kie-mcp
  npm install
  npm run build
  ```

  After `npm run build` finishes, you can close Terminal and never open it again.

### 4. Tell Claude where to find it

- In Finder, press **Cmd+Shift+G** and paste this path, then Enter:

  ```
  ~/Library/Application Support/Claude/
  ```

- Open `claude_desktop_config.json` in TextEdit (or VS Code, any text editor).
- If the file is **empty**, paste the whole block below. If it **already has stuff**, just add the `"kie": { ... }` block inside the existing `"mcpServers"` object:

  ```json
  {
    "mcpServers": {
      "kie": {
        "command": "node",
        "args": [
          "/Users/YOUR_USERNAME/Documents/kie-mcp/dist/index.js"
        ],
        "env": {
          "KIE_API_KEY": "paste-your-kie-key-here"
        }
      }
    }
  }
  ```

- Replace `YOUR_USERNAME` with your Mac username (Terminal `whoami` tells you if you don't know).
- Replace `paste-your-kie-key-here` with the key from step 1.
- Save the file. **Quit Claude Desktop fully and reopen it.**

On Windows, the config file lives at `%APPDATA%\Claude\claude_desktop_config.json` and the `args` path will be a Windows-style path like `C:\\Users\\You\\Documents\\kie-mcp\\dist\\index.js`.

### 5. Try it

In co-work, ask: *"Make me a 9:16 video of a coffee cup using Seedance."* Claude will submit the job with `kie_post`, poll with `kie_get`, and return the video URL when it's done.

**If something goes wrong:**
- "command not found: npm" → Node.js isn't installed. Redo step 2.
- "module not found" / "ENOENT dist/index.js" → you skipped `npm run build` in step 3. Run it again.
- The MCP shows up but every call fails with an auth error → your `KIE_API_KEY` is wrong or missing. Re-check step 4.

---

## What the agent does with these tools

Generation on KIE is **asynchronous** — submit a job, then poll for the result. Typical flow for "make me an image with GPT Image 2":

1. Agent (optionally) calls `kie_fetch_model_docs` to confirm the model's current JSON shape.
2. Agent **submits** with `kie_post`:
   ```ts
   kie_post({
     path: "/api/v1/jobs/createTask",
     body: {
       model: "gpt-image-2",
       input: { prompt: "A serene cabin in the mountains, golden hour", aspect_ratio: "9:16", quality: "high" }
     }
   })
   // → body.data.taskId — save this immediately
   ```
3. Agent **polls** with `kie_get` every ~20–30s until done:
   ```ts
   kie_get({ path: "/api/v1/jobs/recordInfo?taskId=..." })
   // data.state: waiting | generating | success | fail
   // on success → data.resultJson.resultUrls[]
   ```
4. Agent **saves** the result with `kie_download({ url, destPath })`.

> Cost is billed on **submit**, not on poll. Persist the `taskId` right after submitting, and never resubmit a live task.

---

## The 5 tools

| Tool | What it does |
|---|---|
| `kie_post(path, body)` | POST to any KIE endpoint — **submit** a generation task (usually `/api/v1/jobs/createTask`). |
| `kie_get(path)` | GET from any KIE endpoint — **poll** task status (usually `/api/v1/jobs/recordInfo?taskId=...`). |
| `kie_upload_file(localPath, uploadPath?)` | Upload a local file to KIE storage → returns a hosted URL (~3-day TTL) for use as an `@Image`/`@Video` reference. |
| `kie_download(url, destPath)` | Download a result URL to local disk (creates parent folders). |
| `kie_fetch_model_docs(path \| url, force?)` | Fetch a model's live docs from docs.kie.ai (cached ~3 days) so the agent knows the exact payload shape. |

Different model families use slightly different envelopes (Veo, Suno, Flux-Kontext) — the agent reads the model docs and adjusts. The MCP stays generic, so new KIE models work without updating this package.

---

## Environment variables

| Variable | Default | Required |
|---|---|---|
| `KIE_API_KEY` | — | **Yes** |
| `KIE_BASE_URL` | `https://api.kie.ai` | No (override for testing / proxy) |

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
