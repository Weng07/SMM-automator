"use client";

import { useEffect, useState } from "react";
import { PlugZap, Plus, Save, Trash2 } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  api_url: string;
  is_active: boolean;
  created_at?: string;
};

function maskSecret(value: string) {
  if (!value) return "";

  const visibleStart = Math.max(6, Math.floor(value.length / 4));
  const visibleEnd = Math.max(4, Math.floor(value.length / 8));

  if (value.length <= visibleStart + visibleEnd) {
    return value;
  }

  return `${value.slice(0, visibleStart)}...${value.slice(-visibleEnd)}`;
}

function maskProviderUrl(url: string) {
  try {
    const parsed = new URL(url);

    for (const key of ["key", "api_key", "apikey", "token"]) {
      const value = parsed.searchParams.get(key);

      if (value) {
        parsed.searchParams.set(key, maskSecret(value));
      }
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadProviders() {
    const res = await fetch("/api/providers");
    const data = await res.json();
    setProviders(data.providers ?? []);
  }

  useEffect(() => {
    loadProviders();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setApiUrl("");
    setApiKey("");
    setMsg(null);
  }

  function editProvider(provider: Provider) {
    setEditingId(provider.id);
    setName(provider.name);
    setApiUrl(provider.api_url);
    setApiKey("");
    setMsg("Editing provider. Leave API key blank to keep the saved key.");
  }

  async function saveProvider(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const payload: Record<string, any> = {
        id: editingId,
        name,
        api_url: apiUrl,
      };

      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save provider.");
      }

      setMsg(editingId ? "Provider updated." : "Provider added.");
      resetForm();
      await loadProviders();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProvider(id: string) {
    const ok = window.confirm("Delete this API provider?");
    if (!ok) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/providers?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete provider.");
      }

      await loadProviders();
      setMsg("Provider deleted.");
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="panel" style={{ padding: "22px" }}>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">API vault</span>
          <h1 className="display text-2xl font-semibold tracking-tight">
            API Providers
          </h1>
          <p className="text-sm text-[#9aa3c7] max-w-2xl">
            Add and manage SMM-panel-style API connections. Services can then be
            pulled and mapped from the Service Map page.
          </p>
        </div>
      </section>

      <form
        onSubmit={saveProvider}
        className="panel"
        style={{ padding: "22px" }}
        autoComplete="off"
      >
        <div
          style={{
            maxWidth: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <PlugZap size={16} className="text-[#22d3ee]" />
              {editingId ? "Edit API provider" : "Add API provider"}
            </div>

            {editingId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={resetForm}
                disabled={loading}
              >
                Cancel edit
              </button>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: "14px",
              alignItems: "end",
              width: "100%",
            }}
          >
            <div>
              <label className="field-label">Provider name</label>
              <input
                className="input"
                name="provider_name_field"
                autoComplete="off"
                placeholder="e.g. SocPanel"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label">
                API key{" "}
                <span className="text-[#565a6e]">
                  {editingId ? "(leave blank to keep current key)" : ""}
                </span>
              </label>
              <input
                className="input"
                name="provider_api_secret_field"
                autoComplete="new-password"
                type="password"
                placeholder="Paste API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required={!editingId}
              />
            </div>
          </div>

          <div>
            <label className="field-label">API URL</label>
            <input
              className="input"
              name="provider_api_url_field"
              autoComplete="off"
              placeholder="https://example.com/api/v2"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              required
            />
          </div>

          <div>
            <button
              className="btn flex items-center justify-center gap-2"
              type="submit"
              disabled={loading}
              style={{ minHeight: "52px", whiteSpace: "nowrap" }}
            >
              {editingId ? <Save size={14} /> : <Plus size={14} />}
              {loading
                ? "Saving..."
                : editingId
                  ? "Save provider"
                  : "Add provider"}
            </button>
          </div>

          {msg && <span className="text-sm text-[#8b8fa3]">{msg}</span>}
        </div>
      </form>

      <div className="panel flex flex-col gap-4" style={{ padding: "22px" }}>
        <div className="text-sm font-semibold">Saved providers</div>

        <div className="flex flex-col gap-2" style={{ marginTop: "12px" }}>
          {providers.length === 0 && (
            <div className="text-sm text-[#8b8fa3]">
              No API providers yet. Add one above to start routing services.
            </div>
          )}

          {providers.map((provider) => (
            <div
              key={provider.id}
              className="panel-alt"
              style={{
                padding: "16px",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "14px",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: 0,
                }}
              >
                <span
                  className={`badge ${
                    provider.is_active ? "badge-ok" : "badge-regular"
                  }`}
                  style={{ flexShrink: 0 }}
                >
                  {provider.is_active ? "active" : "inactive"}
                </span>

                <span
                  className="text-sm font-semibold"
                  style={{ flexShrink: 0 }}
                >
                  {provider.name}
                </span>

                <span
                  className="text-xs text-[#64708f]"
                  style={{ flexShrink: 0 }}
                >
                  -
                </span>

                <span
                  className="mono text-xs text-[#8b8fa3]"
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={maskProviderUrl(provider.api_url)}
                >
                  {maskProviderUrl(provider.api_url)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => editProvider(provider)}
                  disabled={loading}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="btn-secondary flex items-center gap-2"
                  onClick={() => deleteProvider(provider.id)}
                  disabled={loading}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}