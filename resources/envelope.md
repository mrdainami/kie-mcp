# KIE job envelope — the universal pattern

Every generation job on KIE.ai (image, video, music) follows the same submit-and-poll lifecycle. The standing instructions cover the bare essentials; this document is the deeper reference.

## Submit

```
POST /api/v1/jobs/createTask
Authorization: Bearer <KIE_API_KEY>
Content-Type: application/json

{
  "model": "<model-slug>",
  "input": { ...model-specific fields... },
  "callBackUrl": "<optional webhook>"
}
```

### Submit response

```
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "abc123..."          // ← the handle you must persist
  }
}
```

The `taskId` is the only piece of state worth keeping. Write it to your project (a sidecar JSON, a database row, whatever) **before** you call kie_get. If your session dies mid-poll and you don't have the taskId saved, you've burned credits with no way to recover the result.

## Poll

```
GET /api/v1/jobs/recordInfo?taskId=abc123
Authorization: Bearer <KIE_API_KEY>
```

### Poll response

```
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "abc123",
    "model": "...",
    "state": "waiting" | "generating" | "success" | "fail",
    "param": { ... echo of submit payload ... },
    "resultJson": "<JSON string OR object>",
    "failMsg": "...",              // only on fail
    "costCredits": 5,
    "createTime": 17xxxxxxxxx,
    "completeTime": 17xxxxxxxxx
  }
}
```

`data.state` is the field to read. Final states are `success` and `fail`.

### Parsing `resultJson`

`resultJson` is sometimes a JSON-encoded string, sometimes an object — depends on the model. Always handle both. Typical shape:

```
resultJson = {
  "resultUrls": [
    "https://tempfile.redpandaai.co/.../result.png",
    "https://tempfile.redpandaai.co/.../result-2.png"
  ]
}
```

For most models you want `resultJson.resultUrls[0]`. Video/music models may add `audioUrl`, `videoUrl`, `coverImageUrl`, etc. — read the per-model resource for specifics.

## Cadence

- Sweep-poll: one `kie_get` per outstanding taskId per pass, every 20–30s.
- Don't long-poll or block. The MCP host has a ~60s tool ceiling and your tool call will die first.
- Between sweeps, do something useful (write the next prompt, let the user review what landed). KIE jobs render concurrently — N submits = wall clock of one.

## Billing

- Cost is incurred at `createTask`, not at `recordInfo`. Polling is free.
- **Never resubmit a live taskId** to "retry" — it doubles the bill. Always check the existing taskId's state first; if `state` is still `waiting`/`generating`, just keep polling.

## Failure modes

- `state: "fail"` → `data.failMsg` has the reason. Common causes: invalid input URL, prompt blocked by safety filter, malformed payload.
- HTTP error on submit → no taskId returned; nothing was billed. Safe to fix and retry.
- HTTP error on poll → taskId is still alive on KIE's side. Retry the poll, don't resubmit.

## Webhooks (optional)

If your client can receive HTTPS callbacks, pass `callBackUrl` in the submit body. KIE will POST the same response shape as `recordInfo` once the job finishes. This is purely additive — you can still poll. Useful for very long video jobs.
