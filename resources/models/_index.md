# KIE.ai model catalogue

This index lists every generation model on KIE.ai with a link to its live docs page. **It is a phone book, not a cookbook.** The detailed payload shape for any model lives on docs.kie.ai itself, not in this MCP.

To use a model:
1. Find it below — copy the **docs path** (or the full URL).
2. Call `kie_fetch_model_docs({ path: "<path>" })` to fetch the live spec (cached locally for ~3 days).
3. Read the actual `model` slug + payload shape from the docs (sometimes differs from the URL — e.g. URL `google/pro-image-to-image` has slug `nano-banana-pro`).
4. Build your call with `kie_post`.

If a model isn't in this index but you've seen it on https://kie.ai/market or https://docs.kie.ai, pass its full URL to `kie_fetch_model_docs({ url })` — the index doesn't gatekeep.

---

## Image

| Model | Docs path |
|---|---|
| Seedream (overview) | `seedream/seedream` |
| Seedream V4 (text-to-image) | `seedream/seedream-v4-text-to-image` |
| Seedream V4 (edit) | `seedream/seedream-v4-edit` |
| Seedream 4.5 (text-to-image) | `seedream/4-5-text-to-image` |
| Seedream 4.5 (edit) | `seedream/4-5-edit` |
| Seedream 5 Lite (text-to-image) | `seedream/5-lite-text-to-image` |
| Seedream 5 Lite (image-to-image) | `seedream-5-lite-image-to-image` |
| Z-Image | `z-image/z-image` |
| Nano Banana 2 (Gemini 3.1 Flash) | `google/nanobanana2` |
| Nano Banana Pro (Gemini 3 Pro) — slug: `nano-banana-pro` | `google/pro-image-to-image` |
| Nano Banana (Gemini base) | `google/nano-banana` |
| Nano Banana Edit | `google/nano-banana-edit` |
| Imagen 4 | `google/imagen4` |
| Imagen 4 Fast | `google/imagen4-fast` |
| Imagen 4 Ultra | `google/imagen4-ultra` |
| Flux 2 Pro (text-to-image) | `flux2/pro-text-to-image` |
| Flux 2 Pro (image-to-image) | `flux2/pro-image-to-image` |
| Flux 2 Flex (text-to-image) | `flux2/flex-text-to-image` |
| Flux 2 Flex (image-to-image) | `flux2/flex-image-to-image` |
| Flux Kontext (Pro/Max) — ⚠️ **custom endpoint** `/api/v1/flux/kontext/generate` | see `flux-kontext-api/quickstart` |
| Grok Imagine (text-to-image) | `grok-imagine/text-to-image` |
| Grok Imagine (image-to-image) | `grok-imagine/image-to-image` |
| GPT Image 1.5 (text-to-image) | `gpt-image/1-5-text-to-image` |
| GPT Image 1.5 (image-to-image) | `gpt-image/1-5-image-to-image` |
| GPT Image 2 (text-to-image) | `gpt/gpt-image-2-text-to-image` |
| GPT Image 2 (image-to-image) | `gpt/gpt-image-2-image-to-image` |
| GPT-4o Image — ⚠️ **custom endpoint** `/api/v1/gpt4o-image/generate` | see `4o-image-api/quickstart` |
| Topaz Image Upscale | `topaz/image-upscale` |
| Recraft Remove Background | `recraft/remove-background` |
| Recraft Crisp Upscale | `recraft/crisp-upscale` |
| Ideogram V3 (text-to-image) | `ideogram/v3-text-to-image` |
| Ideogram V3 (edit) | `ideogram/v3-edit` |
| Ideogram V3 (remix) | `ideogram/v3-remix` |
| Ideogram Character | `ideogram/character` |
| Ideogram Character Edit | `ideogram/character-edit` |
| Ideogram Character Remix | `ideogram/character-remix` |
| Qwen (text-to-image) | `qwen/text-to-image` |
| Qwen (image-to-image) | `qwen/image-to-image` |
| Qwen (image edit) | `qwen/image-edit` |
| Qwen 2 (text-to-image) | `qwen2/text-to-image` |
| Qwen 2 (image edit) | `qwen2/image-edit` |
| Wan 2.7 (image) | `wan/2-7-image` |
| Wan 2.7 (image Pro) | `wan/2-7-image-pro` |
| Midjourney — ⚠️ **custom endpoint** `/api/v1/mj/generate` | (no /market page — see felores docs or generate sample call) |

## Video

