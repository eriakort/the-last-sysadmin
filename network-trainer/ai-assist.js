// Client for the AI learning assistant.
// Packs current Network Trainer context and calls the Supabase Edge Function.
(function () {
  // Build-time switch. Set to false and rebuild to hide the assistant entirely.
  const AI_ASSIST_ENABLED = true;
  if (!AI_ASSIST_ENABLED) return;
  const $ = (s) => document.querySelector(s);

  function context() {
    const ctx = { app: "network-trainer" };
    try {
      const sel = document.querySelector("#topo .node.sel, #topo .node.multi-selected");
      if (sel) ctx.selectedDevice = sel.getAttribute("data-dev");
      else if (window.SEL) ctx.selectedDevice = window.SEL;
      const tout = $("#tout");
      if (tout && tout.textContent) ctx.recentConsole = tout.textContent.slice(-1500);
      const view = document.querySelector("#navRail .nav-item[aria-current]");
      if (view) ctx.view = view.textContent.trim();
      const brief = $("#brief");
      if (brief && brief.textContent) ctx.brief = brief.textContent.slice(0, 800);
    } catch (_) {}
    return ctx;
  }

  const DEFAULT_SB_URL = "https://yhzefqoplunmseuwcwku.supabase.co";
  const DEFAULT_SB_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemVmcW9wbHVubXNldXdjd2t1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNDM0NTQsImV4cCI6MjEwODgxOTQ1NH0.5CWs0AtbFtrAYOYiPjgKfvWivAMPeXGXSzOblZMCS3c";

  async function ask(messages) {
    let url = "", key = "";
    try {
      url = localStorage.getItem("lsa-sb-url") || "";
      key = localStorage.getItem("lsa-sb-key") || "";
    } catch (_) {}
    if (!url || !key) {
      // Fall back to the Linux app's committed project when running from the same origin
      url = url || DEFAULT_SB_URL;
      key = key || DEFAULT_SB_ANON_KEY;
    }
    if (!url || !key) throw new Error("Supabase not configured — open Class settings and connect a project.");
    const sb = window.supabase && window.supabase.createClient(url, key);
    if (!sb) throw new Error("Cloud assistant requires the Supabase client script (check your connection).");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sign in via 🎓 Class (or ⚙ Settings in Linux Sysadmin) to use the AI assistant.");
    const r = await fetch(`${url}/functions/v1/ai-assist`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, context: context() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j.reply || "(empty)";
  }

  function mount() {
    if ($("#aiAssistBtn")) return;
    const hud = $(".hud");
    if (!hud) return;
    const btn = document.createElement("button");
    btn.id = "aiAssistBtn";
    btn.className = "btn";
    btn.type = "button";
    btn.title = "Ask the learning assistant";
    btn.textContent = "✦ Ask";
    hud.insertBefore(btn, hud.firstChild);
    btn.addEventListener("click", openPanel);
  }
  function openPanel() {
    let panel = $("#aiAssistPanel");
    if (panel) { panel.hidden = false; panel.removeAttribute("inert"); $("#aiAssistInput").focus(); return; }
    panel = document.createElement("section");
    panel.id = "aiAssistPanel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Learning assistant");
    panel.innerHTML = `
      <header><strong>Learning assistant</strong><button type="button" id="aiAssistClose" aria-label="Close">✕</button></header>
      <p class="ai-privacy">Your message and recent simulator context (selected device, view, console output, and lab brief) are sent to the configured AI provider to answer. Do not include passwords, personal data, or secrets.</p>
      <div id="aiAssistLog" class="ai-log"></div>
      <form id="aiAssistForm">
        <input id="aiAssistInput" autocomplete="off" maxlength="2000" placeholder="Ask about this lab, a command, or a concept…" />
        <button type="submit" class="btn primary">Send</button>
      </form>`;
    document.body.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
      #aiAssistPanel{position:fixed;right:18px;bottom:18px;width:380px;max-width:calc(100vw - 24px);height:460px;z-index:10050;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}
      #aiAssistPanel[hidden]{display:none}
      #aiAssistPanel header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #1e293b;font-size:14px}
      #aiAssistPanel .ai-privacy{margin:0;padding:8px 12px;background:#172033;color:#cbd5e1;font-size:11px;line-height:1.4}
      #aiAssistLog{flex:1;overflow:auto;padding:10px 12px;font-size:13.5px;line-height:1.45}
      #aiAssistLog .ai-msg{margin:8px 0;white-space:pre-wrap}
      #aiAssistLog .ai-msg.user{color:#7dd3fc}
      #aiAssistForm{display:flex;gap:6px;padding:8px;border-top:1px solid #1e293b}
      #aiAssistInput{flex:1;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:8px}
    `;
    document.head.appendChild(style);

    const log = $("#aiAssistLog");
    const history = [];
    function add(role, text) {
      const d = document.createElement("div");
      d.className = "ai-msg " + role;
      d.textContent = (role === "user" ? "You: " : "Assistant: ") + text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }
    $("#aiAssistClose").addEventListener("click", () => { panel.hidden = true; panel.setAttribute("inert", ""); });
    $("#aiAssistForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#aiAssistInput");
      const text = input.value.trim();
      if (!text || text.length > 2000) return;
      const submit = $("#aiAssistForm button[type=submit]");
      if (submit && submit.disabled) return;
      if (submit) submit.disabled = true;
      input.value = "";
      history.push({ role: "user", content: text });
      if (history.length > 12) history.splice(0, history.length - 12);
      add("user", text);
      const pending = document.createElement("div");
      pending.className = "ai-msg";
      pending.textContent = "Thinking…";
      log.appendChild(pending);
      try {
        const reply = await ask(history);
        pending.remove();
        history.push({ role: "assistant", content: reply });
        add("assistant", reply);
      } catch (err) {
        pending.remove();
        const msg = String(err.message || err);
        add("assistant", /^Sign in/i.test(msg) ? msg : "Error: " + msg);
        if (/disabled/i.test(msg)) {
          const btn = $("#aiAssistBtn");
          if (btn) btn.hidden = true;
          panel.hidden = true;
        }
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  function tryMount() { if ($(".hud")) mount(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(tryMount, 50));
  else setTimeout(tryMount, 50);
  window.addEventListener("pageshow", tryMount);
})();
