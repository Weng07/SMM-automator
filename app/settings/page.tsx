"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const [socpanelApiUrl, setSocpanelApiUrl] = useState("");
  const [socpanelKeySet, setSocpanelKeySet] = useState(false);

  const [socpanelApiKeyInput, setSocpanelApiKeyInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSocpanelApiUrl(data.socpanel_api_url ?? "");
    setSocpanelKeySet(data.socpanel_api_key_set);
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
      }),
    });
    if (res.ok) {
      setMsg("Saved.");
      setSocpanelApiKeyInput("");
      load();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[#8b8fa3] mt-1">
          Keys are stored server-side in Supabase and never sent back to the browser.
        </p>
      </div>

      <form onSubmit={save} className="panel p-6 flex flex-col gap-5">
        <div>
          <label className="text-xs text-[#8b8fa3] block mb-1">SocPanel API URL</label>
          <input className="input" value={socpanelApiUrl} onChange={(e) => setSocpanelApiUrl(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-[#8b8fa3] flex items-center gap-1.5 mb-1">
            SocPanel API key
            {socpanelKeySet && <CheckCircle2 size={12} className="text-[#2ecc71]" />}
          </label>
          <input
            className="input"
            type="password"
            placeholder={socpanelKeySet ? "•••••••• (leave blank to keep)" : "paste your key"}
            value={socpanelApiKeyInput}
            onChange={(e) => setSocpanelApiKeyInput(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" type="submit">
            Save
          </button>
          {msg && <span className="text-sm text-[#8b8fa3]">{msg}</span>}
        </div>
      </form>

      <div className="panel p-6 text-sm text-[#8b8fa3] flex flex-col gap-2">
        <div className="font-medium text-[#f5f6fa]">Also needed on Vercel (env vars, not here):</div>
        <div className="mono text-xs">SUPABASE_URL</div>
        <div className="mono text-xs">SUPABASE_SERVICE_ROLE_KEY</div>
      </div>
    </div>
  );
}