| Model | Docs path |
|---|---|
| Kling 3.0 (text/image-to-video, multi-shot) | `kling/kling-3-0` |
| Kling (text-to-video, general) | `kling/text-to-video` |
| Kling (image-to-video, general) | `kling/image-to-video` |
| Kling V2.5 Turbo Pro (text-to-video) | `kling/v25-turbo-text-to-video-pro` |
| Kling V2.5 Turbo Pro (image-to-video) | `kling/v25-turbo-image-to-video-pro` |
| Kling V2.1 Master (text-to-video) | `kling/v2-1-master-text-to-video` |
| Kling V2.1 Master (image-to-video) | `kling/v2-1-master-image-to-video` |
| Kling V2.1 Pro | `kling/v2-1-pro` |
| Kling V2.1 Standard | `kling/v2-1-standard` |
| Kling Motion Control | `kling/motion-control` |
| Kling Motion Control V3 | `kling/motion-control-v3` |
| Kling AI Avatar Standard | `kling/ai-avatar-standard` |
| Kling AI Avatar Pro | `kling/ai-avatar-pro` |
| Seedance 2.0 (quality) | `bytedance/seedance-2` |
| Seedance 2.0 Fast | `bytedance/seedance-2-fast` |
| Seedance 1.5 Pro | `bytedance/seedance-1-5-pro` |
| Seedance V1 Pro Fast (image-to-video) | `bytedance/v1-pro-fast-image-to-video` |
| Seedance V1 Pro (image-to-video) | `bytedance/v1-pro-image-to-video` |
| Seedance V1 Pro (text-to-video) | `bytedance/v1-pro-text-to-video` |
| Seedance V1 Lite (image-to-video) | `bytedance/v1-lite-image-to-video` |
| Seedance V1 Lite (text-to-video) | `bytedance/v1-lite-text-to-video` |
| Hailuo 2.3 Pro (image-to-video) | `hailuo/2-3-image-to-video-pro` |
| Hailuo 2.3 Standard (image-to-video) | `hailuo/2-3-image-to-video-standard` |
| Hailuo 02 Pro (text-to-video) | `hailuo/02-text-to-video-pro` |
| Hailuo 02 Pro (image-to-video) | `hailuo/02-image-to-video-pro` |
| Hailuo 02 Standard (text-to-video) | `hailuo/02-text-to-video-standard` |
| Hailuo 02 Standard (image-to-video) | `hailuo/02-image-to-video-standard` |
| Wan 2.7 (text-to-video) | `wan/2-7-text-to-video` |
| Wan 2.7 (image-to-video) | `wan/2-7-image-to-video` |
| Wan 2.7 (video edit) | `wan/2-7-videoedit` |
| Wan 2.7 (reference-to-video) | `wan/2-7-r2v` |
| Wan 2.6 (text-to-video) | `wan/2-6-text-to-video` |
| Wan 2.6 (image-to-video) | `wan/2-6-image-to-video` |
| Wan 2.6 (video-to-video) | `wan/2-6-video-to-video` |
| Wan 2.6 Flash (image-to-video) | `wan/2-6-flash-image-to-video` |
| Wan 2.6 Flash (video-to-video) | `wan/2-6-flash-video-to-video` |
| Wan 2.5 (text-to-video) | `wan/2-5-text-to-video` |
| Wan 2.5 (image-to-video) | `wan/2-5-image-to-video` |
| Wan 2.2 A14B Turbo (text-to-video) | `wan/2-2-a14b-text-to-video-turbo` |
| Wan 2.2 A14B Turbo (image-to-video) | `wan/2-2-a14b-image-to-video-turbo` |
| Wan 2.2 A14B Turbo (speech-to-video) | `wan/2-2-a14b-speech-to-video-turbo` |
| Wan 2.2 Animate (move) | `wan/2-2-animate-move` |
| Wan 2.2 Animate (replace) | `wan/2-2-animate-replace` |
| Grok Imagine (text-to-video) | `grok-imagine/text-to-video` |
| Grok Imagine (image-to-video) | `grok-imagine/image-to-video` |
| Grok Imagine Upscale | `grok-imagine/upscale` |
| Grok Imagine Extend | `grok-imagine/extend` |
| Sora 2 (text-to-video) | `sora-2-text-to-video` |
| Sora 2 (image-to-video) | `sora-2-image-to-video` |
| Sora 2 Pro (text-to-video) | `sora-2-pro-text-to-video` |
| Sora 2 Pro (image-to-video) | `sora-2-pro-image-to-video` |
| Sora 2 Pro Storyboard | `sora-2-pro-storyboard` |
| Topaz Video Upscale | `topaz/video-upscale` |
| InfiniTalk (lip-sync from audio) | `infinitalk/from-audio` |
| HappyHorse (text-to-video) | `happyhorse/text-to-video` |
| HappyHorse (image-to-video) | `happyhorse/image-to-video` |
| HappyHorse (reference-to-video) | `happyhorse/reference-to-video` |
| HappyHorse (video edit) | `happyhorse/video-edit` |
| Veo 3 / 3.1 (Generate) — ⚠️ **custom endpoint** `/api/v1/veo/generate`, custom poll, JSON-string resultUrls | see `veo3-api/quickstart` |
| Veo 3 1080p retrieval | see `veo3-api/get-veo-3-1080-p-video` |
| Veo 3 4K retrieval | see `veo3-api/get-veo-3-4k-video` |
| Veo 3 Extend | see `veo3-api/extend-video` |
| Runway Gen-4 / Gen-4 Turbo — ⚠️ separate Runway API namespace | see `runway-api/quickstart` |
| Runway Aleph (video-to-video / VFX) — ⚠️ `POST /api/v1/aleph/generate` | see `runway-api/generate-aleph-video` |
| Runway Extend | see `runway-api/extend-ai-video` |
| Gemini Omni Video (multimodal video gen) — ⚠️ pairs with `gemini-omni-character` + `gemini-omni-audio` | `gemini-omni-video` |

