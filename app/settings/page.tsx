"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PlugZap, Trash2 } from "lucide-react";

type Provider = { id: string; name: string; api_url: string; is_active: boolean };

const DEFAULT_API_URL = "https://socpanel.com/api/v2";

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [name, setName] = useState("SocPanel");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadProviders() {
    const res = await fetch("/api/providers");
    const data = await res.json();
    setProviders(data.providers ?? []);
  }

  useEffect(() => {
    loadProviders();
  }, []);

  async function saveProvider(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, api_url: apiUrl, api_key: apiKey, is_active: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMsg("API provider saved.");
      setName("");
      setApiUrl(DEFAULT_API_URL);
      setApiKey("");
      loadProviders();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProvider(id: string) {
    const res = await fetch(`/api/providers?id=${id}`, { method: "DELETE" });
    if (res.ok) loadProviders();
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="hero-panel p-7">
        <span className="eyebrow">Control room</span>
        <h1 className="display text-3xl font-semibold tracking-tight mt-2">API providers</h1>
        <p className="text-sm text-[#9aa3c7] mt-2 max-w-2xl">
          Add SocPanel plus any other SMM panel that uses the common API format: URL, key, action, service, link, and quantity.
        </p>
      </section>

      <form onSubmit={saveProvider} className="panel p-6 flex flex-col gap-5">
        <div className="text-sm font-semibold flex items-center gap-2">
          <PlugZap size={16} className="text-[#22d3ee]" />
          Add API provider
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Provider name</label>
            <input
              className="input"
              placeholder="SocPanel, JustAnotherPanel, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">API URL</label>
            <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="field-label">API key</label>
          <input
            className="input"
            type="password"
            placeholder="Paste provider API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save provider"}
          </button>
          {msg && <span className={`text-sm ${msg.startsWith("Error") ? "text-[#ef4444]" : "text-[#9aa3c7]"}`}>{msg}</span>}
        </div>
      </form>

      <div className="panel p-6">
        <div className="text-sm font-semibold mb-4">Saved providers</div>
        <div className="flex flex-col gap-3">
          {providers.length === 0 && <div className="empty-state">No providers yet. Add SocPanel first, then bring in the rest of your panel fleet.</div>}
          {providers.map((provider) => (
            <div key={provider.id} className="panel-alt p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {provider.name}
                  {provider.is_active && <CheckCircle2 size={14} className="text-[#2ecc71]" />}
                </div>
                <div className="mono text-xs text-[#7f89b2] mt-1 break-all">{provider.api_url}</div>
              </div>
              <button
                type="button"
                className="btn-ghost flex items-center gap-2 text-[#ef4444]"
                onClick={() => deleteProvider(provider.id)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-6 text-sm text-[#8b8fa3] flex flex-col gap-2">
        <div className="font-medium text-[#f5f6fa]">Still needed on Vercel:</div>
        <div className="mono text-xs">SUPABASE_URL</div>
        <div className="mono text-xs">SUPABASE_SERVICE_ROLE_KEY</div>
      </div>
    </div>
  );
}
