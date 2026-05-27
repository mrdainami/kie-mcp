# KIE file upload

Most KIE models accept reference inputs as **public URLs**, not raw bytes. To use a local file as a reference, upload it first and pass the resulting URL into the model's payload.

The `kie_upload_file` tool handles the multipart-form details — call it instead of constructing the upload by hand.

## Tool

```
kie_upload_file({ localPath, uploadPath? })
```

- `localPath` — absolute, or relative to the MCP process's working directory.
- `uploadPath` — optional namespace on KIE storage (e.g. `"my-project/refs"`). Helps keep your uploaded files organized; defaults to KIE's root.

### Response

```
{
  "ok": true,
  "status": 200,
  "url": "https://tempfile.redpandaai.co/kieai/.../file.png",
  "localPath": "/abs/path/to/file.png",
  "bytes": 384210,
  "contentType": "image/png",
  "response": { ... raw KIE response ... }
}
```

## TTL

Uploaded URLs are KIE-hosted and live ~3 days. If you'll reuse the same reference across multiple generations or sessions, cache `(localPath → url, uploadedAt)` in your project so you don't re-upload every time.

## What can be uploaded

KIE accepts the usual reference formats:

- Images: `.png`, `.jpg`/`.jpeg`, `.webp`, `.gif`
- Video: `.mp4`, `.mov`, `.webm`
- Audio: `.mp3`, `.wav`, `.m4a`

Other binary types upload fine but may not be referenced by any model.

## Endpoint (under the hood)

```
POST https://kieai.redpandaai.co/api/file-stream-upload
Authorization: Bearer <KIE_API_KEY>
Content-Type: multipart/form-data

  file=<the bytes>
  uploadPath=<optional>
```

You should not need to know this — use the tool. But if you ever need to verify behaviour with curl outside this MCP, the endpoint above is what `kie_upload_file` calls.

## Security

The API key is sourced from the MCP server's environment and never crosses the tool boundary. Don't try to read it out via tool calls or shell commands — it isn't exposed to you.
