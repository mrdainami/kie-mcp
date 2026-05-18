#!/usr/bin/env node
/**
 * @dainami/kie-mcp
 *
 * Minimal MCP server for calling any KIE.ai endpoint. Pure HTTP shim — no model
 * registry, no validation. The agent reads docs.kie.ai for each model's JSON shape
 * and constructs the payload itself. This file never needs to know about gpt-image-2
 * vs seedance vs suno.
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

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE_URL = (process.env.KIE_BASE_URL ?? "https://api.kieai.com").replace(/\/+$/, "");

if (!KIE_API_KEY) {
  console.error("[dainami-kie-mcp] KIE_API_KEY environment variable is required");
  process.exit(1);
}

type FetchResult = {
  status: number;
  ok: boolean;
  body: unknown;
};

async function kieFetch(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<FetchResult> {
  const url = path.startsWith("http") ? path : `${KIE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      "Content-Type": "application/json",
      // Disable gzip — some KIE responses gzip silently and confuse downstream parsers
      "Accept-Encoding": "identity",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }
  return { status: res.status, ok: res.ok, body: parsed };
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
  // KIE's unified API: POST /api/v1/jobs/createTask returns { data: { taskId } };
  // GET /api/v1/jobs/recordInfo?taskId=X returns { data: { state: "success"|"failed"|"waiting"|... } }.
  // Override the defaults if a model uses a different envelope (check docs.kie.ai).
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
        return { ok: true, taskId, polls, response: pollRes };
      }
      if (state === failValue || String(state) === String(failValue)) {
        return {
          ok: false,
          stage: "poll" as const,
          taskId,
          polls,
          error: `KIE state=${JSON.stringify(state)}`,
          response: pollRes,
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }

  return {
    ok: false,
    stage: "timeout" as const,
    taskId,
    polls,
    error: `Timed out after ${timeoutSec}s`,
    lastPoll,
  };
}

const server = new Server(
  { name: "dainami-kie-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "kie_post",
      description:
        "POST to any KIE endpoint. Use this to submit a generation task for any KIE model (gpt-image-2, nano-banana-2, bytedance/seedance-2, kling-3.0, suno-v4, etc.). Construct `body` from the model's docs at https://docs.kie.ai — every model has its own JSON shape (different field names, duration ranges, aspect ratios). Returns the raw KIE response (typically `{ code, msg, data: { taskId } }`). For most jobs you'll want kie_run_and_wait instead — only use this directly if you need custom polling.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Path relative to KIE base URL (default https://api.kieai.com). Example: '/api/v1/gpt4o-image/generate'. Full URLs are also accepted.",
          },
          body: {
            type: "object",
            description:
              "JSON body for the model. Shape comes from https://docs.kie.ai for the specific model you're calling.",
            additionalProperties: true,
          },
        },
        required: ["path", "body"],
        additionalProperties: false,
      },
    },
    {
      name: "kie_get",
      description:
        "GET from any KIE endpoint. Primary use: poll a task by ID once. Returns whatever KIE returns. For polling loops use kie_run_and_wait instead — only call this directly when you need fine control over poll timing (e.g. expensive Suno tasks where you want to space out polls).",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Path relative to KIE base URL. Example: '/api/v1/gpt4o-image/record-info?taskId=abc123'.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "kie_run_and_wait",
      description:
        "Submit a generation task and poll until it completes (or fails / times out). The everyday tool for KIE work. Defaults match KIE's unified jobs API: POST /api/v1/jobs/createTask returns { data: { taskId } }; GET /api/v1/jobs/recordInfo?taskId=X returns { data: { state: 'success'|'failed'|'waiting'|'generating' } }. Override only if a specific model uses a non-unified envelope (rare — check https://docs.kie.ai).",
      inputSchema: {
        type: "object",
        properties: {
          submitPath: {
            type: "string",
            description:
              "POST endpoint to submit the task. Usually '/api/v1/jobs/createTask' (unified) — model goes inside body.",
          },
          body: {
            type: "object",
            description:
              "JSON body to submit. For unified API: { model: '<model-id>', input: { ... } }. Shape comes from https://docs.kie.ai.",
            additionalProperties: true,
          },
          pollPath: {
            type: "string",
            description:
              "GET endpoint for polling. Use '{taskId}' as a placeholder. Usually '/api/v1/jobs/recordInfo?taskId={taskId}'.",
          },
          taskIdPath: {
            type: "string",
            description: "Dot path to extract taskId from submit response. Default 'data.taskId'.",
          },
          stateField: {
            type: "string",
            description: "Dot path to the state value in poll response. Default 'data.state'.",
          },
          successValue: {
            description: "Value of stateField that means done. Default 'success'.",
          },
          failValue: {
            description: "Value of stateField that means failed. Default 'failed'.",
          },
          timeoutSec: {
            type: "number",
            description: "Max wait seconds. Default 900 (15 min). Use 1800+ for Suno music.",
          },
          intervalSec: {
            type: "number",
            description: "Poll interval seconds. Default 8.",
          },
        },
        required: ["submitPath", "body", "pollPath"],
        additionalProperties: false,
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
console.error(`[dainami-kie-mcp] running on stdio — base ${KIE_BASE_URL}`);
