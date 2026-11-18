// Client for the AI learning assistant.
// Packs current Network Trainer context and calls the Supabase Edge Function.
(function () {
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

  async function ask(messages) {
    let url = "", key = "";
    try {
      url = localStorage.getItem("lsa-sb-url") || "";
      key = localStorage.getItem("lsa-sb-key") || "";
    } catch (_) {}
    if (!url || !key) {
      // Fall back to the Linux app's committed project when running from the same origin
      url = url || "https://yhzefqoplunmseuwcwku.supabase.co";
      key = key || "";
    }
    if (!url || !key) throw new Error("Supabase not configured — open Settings and connect a project");
    const sb = window.supabase && window.supabase.createClient(url, key);
    if (!sb) throw new Error("Supabase client unavailable");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sign in to use the assistant");
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

    const panel = document.createElement("section");
    panel.id = "aiAssistPanel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Learning assistant");
    panel.innerHTML = `
      <header><strong>Learning assistant</strong><button type="button" id="aiAssistClose" aria-label="Close">✕</button></header>
      <div id="aiAssistLog" class="ai-log"></div>
      <form id="aiAssistForm">
        <input id="aiAssistInput" autocomplete="off" placeholder="Ask about this lab, a command, or a concept…" />
        <button type="submit" class="btn primary">Send</button>
      </form>`;
    document.body.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
      #aiAssistPanel{position:fixed;right:18px;bottom:18px;width:380px;max-width:calc(100vw - 24px);height:460px;z-index:10050;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}
      #aiAssistPanel[hidden]{display:none}
      #aiAssistPanel header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #1e293b;font-size:14px}
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

    btn.addEventListener("click", () => { panel.hidden = false; $("#aiAssistInput").focus(); });
    $("#aiAssistClose").addEventListener("click", () => { panel.hidden = true; });
    $("#aiAssistForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#aiAssistInput");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      history.push({ role: "user", content: text });
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
        add("assistant", "Error: " + (err.message || err));
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else setTimeout(mount, 0);
  // Re-mount after boot overwrites #app
  const obs = new MutationObserver(() => { if (!$("#aiAssistBtn") && $(".hud")) mount(); });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
