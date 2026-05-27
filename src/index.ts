#!/usr/bin/env node
/**
 * @dainami/kie-mcp v0.3.0
 *
 * KIE.ai connector for MCP. Discovers models from the live KIE docs site
 * rather than maintaining hand-written per-model markdown — so the catalogue
 * never goes stale and every model on KIE works the moment it ships.
 *
 * Tools (5):
 *   kie_post(path, body)             — POST any KIE endpoint (usually createTask)
 *   kie_get(path)                    — GET any KIE endpoint (usually recordInfo polling)
 *   kie_upload_file(localPath, ...)  — local file → KIE-hosted URL (~3d TTL)
 *   kie_download(url, destPath)      — KIE result URL → local disk
 *   kie_fetch_model_docs({ path|url })— fetch a KIE model docs page; cached locally for ~3 days
 *
 * Resources (markdown — only three, deliberately):
 *   kie://envelope                   — how KIE jobs work in general
 *   kie://upload                     — how file uploads work
 *   kie://models/_index              — flat catalogue: model name → docs URL
 *
 * Discovery model: agent reads kie://models/_index to find the docs URL for
 * the model it wants. It calls kie_fetch_model_docs to read the live spec,
 * then constructs the actual API call with kie_post. First time per model
 * per ~3 days costs one HTTP fetch; everything else is cache.
 *
 * Standing instructions are sent to the client on connect via the MCP
 * `instructions` field — see SERVER_INSTRUCTIONS below.
 *
 * HTTP is done with Node's built-in `node:http(s)` — no fetch, no axios, no
 * undici. Some MCP host runtimes don't expose global `fetch`.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/index.js → repo root → resources/
const RESOURCES_DIR = path.resolve(__dirname, "..", "resources");

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE_URL = (process.env.KIE_BASE_URL ?? "https://api.kie.ai").replace(/\/+$/, "");
const KIE_UPLOAD_URL = (process.env.KIE_UPLOAD_URL ?? "https://kieai.redpandaai.co/api/file-stream-upload");
const KIE_DOCS_BASE = (process.env.KIE_DOCS_BASE ?? "https://docs.kie.ai").replace(/\/+$/, "");

// Per-user docs cache. Reused across sessions so we don't refetch each chat.
const DOCS_CACHE_DIR = path.join(os.homedir(), ".cache", "dainami-kie-mcp", "docs");
const DOCS_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

if (!KIE_API_KEY) {
  console.error("[dainami-kie-mcp] KIE_API_KEY environment variable is required");
  process.exit(1);
}

type FetchResult = {
  status: number;
  ok: boolean;
  body: unknown;
};

type HttpHeaders = Record<string, string>;

type HttpResponse = {
  status: number;
  body: string | Buffer;
  headers: NodeJS.Dict<string | string[]>;
};

// ---------------------------------------------------------------------------
// HTTP — minimal fetch-like wrapper with redirect handling.
// Returns body as string by default, or Buffer when asBuffer=true (for
// binary downloads).
// ---------------------------------------------------------------------------
function httpRequest(
  method: string,
  urlStr: string,
  headers: HttpHeaders,
  body?: string | Buffer,
  redirectCount = 0,
  asBuffer = false,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(new Error(`Invalid URL: ${urlStr}`));
      return;
    }
    const lib = u.protocol === "https:" ? https : http;

    const reqHeaders: HttpHeaders = { ...headers };
    if (body !== undefined && reqHeaders["Content-Length"] === undefined) {
      reqHeaders["Content-Length"] = String(
        Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body),
      );
    }

    const req = lib.request(
      {
        method,
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        headers: reqHeaders,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          typeof location === "string" &&
          redirectCount < 5
        ) {
          res.resume();
          const newMethod =
            status === 307 || status === 308 ? method : "GET";
          const newBody = newMethod === method ? body : undefined;
          const nextUrl = new URL(location, urlStr).toString();
          resolve(
            httpRequest(newMethod, nextUrl, headers, newBody, redirectCount + 1, asBuffer),
          );
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status,
            body: asBuffer ? buf : buf.toString("utf8"),
            headers: res.headers,
          });
        });
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function kieFetch(
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown,
): Promise<FetchResult> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${KIE_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const res = await httpRequest(
    method,
    url,
    {
      Authorization: `Bearer ${KIE_API_KEY}`,
      "Content-Type": "application/json",
      // Disable gzip — some KIE responses gzip silently and confuse downstream parsers
      "Accept-Encoding": "identity",
    },
    body !== undefined ? JSON.stringify(body) : undefined,
  );

  const text = typeof res.body === "string" ? res.body : res.body.toString("utf8");
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, body: parsed };
}

// ---------------------------------------------------------------------------
// Multipart upload — assembled by hand so we don't pull in a form-data dep.
// ---------------------------------------------------------------------------
function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

function buildMultipartBody(
  fields: Record<string, string>,
  fileField: string,
  fileName: string,
  fileBuffer: Buffer,
  contentType: string,
  boundary: string,
): Buffer {
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        "utf8",
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      "utf8",
    ),
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return Buffer.concat(parts);
}

type UploadFileArgs = {
  localPath: string;
  uploadPath?: string;
};

async function kieUploadFile(args: UploadFileArgs) {
  const { localPath, uploadPath } = args;
  if (!localPath || typeof localPath !== "string") {
    throw new Error("localPath is required (string)");
  }
  const absPath = path.isAbsolute(localPath)
    ? localPath
    : path.resolve(process.cwd(), localPath);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fsp.readFile(absPath);
  } catch (e) {
    throw new Error(
      `Could not read file at ${absPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const fileName = path.basename(absPath);
  const contentType = guessContentType(absPath);
  const boundary = `----dainami${Date.now()}${Math.random().toString(16).slice(2)}`;
  const fields: Record<string, string> = uploadPath ? { uploadPath } : {};
  const body = buildMultipartBody(
    fields,
    "file",
    fileName,
    fileBuffer,
    contentType,
    boundary,
  );

  const res = await httpRequest(
    "POST",
    KIE_UPLOAD_URL,
    {
      Authorization: `Bearer ${KIE_API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Accept-Encoding": "identity",
    },
    body,
  );

  const text = typeof res.body === "string" ? res.body : res.body.toString("utf8");
  let parsed: any = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }
  const url: string | null =
    (parsed && parsed.data && (parsed.data.downloadUrl || parsed.data.url)) || null;
  return {
    ok: res.status >= 200 && res.status < 300 && Boolean(url),
    status: res.status,
    url,
    localPath: absPath,
    bytes: fileBuffer.length,
    contentType,
    response: parsed,
  };
}

// ---------------------------------------------------------------------------
// Download — pull any URL to local disk.
// ---------------------------------------------------------------------------
type DownloadArgs = {
  url: string;
  destPath: string;
};

async function kieDownload(args: DownloadArgs) {
  const { url, destPath } = args;
  if (!url || typeof url !== "string") {
    throw new Error("url is required (string)");
  }
  if (!destPath || typeof destPath !== "string") {
    throw new Error("destPath is required (string)");
  }
  const absDest = path.isAbsolute(destPath)
    ? destPath
    : path.resolve(process.cwd(), destPath);
  await fsp.mkdir(path.dirname(absDest), { recursive: true });

  const res = await httpRequest(
    "GET",
    url,
    { "Accept-Encoding": "identity" },
    undefined,
    0,
    true,
  );
  const ok = res.status >= 200 && res.status < 300;
  if (ok && Buffer.isBuffer(res.body)) {
    await fsp.writeFile(absDest, res.body);
  }
  return {
    ok,
    status: res.status,
    destPath: absDest,
    bytes: Buffer.isBuffer(res.body) ? res.body.length : 0,
  };
}

// ---------------------------------------------------------------------------
// Model docs fetch — pull a model's live docs page from docs.kie.ai with a
// 3-day local cache. The agent uses this to learn payload shapes without us
// hand-maintaining per-model markdown.
// ---------------------------------------------------------------------------
type FetchDocsArgs = {
  path?: string;
  url?: string;
  force?: boolean;
};

function sanitizeCacheSegment(segment: string): string {
  // strip any leading/trailing slashes, collapse dangerous chars
  return segment
    .replace(/^[\/.]+|[\/.]+$/g, "")
    .replace(/[^a-zA-Z0-9_\-./]/g, "_");
}

function docsCachePathFor(url: string): string {
  // Map URL to a file path under DOCS_CACHE_DIR. Preserve the path structure
  // so cached files mirror the docs site layout (easy to inspect).
  const u = new URL(url);
  const relPath = sanitizeCacheSegment(u.pathname).replace(/^\/+/, "");
  const safe = (relPath.length > 0 ? relPath : "index").replace(/\.md$/i, "");
  return path.join(DOCS_CACHE_DIR, u.hostname, safe + ".md");
}

async function readCacheIfFresh(cachePath: string, ttlMs: number): Promise<string | null> {
  try {
    const stat = await fsp.stat(cachePath);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return await fsp.readFile(cachePath, "utf8");
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(cachePath), { recursive: true });
  await fsp.writeFile(cachePath, content, "utf8");
}

function resolveDocsUrl(args: FetchDocsArgs): string {
  let raw: string;
  if (args.url) {
    raw = /^https?:\/\//i.test(args.url) ? args.url : `https://${args.url.replace(/^\/+/, "")}`;
  } else if (args.path) {
    const p = args.path.replace(/^\/+/, "");
    const fullPath = p.startsWith("market/") || p.includes("-api/") ? `/${p}` : `/market/${p}`;
    raw = `${KIE_DOCS_BASE}${fullPath}`;
  } else {
    throw new Error("kie_fetch_model_docs requires either { path } (e.g. 'google/nanobanana2') or { url }");
  }

  // docs.kie.ai serves a compact markdown source when the URL ends in `.md`.
  // Rendered HTML is ~400KB; markdown is ~20KB. Always prefer the .md form
  // when the host is docs.kie.ai and the URL doesn't already specify a format.
  try {
    const u = new URL(raw);
    if (u.hostname === "docs.kie.ai" && !u.pathname.endsWith(".md") && !u.search) {
      u.pathname = u.pathname + ".md";
      return u.toString();
    }
  } catch {
    // leave raw alone if it's somehow malformed; httpRequest will reject it
  }
  return raw;
}

async function kieFetchModelDocs(args: FetchDocsArgs) {
  const url = resolveDocsUrl(args);
  const cachePath = docsCachePathFor(url);
  const force = args.force === true;

  if (!force) {
    const cached = await readCacheIfFresh(cachePath, DOCS_CACHE_TTL_MS);
    if (cached !== null) {
      return {
        ok: true,
        url,
        cached: true,
        cachePath,
        content: cached,
      };
    }
  }

  const res = await httpRequest("GET", url, { "Accept-Encoding": "identity" });
  const text = typeof res.body === "string" ? res.body : res.body.toString("utf8");
  const ok = res.status >= 200 && res.status < 300;

  if (ok && text.length > 0) {
    await writeCache(cachePath, text);
  }

  return {
    ok,
    status: res.status,
    url,
    cached: false,
    cachePath: ok ? cachePath : null,
    content: ok ? text : null,
    error: ok ? null : `HTTP ${res.status} fetching ${url}`,
  };
}

// ---------------------------------------------------------------------------
// Resources — served from <repo>/resources/ (resolved relative to dist/index.js).
// New markdown files appear automatically in ListResources.
// ---------------------------------------------------------------------------
type ResourceEntry = {
  uri: string;
  name: string;
  mimeType: string;
};

async function listResourceFiles(): Promise<ResourceEntry[]> {
  if (!fs.existsSync(RESOURCES_DIR)) return [];
  const entries: ResourceEntry[] = [];
  async function walk(dir: string): Promise<void> {
    const items = await fsp.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile() && item.name.endsWith(".md")) {
        const rel = path.relative(RESOURCES_DIR, full).replace(/\\/g, "/");
        const stem = rel.replace(/\.md$/, "");
        entries.push({
          uri: `kie://${stem}`,
          name: stem,
          mimeType: "text/markdown",
        });
      }
    }
  }
  await walk(RESOURCES_DIR);
  return entries.sort((a, b) => a.uri.localeCompare(b.uri));
}

async function readResource(uri: string) {
  if (typeof uri !== "string" || !uri.startsWith("kie://")) {
    throw new Error(`Unsupported URI scheme: ${uri}`);
  }
  const rel = uri.replace(/^kie:\/\//, "") + ".md";
  const abs = path.resolve(RESOURCES_DIR, rel);
  if (!abs.startsWith(RESOURCES_DIR + path.sep) && abs !== RESOURCES_DIR) {
    throw new Error("Path traversal blocked");
  }
  const text = await fsp.readFile(abs, "utf8");
  return { contents: [{ uri, mimeType: "text/markdown", text }] };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const SERVER_INSTRUCTIONS = `
You are connected to KIE.ai through the kie-mcp connector.

## Async jobs — always submit + poll
- Image, video, and music jobs are asynchronous. Submit with kie_post, then poll with kie_get.
- Most models use the **Standard envelope**:
  - Submit: POST /api/v1/jobs/createTask with { model, input: { ... } }
  - Poll: GET /api/v1/jobs/recordInfo?taskId=...
  - Poll response: data.state ∈ { waiting, generating, success, fail }; results at data.resultJson.resultUrls[].
  - On fail: reason at data.failMsg.
- Some models use **custom envelopes** — read the model's resource before calling. Known exceptions:
  - **Veo (veo3, veo3_fast, veo3_lite)** — submit POST /api/v1/veo/generate (no nested input, camelCase fields), poll GET /api/v1/veo/record-info?taskId=..., uses successFlag (0/1/2/3) and data.resultUrls is a JSON-encoded string (parse it).
  - **Suno music (V4 / V4_5 / V5 / V5_5)** — submit POST /api/v1/generate, poll GET /api/v1/generate/record-info, states are PENDING / TEXT_SUCCESS / FIRST_SUCCESS / SUCCESS / *_FAILED / SENSITIVE_WORD_ERROR.
  - **flux-kontext-pro** — submit POST /api/v1/flux/kontext/generate (top-level fields, no nested input, camelCase). Poll on standard recordInfo.
- Always PERSIST data.taskId IMMEDIATELY after submit, before polling — if the session drops mid-poll, the credits are gone.
- Cost is billed on submit, NOT on poll. Never resubmit a live taskId — always check the existing taskId's state first.
- Do not block waiting on long jobs. Sweep-poll on ~20–30s cadence, doing other work between sweeps.

## Local files as KIE references
- KIE requires hosted URLs for @Image / @Video references. To use a local file, call kie_upload_file({ localPath }).
- Uploaded URLs are KIE-hosted and typically valid ~3 days. Cache them in your project if you'll reuse them.
- Do NOT echo KIE_API_KEY anywhere — it is sourced from env and stays in the server.

## Result downloads
- Use kie_download({ url, destPath }) to save a result URL to local disk. Parent dirs are created.

## Model discovery — read the live docs, don't guess
You do NOT have per-model docs bundled with this MCP. That is intentional: KIE adds models constantly and bundled docs go stale. Instead:

1. Read kie://models/_index — flat catalogue of every KIE model (name, category, docs URL).
2. Find the docs URL for the model you want to use.
3. Call kie_fetch_model_docs({ path: "<provider>/<model>" }) — or { url } if the index gave you one. The page is cached locally for ~3 days, so first use of a model per ~3 days costs one fetch; everything after is free.
4. From the fetched docs, read the exact slug used in the API body (sometimes differs from the URL — e.g. URL '/market/google/pro-image-to-image' has slug 'nano-banana-pro').
5. Construct the call with kie_post.

## Self-correction on parameter errors
If kie_post returns a 4xx with a parameter-error message (e.g. "missing required field", "422 model not supported"):
- Re-fetch the docs with kie_fetch_model_docs({ path, force: true }) to bust the cache in case the spec changed.
- Adjust the body to match what the docs actually say.
- Retry. Failed createTask calls are typically NOT billed by KIE (billing starts when generation actually runs), so a retry is cheap.

## What NOT to do
- Don't use any blocking submit-and-wait pattern — this server intentionally doesn't expose one.
- Don't construct multipart uploads by hand — use kie_upload_file.
- Don't guess payload shapes from memory or training data — always fetch the docs.
- Don't print the API key.
`.trim();

const server = new Server(
  { name: "dainami-kie-mcp", version: "0.3.0" },
  {
    capabilities: { tools: {}, resources: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "kie_post",
      description:
        "POST to any KIE.ai endpoint. Used to submit generation tasks. Returns { status, ok, body }. For payload shapes, read kie://models/<name>.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Endpoint path (e.g. '/api/v1/jobs/createTask') or full URL.",
          },
          body: {
            type: "object",
            description: "Request body as JSON.",
            additionalProperties: true,
          },
        },
        required: ["path", "body"],
      },
    },
    {
      name: "kie_get",
      description:
        "GET from any KIE.ai endpoint. Typically used for polling task status (e.g. '/api/v1/jobs/recordInfo?taskId=...'). Returns { status, ok, body }.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Endpoint path or full URL.",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "kie_upload_file",
      description:
        "Upload a local file to KIE's storage and get back a hosted URL (~3 day TTL). Use whenever a model needs an @Image/@Video reference and you only have a local path. Returns { ok, status, url, bytes }.",
      inputSchema: {
        type: "object",
        properties: {
          localPath: {
            type: "string",
            description:
              "Path to the local file. Absolute, or relative to the MCP process's working directory.",
          },
          uploadPath: {
            type: "string",
            description: "Optional namespace/folder on KIE's storage (e.g. 'aceofplates/refs').",
          },
        },
        required: ["localPath"],
      },
    },
    {
      name: "kie_download",
      description:
        "Download a URL (typically a KIE result URL) to a local file. Creates parent directories. Returns { ok, status, destPath, bytes }.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to download." },
          destPath: {
            type: "string",
            description:
              "Local file path to write. Absolute, or relative to the MCP process's working directory.",
          },
        },
        required: ["url", "destPath"],
      },
    },
    {
      name: "kie_fetch_model_docs",
      description:
        "Fetch a KIE.ai model's live documentation page (from docs.kie.ai/market/...). Result is cached locally for ~3 days so re-use across chats is free. Use this whenever you're about to call a model whose payload shape you don't already know in the current session. Returns { ok, url, cached, content }.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Docs path under /market — e.g. 'google/nanobanana2', 'bytedance/seedance-2', 'wan/2-7-image-to-video'. Look up the right path in kie://models/_index.",
          },
          url: {
            type: "string",
            description:
              "Full docs URL. Alternative to path. Useful for non-/market namespaces like /veo3-api/quickstart, /suno-api/generate-music.",
          },
          force: {
            type: "boolean",
            description:
              "Force a fresh fetch, bypassing the 3-day local cache. Use this if a previous call to the model failed with a parameter error and you suspect the cached spec is stale. Default false.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: await listResourceFiles(),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  return await readResource(req.params.uri);
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs } = req.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  try {
    if (name === "kie_post") {
      const result = await kieFetch("POST", args.path as string, args.body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "kie_get") {
      const result = await kieFetch("GET", args.path as string);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "kie_upload_file") {
      const result = await kieUploadFile(args as unknown as UploadFileArgs);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "kie_download") {
      const result = await kieDownload(args as unknown as DownloadArgs);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "kie_fetch_model_docs") {
      const result = await kieFetchModelDocs(args as unknown as FetchDocsArgs);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[dainami-kie-mcp] running on stdio (v0.3.0 — live-docs discovery via kie_fetch_model_docs)`,
);
