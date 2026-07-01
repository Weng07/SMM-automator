"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [socpanelApiUrl, setSocpanelApiUrl] = useState("");
  const [socpanelKeySet, setSocpanelKeySet] = useState(false);
  const [xTokenSet, setXTokenSet] = useState(false);

  const [socpanelApiKeyInput, setSocpanelApiKeyInput] = useState("");
  const [xBearerInput, setXBearerInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSocpanelApiUrl(data.socpanel_api_url ?? "");
    setSocpanelKeySet(data.socpanel_api_key_set);
    setXTokenSet(data.x_bearer_token_set);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        socpanel_api_url: socpanelApiUrl,
        socpanel_api_key: socpanelApiKeyInput || undefined,
        x_bearer_token: xBearerInput || undefined,
      }),
    });
    if (res.ok) {
      setMsg("Saved.");
      setSocpanelApiKeyInput("");
      setXBearerInput("");
      load();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-[#8b929c] mt-1">
          Keys are stored server-side in Supabase and never sent back to the browser.
        </p>
      </div>

      <form onSubmit={save} className="panel p-5 flex flex-col gap-5">
        <div>
          <label className="text-xs text-[#8b929c] block mb-1">SocPanel API URL</label>
          <input
            className="input"
            value={socpanelApiUrl}
            onChange={(e) => setSocpanelApiUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[#8b929c] block mb-1">
            SocPanel API key {socpanelKeySet && <span className="text-[#3ecf8e]">(set)</span>}
          </label>
          <input
            className="input"
            type="password"
            placeholder={socpanelKeySet ? "•••••••• (leave blank to keep)" : "paste your key"}
            value={socpanelApiKeyInput}
            onChange={(e) => setSocpanelApiKeyInput(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[#8b929c] block mb-1">
            X API bearer token {xTokenSet && <span className="text-[#3ecf8e]">(set)</span>}
          </label>
          <input
            className="input"
            type="password"
            placeholder={xTokenSet ? "•••••••• (leave blank to keep)" : "paste your bearer token"}
            value={xBearerInput}
            onChange={(e) => setXBearerInput(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" type="submit">
            Save
          </button>
          {msg && <span className="text-sm text-[#8b929c]">{msg}</span>}
        </div>
      </form>

      <div className="panel p-5 text-sm text-[#8b929c] flex flex-col gap-2">
        <div className="font-medium text-[#f2f3f5]">Also needed on Vercel (env vars, not here):</div>
        <div className="mono text-xs">SUPABASE_URL</div>
        <div className="mono text-xs">SUPABASE_SERVICE_ROLE_KEY</div>
        <div className="mono text-xs">CRON_SECRET — protects the polling endpoint</div>
      </div>
    </div>
  );
}
