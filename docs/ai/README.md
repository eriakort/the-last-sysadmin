# AI learning assistant

A signed-in assistant that understands the simulator and can search the web.

## What it does

- Chat panel in the Network Sysadmin header (`✦ Ask`).
- Sends the current view, selected device, recent console output, and brief with each question.
- The Supabase Edge Function `ai-assist` verifies the JWT, calls an OpenAI-compatible LLM, and can use a `web_search` tool.

## Deploy the function

From the repo root (Supabase CLI linked to the project):

```bash
supabase functions deploy ai-assist --no-verify-jwt
# or with JWT verification left to the function itself
supabase secrets set AI_API_KEY=sk-... AI_API_BASE=https://api.x.ai/v1 AI_MODEL=grok-3
```

`AI_API_BASE` and `AI_MODEL` are optional. Set `AI_SEARCH_ENDPOINT` if you want a custom search URL; otherwise DuckDuckGo instant answers are used.

## Client

`network-trainer/ai-assist.js` is included by `build-ui.js`. It reads the same `lsa-sb-url` / `lsa-sb-key` localStorage values the rest of the app uses. The user must be signed in.

## Safety

The system prompt states this is an educational simulator. The function requires a valid Supabase session. Do not put the LLM key in the browser.
