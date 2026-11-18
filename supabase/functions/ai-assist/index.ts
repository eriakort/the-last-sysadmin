// Supabase Edge Function: AI assistant for The Last Sysadmin.
// Verifies the caller's JWT, packs a platform-aware system prompt,
// and calls an OpenAI-compatible LLM with a web_search tool.
//
// Required secrets (supabase secrets set ...):
//   AI_API_KEY          — API key for the LLM provider
//   AI_API_BASE         — optional, default https://api.x.ai/v1
//   AI_MODEL            — optional, default grok-3
//   AI_SEARCH_ENDPOINT  — optional search URL that accepts ?q=

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are the learning assistant for The Last Sysadmin, a browser-based educational simulator for Linux system administration and network operations.

Key facts about the platform:
- It is a simulation. Commands run against an in-browser model, not a real OS or real network devices.
- Linux side: simulated terminal, filesystem, missions/tickets, classroom, progress sync via Supabase.
- Network side: topology builder, device consoles, incidents, evidence, knowledge base, protocol labs.
- Students practice diagnostic workflows. Prefer guiding questions and next steps over giving the full answer immediately when the student is mid-mission.
- When the student asks about real-world commands, RFCs, vendor docs, or current best practices, use the web_search tool.
- Keep answers concise, practical, and tied to the current context (active mission, selected device, recent commands) when provided.
- Never claim the simulator connects to real infrastructure.`;

interface Msg { role: string; content: string; }
interface Body { messages?: Msg[]; context?: Record<string, unknown>; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Owner kill switch. Set AI_ENABLED=false (or 0 / off) to reject all requests
  // without a code change. Unset or any other value keeps the assistant on.
  const enabled = (Deno.env.get("AI_ENABLED") || "true").toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "off") {
    return json({ error: "disabled", reply: "AI assistance is turned off." }, 403);
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length) return json({ error: "no messages" }, 400);

  const apiKey = Deno.env.get("AI_API_KEY");
  if (!apiKey) return json({ error: "AI_API_KEY not configured" }, 500);
  const base = (Deno.env.get("AI_API_BASE") || "https://api.x.ai/v1").replace(/\/$/, "");
  const model = Deno.env.get("AI_MODEL") || "grok-3";

  const contextBlock = body.context
    ? `\n\nCurrent student context:\n${JSON.stringify(body.context).slice(0, 4000)}`
    : "";

  const tools = [{
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web for documentation, RFCs, man pages, or current best practices.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  }];

  const chat = [
    { role: "system", content: SYSTEM + contextBlock },
    ...messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 8000) })),
  ];

  try {
    let reply = await callLLM(base, apiKey, model, chat, tools);
    // One tool round if the model asks to search
    const call = reply.choices?.[0]?.message?.tool_calls?.[0];
    if (call?.function?.name === "web_search") {
      let q = "";
      try { q = JSON.parse(call.function.arguments || "{}").query || ""; } catch { /* ignore */ }
      const results = q ? await webSearch(q) : "No query.";
      chat.push(reply.choices[0].message);
      chat.push({ role: "tool", tool_call_id: call.id, content: results.slice(0, 6000) });
      reply = await callLLM(base, apiKey, model, chat, tools);
    }
    const text = reply.choices?.[0]?.message?.content || "(no reply)";
    return json({ reply: text });
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 502);
  }
});

async function callLLM(base: string, key: string, model: string, messages: unknown[], tools: unknown[]) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.4 }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  return r.json();
}

async function webSearch(query: string): Promise<string> {
  const endpoint = Deno.env.get("AI_SEARCH_ENDPOINT");
  try {
    if (endpoint) {
      const u = new URL(endpoint);
      u.searchParams.set("q", query);
      const r = await fetch(u.toString(), { headers: { "User-Agent": "the-last-sysadmin-ai" } });
      return (await r.text()).slice(0, 5000);
    }
    // DuckDuckGo instant-answer fallback (no key)
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    const j = await r.json();
    const bits = [j.AbstractText, j.Answer, ...(j.RelatedTopics || []).slice(0, 5).map((t: any) => t.Text)].filter(Boolean);
    return bits.join("\n") || "No instant answer; try a more specific query.";
  } catch (e) {
    return `Search failed: ${e}`;
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