## Character / Persona

| Model | Docs path |
|---|---|
| Gemini Omni Character — ⚠️ **synchronous, custom endpoint** `/api/v1/omni/character/create`, returns characterId (no polling) | `gemini-omni-character` |

## Music / Audio

| Model | Docs path |
|---|---|
| Suno (generate music) — ⚠️ **custom endpoint** `/api/v1/generate`, custom poll, non-standard state values | see `suno-api/quickstart` and `suno-api/generate-music` |
| Suno extend music | see `suno-api/extend-music` |
| Suno cover (upload-and-cover) | see `suno-api/upload-and-cover-audio` |
| Suno add instrumental | see `suno-api/add-instrumental` |
| Suno add vocals | see `suno-api/add-vocals` |
| Suno generate persona | see `suno-api/generate-persona` |
| Suno generate lyrics | see `suno-api/generate-lyrics` |
| Suno separate vocals | see `suno-api/separate-vocals` |
| Suno generate sounds | see `suno-api/generate-sounds` |
| Suno create music video | see `suno-api/create-music-video` |
| Suno convert to WAV | see `suno-api/convert-to-wav` |
| Suno generate MIDI | see `suno-api/generate-midi` |
| Suno boost music style | see `suno-api/boost-music-style` |
| Suno mashup | see `suno-api/generate-mashup` |
| Suno voice (generate / validate / regenerate) | see `suno-api/suno-voice-generate` etc. |
| Gemini Omni Audio — ⚠️ **synchronous, custom endpoint** `/api/v1/omni/audio/create`, returns kieAudioId (no polling) | `gemini-omni-audio` |
| ElevenLabs Text-to-Dialogue V3 (multi-speaker) | `elevenlabs/text-to-dialogue-v3` |
| ElevenLabs TTS Multilingual V2 | `elevenlabs/text-to-speech-multilingual-v2` |
| ElevenLabs TTS Turbo 2.5 | `elevenlabs/text-to-speech-turbo-2-5` |
| ElevenLabs Audio Isolation | `elevenlabs/audio-isolation` |

---

## Custom-envelope models — read these before you call

Most models use the **Standard envelope** (`POST /api/v1/jobs/createTask` + `GET /api/v1/jobs/recordInfo?taskId=...` + `data.state` polling). These do NOT:

- **Veo 3 / 3.1** — own submit + poll paths, `successFlag` instead of `state`, `resultUrls` is a JSON-encoded string.
- **Suno** — own submit + poll paths, state values like `PENDING` / `TEXT_SUCCESS` / `FIRST_SUCCESS` / `SUCCESS` / `*_FAILED` / `SENSITIVE_WORD_ERROR`.
- **Flux Kontext** — own submit path (`/api/v1/flux/kontext/generate`), top-level fields (no `input` wrapper), camelCase.
- **Runway** — own namespace (`/api/v1/aleph/generate`, etc.), camelCase fields.
- **Gemini Omni Character + Audio** — **synchronous endpoints**, no polling. Returns the asset ID directly. Their outputs feed into `gemini-omni-video`.
- **Midjourney** — own endpoint `/api/v1/mj/generate`.
- **GPT-4o Image** — own endpoint `/api/v1/gpt4o-image/generate`.

When the model entry above is flagged with ⚠️, always read the docs page before constructing the body.

---

## How to refresh this index

The list above was built from `https://docs.kie.ai/sitemap.xml`. To refresh:

1. Fetch the sitemap (any HTTP client).
2. Extract every URL matching `https://docs.kie.ai/market/*` (skip `/cn/...`).
3. Update the tables above.

Typical cadence: monthly, or when you hear about a new model that isn't here. Brand-new models still work without an index update — just pass the URL directly to `kie_fetch_model_docs({ url: "https://docs.kie.ai/market/<new-model>" })`.
