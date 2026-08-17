# dainami-kie-mcp

> Let your AI agent generate **images, videos, and music** with the latest AI models — Seedance, Kling, GPT Image 2, Nano Banana, Suno V4, and anything new KIE ships — without leaving the chat.

A tiny MCP server that lets **Claude (Code or Desktop), Codex, or any MCP client** call **any** model on [KIE.ai](https://kie.ai) on your behalf. Make a 9:16 video with Seedance 2.0 Pro. Edit a product photo with Nano Banana 2. Render a 5-panel storyboard with GPT Image 2. Compose a soundtrack with Suno V4.

It's intentionally **dumb on purpose**: 5 generic tools instead of one tool per model. The agent reads the JSON shape from [docs.kie.ai](https://docs.kie.ai) when it needs to, and constructs the payload itself. When KIE ships a new model tomorrow, this package doesn't have to update — the agent just points at the new docs.

---

## Get set up

Two things first, same for everyone:

1. **Get a KIE.ai API key.** Go to [kie.ai](https://kie.ai), sign in, open Dashboard, then API Keys. Create one and copy it. You will paste it during setup.
2. **Download the connector.** On this page, click the green **Code** button, then **Download ZIP**. Unzip it and move the `kie-mcp` folder somewhere permanent, like your Documents folder. Your app will point at this folder forever, so don't leave it in Downloads.

Then find your app below:

| Your app | What setup looks like | Needs Node.js? |
|---|---|---|
| Claude Desktop (chat and cowork) | Drag one file in | No |
| Codex (ChatGPT desktop app) | Fill in a settings form | Yes |
| Codex CLI | Paste one command | Yes |
| Claude Code | Paste one command | Yes |

Node.js is a free runtime the connector runs on. If your app needs it, download the LTS installer from [nodejs.org](https://nodejs.org) and click through it once. Claude Desktop skips this because it has its own copy built in.

---

## Claude Desktop (drag and drop)

1. Open the folder you downloaded and find **`kie-mcp.mcpb`**. (You can also grab just this file from the [releases page](https://github.com/mrdainami/kie-mcp/releases) and skip the ZIP entirely.)
2. Drag it onto the Claude Desktop window, or go to Settings, then Extensions, and pick it.
3. When Claude asks for your KIE API key, paste it.
4. Quit Claude Desktop fully and reopen it.

To check it worked: open a chat, click the **+** button, then **Connectors**. "KIE.ai" should be listed with its tools.

This covers cowork too. Connectors installed in Claude Desktop are shared with cowork sessions, so there is nothing separate to set up.

---

## Codex (ChatGPT desktop app)

1. Install [Node.js](https://nodejs.org) (the LTS button) if you don't have it yet.
2. Get the path to the connector file. In Finder, open your `kie-mcp` folder, then the `dist` folder inside it, and find `index.js`. Right-click it, hold the **Option** key, and choose **Copy "index.js" as Pathname**.
3. In the ChatGPT desktop app, open the Codex side, click your account name (bottom left), then **Settings**, then **MCP servers**, then **Add server**.
4. On the **STDIO** tab, fill in:
   - **Name:** `kie`
   - **Command:** `node`
   - **Arguments:** paste the pathname you copied in step 2
   - **Environment variables:** `KIE_API_KEY` with your key as the value
5. Save. `kie` appears in your server list, and the same setup carries over to the Codex CLI and IDE extension automatically.

Then just ask for something: *"Make me a 9:16 video of a coffee cup using Seedance."* Codex asks permission before each kie tool call. Approve them; that is its normal safety prompt, and generation costs KIE credits from your account.

---

## Codex CLI (one command)

Paste this in your terminal, with your key and your folder's location filled in:

```bash
codex mcp add kie --env KIE_API_KEY=YOUR_KEY -- node ~/Documents/kie-mcp/dist/index.js
```

To check: `codex mcp list` should show `kie` as enabled. The same registration also shows up in the ChatGPT desktop app's Codex settings and the IDE extension; they share one config.

---

## Claude Code (one command)

Paste this in Claude Code, with your key and your folder's location filled in:

```bash
claude mcp add --scope user kie --env KIE_API_KEY=YOUR_KEY -- node ~/Documents/kie-mcp/dist/index.js
```

If you put the folder somewhere other than Documents, adjust the path. `--scope user` makes it available in every project.

To check: `claude mcp list` should show `kie ✓ Connected`.

---

## Updating

When a new version ships: download the ZIP again and replace your `kie-mcp` folder's contents. Your API key lives in your app's settings, not in the folder, so nothing else needs to change. Claude Desktop users drag in the new `.mcpb` instead.

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

The repo ships the built `dist/index.js` (a single self-contained bundle), so users never build anything. To hack on the source:

```bash
git clone https://github.com/mrdainami/kie-mcp
cd kie-mcp
npm install
npm run build   # rebuilds dist/index.js via esbuild
```

For dev with auto-reload:

```bash
KIE_API_KEY=kie-... npm run dev
```

The package is also on npm as `dainami-kie-mcp`, so terminal users can skip the folder entirely: `claude mcp add --scope user kie --env KIE_API_KEY=YOUR_KEY -- npx -y dainami-kie-mcp` (same shape for `codex mcp add`).

To point any other MCP client at the folder, the config shape is always:

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

Note: ChatGPT chat conversations can't use this connector — they only accept servers hosted at a URL, and this one runs locally. The Codex side of the ChatGPT app works fine.

---

## Why it's tiny

Most MCP wrappers around AI APIs hard-code one tool per model: `generate_seedance()`, `generate_gpt_image_2()`, `generate_suno()`. That means:

- You have to update the wrapper every time the provider ships a new model
- The wrapper's mental model of each model's JSON shape drifts from reality
- The wrapper becomes the bottleneck

This package goes the opposite direction: **five generic tools** that work for everything KIE has, with KIE's docs as the source of truth for shapes. The agent is smart enough to read docs and construct payloads. The MCP just makes the HTTP call.

When KIE ships a new model tomorrow, no PR here. Just point your agent at the new docs.

---

## License

MIT — see [LICENSE](./LICENSE).

By [mrdainami](https://github.com/mrdainami). PRs and issues welcome.
