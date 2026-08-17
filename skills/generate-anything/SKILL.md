---
name: generate-anything
description: Generate images, video, music, speech, avatars and more on command through the kie MCP — one connector into every model on KIE.ai (GPT-Image, Nano Banana, Seedream, Flux, Seedance, Kling, Veo, Wan, Runway, Suno, ElevenLabs). Give it what you want ("a UGC video of this bottle", "upscale this to 4K", "make this photo talk", "a 10s upbeat track") and it picks the right model, looks up its spec, crafts the prompt, tells you the price in dollars and waits for your go, then submits, polls, and downloads the file. Also answers "how much would X cost" without generating. Use whenever you want Claude to make a visual or audio asset.
---

# generate-anything — make any asset via the kie MCP

Tools: `kie_post`, `kie_get`, `kie_upload_file`, `kie_download`, `kie_fetch_model_docs`.

**The rule that makes this work: you are not limited to the models named below.** KIE hosts ~100 models. The named ones are tuned defaults. For anything else, look it up and call it — that path is normal, not exceptional.

## The flow (every generation)

1. **Identify the job** (capability table below) — not the vendor.
2. **Pick the model** (see Choosing the model). Default from the table, or discover one.
3. **Know the payload.** If it's not written in this file and you haven't fetched it this session → `kie_fetch_model_docs` first. Never call a model blind.
4. **Quote the price and wait for the go** (see The price line). Nothing is ever submitted before the user says yes.
5. **Upload** any local reference → `kie_upload_file({ localPath })` → use the returned URL. (A URL already hosted by KIE can be passed straight through.)
6. **Submit** → `kie_post` `/api/v1/jobs/createTask` with `{ model, input }`. **Save the `taskId` immediately.**
7. **Poll** → `kie_get` `/api/v1/jobs/recordInfo?taskId=…` until `data.state` is `success` (or `fail` → read `data.failMsg`). States: `waiting / queuing / generating / success / fail`.
8. **Download** → `kie_download({ url: data.resultJson.resultUrls[0], destPath })`. Result URLs expire ~24h.

## Discovery — when the ask isn't in the table

1. Consult `kie://models/_index` for the right docs path.
2. `kie_fetch_model_docs({ path: "google/nanobanana2" })` — cached ~3 days, so this is nearly free.
3. Call it using the flow above.

Use `force: true` on the fetch if a call failed with a parameter error — the cached spec is probably stale.

## The price line — every generation, before every submit

Before ANY submit, say one short line — the model and what it costs, in credits **and dollars** — then **wait for the go**:

> *"Seedance 2.0 Mini — ~102 credits (~$0.51). Go?"*

Rules:

