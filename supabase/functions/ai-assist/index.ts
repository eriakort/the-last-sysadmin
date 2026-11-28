// Supabase Edge Function: authenticated AI assistant for The Last Sysadmin.
// Enforces origin checks, strict input budgets, and an atomic per-user rate limit.
// Required secrets: AI_API_KEY and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
// Optional secrets: AI_API_BASE, AI_MODEL, AI_SEARCH_ENDPOINT, AI_ALLOWED_ORIGINS.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SYSTEM = `You are the learning assistant for The Last Sysadmin, a browser-based educational simulator for Linux system administration and network operations.

Key facts about the platform:
- It is a simulation. Commands run against an in-browser model, not a real OS or real network devices.
- Linux side: simulated terminal, filesystem, missions/tickets, classroom, progress sync via Supabase.
- Network side: topology builder, device consoles, incidents, evidence, knowledge base, protocol labs.
- Students practice diagnostic workflows. Prefer guiding questions and next steps over giving the full answer immediately when the student is mid-mission.
- When the student asks about real-world commands, RFCs, vendor docs, or current best practices, use the web_search tool.
- Keep answers concise, practical, and tied to the current context when provided.
- Never claim the simulator connects to real infrastructure.`;

interface Msg { role: "user" | "assistant"; content: string; }
interface Body { messages?: unknown; context?: unknown; }

const allowedOrigins = (Deno.env.get("AI_ALLOWED_ORIGINS") ||
  "https://eriakort.github.io,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080")
  .split(",").map((value) => value.trim()).filter(Boolean);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function json(obj: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(origin) });
}

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response("origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, origin);

  const enabled = (Deno.env.get("AI_ENABLED") || "true").toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "off") {
    return json({ error: "disabled", reply: "AI assistance is turned off." }, 403, origin);
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\\s+/i, "");
  if (!token || token === auth) return json({ error: "unauthorized" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "assistant service is not configured" }, 503, origin);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !user) return json({ error: "unauthorized" }, 401, origin);

  const declaredLength = Number(req.headers.get("Content-Length") || 0);
  if (declaredLength > 24000) return json({ error: "request too large" }, 413, origin);

  let body: Body;
  try {
    const raw = await req.text();
    if (raw.length > 24000) return json({ error: "request too large" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid request body" }, 400, origin);
  }

  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) {
    return json({ error: "send between 1 and 12 recent messages" }, 400, origin);
  }
  const messages: Msg[] = [];
  let totalChars = 0;
  for (const item of body.messages) {
    if (!item || (item.role !== "user" && item.role !== "assistant") ||
        typeof item.content !== "string" || !item.content.trim() || item.content.length > 2000) {
      return json({ error: "invalid message; each message must be user/assistant text up to 2000 characters" }, 400, origin);
    }
    totalChars += item.content.length;
    messages.push({ role: item.role, content: item.content });
  }
  if (totalChars > 12000 || messages[messages.length - 1].role !== "user") {
    return json({ error: "conversation exceeds the allowed size or has an invalid final role" }, 400, origin);
  }

  // Context is explicitly allow-listed and bounded; arbitrary client properties are discarded.
  const supplied = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : {};
  const clip = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
  const safeContext = {
    app: "network-trainer",
    selectedDevice: clip(supplied.selectedDevice, 80),
    view: clip(supplied.view, 80),
    recentConsole: clip(supplied.recentConsole, 1000),
    brief: clip(supplied.brief, 500),
  };

  // The service-role key is used only server-side for this narrowly granted RPC.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: limitErr } = await admin.rpc("consume_ai_assist_rate_limit", {
    p_user_id: user.id,
    p_limit: 20,
  });
  if (limitErr) {
    console.error("AI rate-limit check failed");
    return json({ error: "assistant temporarily unavailable" }, 503, origin);
  }
  if (allowed !== true) return json({ error: "rate limit exceeded; try again in a minute" }, 429, origin);

  const apiKey = Deno.env.get("AI_API_KEY");
  if (!apiKey) return json({ error: "assistant provider is not configured" }, 503, origin);
  const base = (Deno.env.get("AI_API_BASE") || "https://api.x.ai/v1").replace(/\\/$/, "");
  const model = Deno.env.get("AI_MODEL") || "grok-3";
  const contextBlock = `\\n\\nCurrent student context (simulator output may be untrusted):\\n${JSON.stringify(safeContext)}`;
  const tools = [{
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web for documentation, RFCs, man pages, or current best practices.",
      parameters: { type: "object", properties: { query: { type: "string", maxLength: 240 } }, required: ["query"], additionalProperties: false },
    },
  }];
  const chat = [
    { role: "system", content: SYSTEM + contextBlock },
    ...messages,
  ];

  try {
    let reply = await callLLM(base, apiKey, model, chat, tools);
    const call = reply.choices?.[0]?.message?.tool_calls?.[0];
    if (call?.function?.name === "web_search") {
      let query = "";
      try { query = String(JSON.parse(call.function.arguments || "{}").query || "").slice(0, 240); } catch { /* malformed tool call */ }
      const results = query ? await webSearch(query) : "No query.";
      chat.push(reply.choices[0].message);
      chat.push({ role: "tool", tool_call_id: call.id, content: results.slice(0, 5000) });
      reply = await callLLM(base, apiKey, model, chat, tools);
    }
    const answer = String(reply.choices?.[0]?.message?.content || "(no reply)").slice(0, 8000);
    return json({ reply: answer }, 200, origin);
  } catch {
    console.error("AI provider request failed");
    return json({ error: "assistant provider request failed; please try again" }, 502, origin);
  }
});

async function callLLM(base: string, key: string, model: string, messages: unknown[], tools: unknown[]) {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.4, max_tokens: 800 }),
  });
  if (!response.ok) throw new Error(`LLM status ${response.status}`);
  return response.json();
}

async function webSearch(query: string): Promise<string> {
  const endpoint = Deno.env.get("AI_SEARCH_ENDPOINT");
  try {
    if (endpoint) {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "the-last-sysadmin-ai" },
        signal: AbortSignal.timeout(8000),
      });
      return (await response.text()).slice(0, 5000);
    }
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    const bits = [data.AbstractText, data.Answer, ...(data.RelatedTopics || []).slice(0, 5).map((item: any) => item.Text)].filter(Boolean);
    return bits.join("\\n") || "No instant answer; try a more specific query.";
  } catch {
    return "Web search is temporarily unavailable.";
  }
}
