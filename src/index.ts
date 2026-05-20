#!/usr/bin/env node
/**
 * @dainami/kie-mcp
 *
 * Minimal MCP server for calling any KIE.ai endpoint. Pure HTTP shim — no model
 * registry, no validation. The agent reads docs.kie.ai for each model's JSON shape
 * and constructs the payload itself. This file never needs to know about gpt-image-2
 * vs seedance vs suno.
 *
 * HTTP is done with Node's built-in `node:https` module — no fetch, no axios,
 * no undici. Some MCP host runtimes (notably Claude Cowork) don't expose global
 * `fetch` and block the undici module loader. `node:https` always works.
 *
 * Tools:
 *   kie_post(path, body)           — POST to any KIE endpoint
 *   kie_get(path)                  — GET (typically polling)
 *   kie_run_and_wait(...)          — submit + poll until done
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as https from "node:https";
import * as http from "node:http";

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE_URL = (process.env.KIE_BASE_URL ?? "https://api.kie.ai").replace(/\/+$/, "");

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

/**
 * Minimal fetch-like wrapper over node:http(s).request with redirect handling.
 * Returns the raw body as a string; callers parse JSON themselves.
 */
function httpRequest(
  method: string,
  urlStr: string,
  headers: HttpHeaders,
  body?: string,
  redirectCount = 0,
): Promise<{ status: number; body: string; headers: NodeJS.Dict<string | string[]> }> {
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
    if (body !== undefined && !reqHeaders["Content-Length"]) {
      reqHeaders["Content-Length"] = String(Buffer.byteLength(body));
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

        // Follow redirects (up to 5)
        const location = res.headers.location;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          typeof location === "string" &&
          redirectCount < 5
        ) {
          // Consume the body to free the socket
          res.resume();
          // 303 always becomes GET; 301/302 historically become GET; 307/308 keep method
          const newMethod =
            status === 307 || status === 308 ? method : "GET";
          const newBody = newMethod === method ? body : undefined;
          const nextUrl = new URL(location, urlStr).toString();
          resolve(httpRequest(newMethod, nextUrl, headers, newBody, redirectCount + 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status,
            body: Buffer.concat(chunks).toString("utf8"),
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
  path: string,
  body?: unknown,
): Promise<FetchResult> {
  const url = path.startsWith("http") ? path : `${KIE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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

  let parsed: unknown = res.body;
  try {
    parsed = res.body.length > 0 ? JSON.parse(res.body) : null;
  } catch {
    // leave as text
  }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, body: parsed };
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<any>(
    (acc, key) => (acc == null ? acc : acc[key]),
    obj as any,
  );
}

type RunAndWaitArgs = {
  submitPath: string;
  body: Record<string, unknown>;
  pollPath: string;
  taskIdPath?: string;
  stateField?: string;
  successValue?: unknown;
  failValue?: unknown;
  timeoutSec?: number;
  intervalSec?: number;
};

async function runAndWait(args: RunAndWaitArgs) {
  const taskIdPath = args.taskIdPath ?? "data.taskId";
  const stateField = args.stateField ?? "data.state";
  const successValue = args.successValue ?? "success";
  const failValue = args.failValue ?? "failed";
  const timeoutSec = args.timeoutSec ?? 900;
  const intervalSec = args.intervalSec ?? 8;

  const submitRes = await kieFetch("POST", args.submitPath, args.body);
  if (!submitRes.ok) {
    return { ok: false, stage: "submit" as const, response: submitRes };
  }

  const taskId = getByPath(submitRes.body, taskIdPath);
  if (taskId == null) {
    return {
      ok: false,
      stage: "submit" as const,
      error: `No taskId found at '${taskIdPath}' in submit response`,
      response: submitRes,
    };
  }

  const pollPath = args.pollPath.replace("{taskId}", String(taskId));
  const deadline = Date.now() + timeoutSec * 1000;
  let lastPoll: FetchResult | null = null;
  let polls = 0;

  while (Date.now() < deadline) {
    const pollRes = await kieFetch("GET", pollPath);
    lastPoll = pollRes;
    polls++;

    if (pollRes.ok) {
      const state = getByPath(pollRes.body, stateField);
      if (state === successValue || String(state) === String(successValue)) {
        return {
          ok: true,
          stage: "complete" as const,
          taskId,
          polls,
          response: pollRes,
        };
      }
      if (state === failValue || String(state) === String(failValue)) {
        return {
          ok: false,
          stage: "poll" as const,
          taskId,
          polls,
          response: pollRes,
        };
      }
    }

    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }

  return {
    ok: false,
    stage: "timeout" as const,
    timeoutSec,
    polls,
    response: lastPoll,
  };
}

const server = new Server(
  { name: "dainami-kie-mcp", version: "0.1.4" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "kie_post",
      description:
        "POST to any KIE.ai endpoint. Used to submit generation tasks. Returns { status, ok, body }. The agent reads docs.kie.ai for the JSON shape each model expects.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Endpoint path (e.g. '/api/v1/jobs/createTask') or full URL." },
          body: { type: "object", description: "Request body as JSON.", additionalProperties: true },
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
          path: { type: "string", description: "Endpoint path or full URL." },
        },
        required: ["path"],
      },
    },
    {
      name: "kie_run_and_wait",
      description:
        "Submit a task to KIE and poll until it completes. Default polling: every 8s, timeout 900s (15min). Override taskIdPath / stateField / successValue / failValue per model if the endpoint uses a non-default envelope.",
      inputSchema: {
        type: "object",
        properties: {
          submitPath: { type: "string", description: "POST path for task submission. Usually '/api/v1/jobs/createTask'." },
          body: { type: "object", description: "Submit body.", additionalProperties: true },
          pollPath: { type: "string", description: "GET path with '{taskId}' placeholder. Usually '/api/v1/jobs/recordInfo?taskId={taskId}'." },
          taskIdPath: { type: "string", description: "Path to taskId in submit response. Default 'data.taskId'." },
          stateField: { type: "string", description: "Path to state field in poll response. Default 'data.state'." },
          successValue: { type: "string", description: "Value that signals success. Default 'success'." },
          failValue: { type: "string", description: "Value that signals failure. Default 'failed'." },
          timeoutSec: { type: "number", description: "Max seconds to poll. Default 900." },
          intervalSec: { type: "number", description: "Seconds between polls. Default 8." },
        },
        required: ["submitPath", "body", "pollPath"],
      },
    },
  ],
}));

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

    if (name === "kie_run_and_wait") {
      const result = await runAndWait(args as unknown as RunAndWaitArgs);
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
console.error(`[dainami-kie-mcp] running on stdio (v0.1.4 — node:https, no fetch dep)`);