- **Dollar math:** credits × **$0.005** (1000 credits = $5 at the standard rate; bigger top-up packs include bonus credits, so heavy users effectively pay slightly less).
- **Where the price comes from:** the **first time** a model is used in a session, read its live page on kie.ai with your web-fetch capability (each model's market page shows current credit pricing; `kie_fetch_model_docs` returns the API spec only, no prices) — once. Cache it for the session; every quote after that is arithmetic. Video prices are *rates*, not flat numbers — cost scales with duration and resolution — so compute from the actual job settings. The ballpark numbers in this file can serve the instant quote for the tuned defaults, but verify against the live page on a model's first use.
- **Don't repeat the balance.** The quote line is cost only. Check the balance (`GET /api/v1/chat/credit` — free, instant, `data` is the number) only when the job might exceed or nearly drain it, or the user asks "how much do I have left." If funds won't cover the job → say so and don't submit: *"This costs ~450 credits but you have 320 — top up first."*
- **Batches:** quote **one total** for the whole set — *"5 variations — ~510 credits (~$2.55) total. Go?"* — one yes covers the batch.
- **Price-only questions** ("how much would a 10s Kling video cost?"): fetch, calculate, answer. Generate nothing.
- **The only way the wait is skipped is the user saying so** ("stop asking, just generate"). Then still state the price on each generation — just don't wait. Never decide to skip the confirmation yourself.

## Choosing the model

**Default path (user said nothing about models):** pick the default from the table. The price line names it; if there's one alternative worth knowing, add it there — *"Kling 3.0 would be sharper at ~3× the price."*

**User named a model:** use it. No second-guessing, no pitching alternatives. If its spec isn't in this file, look it up first.

**User asks to change, or asks what's better:** now give them the real comparison — 2–3 candidates, each with what it's better at and what it costs (fetch live prices). Be concrete about the tradeoff (fidelity, speed, credits, max duration, audio support), not vague about "quality." Then use their pick.

**Remember the choice for the session.** If they switch to Kling 3.0, stay on Kling for subsequent videos in that conversation — don't silently revert to the default on the next request. If they switch category (video → image), the new category's default goes in the price line as normal.

## Route the job → a model

| The job | Default | Reach further |
|---|---|---|
| Image from text | `gpt-image-2-text-to-image` | Nano Banana 2, Seedream 5 Pro, Flux-2 Pro, Imagen4, Qwen3 |
| Image from references | `gpt-image-2-image-to-image` | Nano Banana Pro/Edit, Seedream 5 Pro i2i, Flux-2 Pro i2i |
| Image with character consistency | — | Ideogram Character / Character Remix |
| Upscale an image | — | Topaz image upscale, Recraft crisp upscale |
| Remove a background | — | Recraft remove-background |
| Video from text | `bytedance/seedance-2-mini` | Seedance 2.0 (full), Kling 3.0, Veo 3.1, Wan 2.7, MiniMax H3 |
| Video from a still | `bytedance/seedance-2-mini` + `first_frame_url` | Seedance 2.0, Kling 3.0 / V3 Turbo, Hailuo 2.3, PixVerse V6 |
| First + last frame transition | Seedance (`first_` + `last_frame_url`) | PixVerse V6 transition |
| Extend a video | — | Grok Imagine extend, Runway extend, Veo 3.1 extend |
| Edit an existing video | — | Wan 2.7 video edit, Wan 2.6 v2v, Runway Aleph |
| Talking head / lip sync | — | OmniHuman 1.5, Kling AI Avatar, Infinitalk, Volcengine lip sync |
| Upscale a video / get 4K | — | Topaz video upscale, Veo 3.1 4K endpoint |
| Music | Suno | — |
| Speech / voiceover | — | ElevenLabs (multilingual v2, turbo 2.5, dialogue v3), Gemini Flash TTS |
| Sound effects | — | Suno generate-sounds |

Anything not listed: **discover it.** A "—" means no tuned default, not "unsupported."

## The API contract

Nearly every Market model uses the shared flow above. **Exceptions live in their own namespace** with their own endpoints and states — fetch their docs before use:

- **Suno** (music) — `/api/v1/generate`, poll `/api/v1/generate/record-info`, states `PENDING / TEXT_SUCCESS / FIRST_SUCCESS / SUCCESS / *_FAILED`
- **Veo 3.1** — `/veo3-api/…` (separate endpoints for 1080p and 4K retrieval)
- **Runway**, **4o Image**, **Flux Kontext** — each their own namespace

---

# Prompt craft — the part that isn't in any doc

## Images (GPT-Image-2 and most image models)

```jsonc
{ "model":"gpt-image-2-text-to-image",
  "input":{ "prompt":"…", "aspect_ratio":"9:16", "resolution":"2K" } }   // 1K/2K/4K; 1:1,3:4,9:16,16:9
{ "model":"gpt-image-2-image-to-image",
  "input":{ "prompt":"…", "input_urls":["…"], "aspect_ratio":"3:4", "resolution":"2K" } }  // up to 16 refs
```

- Describe the scene concretely. **Quote on-screen text exactly** ("the word ZERO in coral, bottom").
- For **logos**, pass them as refs and say *"use image N exactly, do not redraw."*
- To exclude text: *"no text, no logos, no watermarks."*
- Transient `500`s are common — just resubmit. A failed job costs 0.

**Diagram example (logos in as refs):**
> *"A clean professional architecture diagram of an AI automation workflow on a dark slate background. Nodes left→right: a trigger → Claude (reasoning) → a router fanning to 3 tools → a database → an output. Use the provided logo PNGs exactly, do not redraw. Crisp labels under each node, thin connecting lines with arrowheads, subtle grid, coral/teal accents, legible text. 3:4."*

## Video (Seedance 2.0 Mini and most video models)

```jsonc
{ "model":"bytedance/seedance-2-mini",
  "input":{ "prompt":"…",
            "first_frame_url":"…",     // OPTIONAL — omit for text→video
            "resolution":"720p",        // 480p (cheaper) | 720p
            "aspect_ratio":"9:16",      // 1:1,4:3,3:4,16:9,9:16,21:9,adaptive
            "duration":5,               // 4–15
            "generate_audio":false } }  // DEFAULTS TRUE — set false unless you want sound
```

`first_frame_url`, `first+last`, and `reference_image_urls` are **mutually exclusive** — pick one.

- Recipe: *subject + action + camera + environment + style.*
- **The best results come from a still → image→video.** Control the look in the image, then only direct motion in the video prompt. Two-step, almost always worth it.
- For image→video, **direct what HAPPENS** — layered motion, concrete verbs (*sweeps, drifts, orbits, whips, bursts*), a real camera move (*slow dolly-in, orbit, push-in*).
- **Don't over-damp** — "smooth / calm / locked" flattens the result.
- Keep on-screen text SHORT and **baked into the still** — typed-out text drifts.
- ⚠️ Naming a copyrighted studio ("Studio Ghibli") gets the video **rejected by the filter**. Use generic descriptors ("soft hand-painted 2D watercolour animation").

**UGC product ad — the tuned workflow:**
1. Upload a clean **product photo** (no labels/watermarks, or the model recreates them).
2. Either use it directly as `first_frame_url`, or first make a still of a person holding it, then animate that.
3. UGC = **iPhone/handheld, NEVER "cinematic":**
   > *"9:16, 5s, single continuous shot, UGC iPhone handheld selfie. A woman in her mid-20s holds the product up near her shoulder and gestures as she talks to camera, natural head movement, warm genuine smile, slight handheld shake, soft window light, authentic phone-quality. No text."*

   `generate_audio:false` for a clean plate you'll dub, `true` for a talking VO you'll keep.

**B-roll (text→video):**
> *"9:16, 5s. Slow push over a cluttered desk with glowing screens, warm light, dust drifting through the beam, papers fluttering. Filmic, shallow depth of field. No text."*

## Music (Suno)

Genre + mood + tempo + instrumentation + "no vocals" (for a bed) + "mixed to sit under a voiceover."
> *"energetic electronic beat-forward instrumental, punchy drums, driving bass, ~124 bpm, no vocals, mixed to sit under a voiceover."*

---

## Cost — billed on submit

Rough ballparks for instant quotes: images ~10–50 credits. Video ~100–500 (Seedance 2.0 Mini 5s @720p ≈ 102). Suno varies. First use of a model in a session → verify against its live kie.ai page (see The price line).

- Balance: `GET /api/v1/chat/credit` → `data` is the credit number. Free and instant — but only check it when funds are in question or the user asks.
- **Never resubmit a live taskId** — it double-bills.

## When it breaks

| Symptom | Do this |
|---|---|
| `500` on submit | Resubmit. Costs 0. |
| Parameter/validation error | Re-fetch docs with `force: true`. Spec drifted. |
| `state: fail` | Read `failMsg` **before** retrying. Filter rejections need a rewritten prompt, not a retry. |
| Text drifting in video | Bake it into the still instead. |
| Motion looks dead | Remove the damping words, add a camera move. |

## Batches

Submit all, **save every taskId**, poll each on a ~30s cadence — do other work between polls, don't block. A dropped session loses nothing: re-poll the saved taskIds.

## The one rule

You own the **connector**; you **rent the models** underneath. When a better model ships, you don't edit this file — the lookup finds it.
