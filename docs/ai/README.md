# AI learning assistant

A signed-in assistant that understands the simulator and can search the web. It sends the current view, selected device, recent console output, and lab brief to the configured AI provider along with the messages in the chat.

## What it does

- Chat panel in the Network Sysadmin header (`✦ Ask`).
- Sends the current view, selected device, recent console output, and brief with each question.
- The Supabase Edge Function `ai-assist` verifies the JWT, calls an OpenAI-compatible LLM, and can use a `web_search` tool.

## Deploy the function

From the repo root (Supabase CLI linked to the project):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/m14-ai-assist-rate-limits.sql
supabase functions deploy ai-assist --no-verify-jwt
supabase secrets set AI_API_KEY=sk-... AI_API_BASE=https://api.x.ai/v1 AI_MODEL=grok-3 AI_ALLOWED_ORIGINS=https://eriakort.github.io
```

`AI_API_BASE`, `AI_MODEL`, and `AI_SEARCH_ENDPOINT` are optional. Supabase provides `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically; it is used only server-side for the private rate-limit RPC and must never be exposed in the browser or committed. `AI_ALLOWED_ORIGINS` is a comma-separated origin allow-list. The default allows the GitHub Pages origin and common local development origins. Otherwise DuckDuckGo instant answers are used.

## Client

`network-trainer/ai-assist.js` is included by `build-ui.js`. It reads the same `lsa-sb-url` / `lsa-sb-key` localStorage values the rest of the app uses. The user must be signed in.

## Safety

The function requires a valid Supabase session and an allowed browser origin. Requests are limited to 20 per user per minute, 12 recent messages, 2,000 characters per message, 12,000 total message characters, and a 24 KB request body. Provider calls time out after 30 seconds and responses are capped. The UI discloses which simulator context is sent. Do not include passwords, personal data, or secrets in prompts or lab output. The LLM key and service-role key remain server-side. The rate-limit migration must be applied before deploying the updated function; if its RPC or required secrets are unavailable, requests fail closed.

## Disable the assistant

Two independent switches. Either one is enough.

**Runtime (no deploy of the app):**

```bash
supabase secrets set AI_ENABLED=false
```

The function rejects every request with `{ error: "disabled" }`. The Network Trainer panel hides the Ask button after the first disabled response. Set `AI_ENABLED=true` (or unset it) to turn it back on.

**Build time (hide the UI entirely):**

In `network-trainer/ai-assist.js`, set `AI_ASSIST_ENABLED` to `false`, then rebuild:

```bash
npm run build:net
```

The Ask button is never mounted. Redeploy the static site for this to take effect for visitors.
