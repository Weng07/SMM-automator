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

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(true);
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
    setIsActive(true);
    setMsg(null);
  }

  function editProvider(provider: Provider) {
    setEditingId(provider.id);
    setName(provider.name);
    setApiUrl(provider.api_url);
    setApiKey("");
    setIsActive(provider.is_active);
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
        is_active: isActive,
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
        className="panel flex flex-col gap-5"
        style={{ padding: "22px" }}
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

        <div className="provider-form-grid">
          <div>
            <label className="field-label">Provider name</label>
            <input
              className="input"
              placeholder="e.g. SocPanel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label">API URL</label>
            <input
              className="input"
              placeholder="https://example.com/api/v2"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="provider-key-grid">
          <div>
            <label className="field-label">
              API key{" "}
              <span className="text-[#565a6e]">
                {editingId ? "(leave blank to keep current key)" : ""}
              </span>
            </label>
            <input
              className="input"
              type="password"
              placeholder="Paste API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required={!editingId}
            />
          </div>

          <label
            className="panel-alt flex items-center justify-between"
            style={{ padding: "14px" }}
          >
            <span className="text-sm">Active</span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="btn flex items-center gap-2"
            type="submit"
            disabled={loading}
          >
            {editingId ? <Save size={14} /> : <Plus size={14} />}
            {loading
              ? "Saving..."
              : editingId
                ? "Save provider"
                : "Add provider"}
          </button>

          {msg && <span className="text-sm text-[#8b8fa3]">{msg}</span>}
        </div>
      </form>

      <div className="panel flex flex-col gap-4" style={{ padding: "22px" }}>
        <div className="text-sm font-semibold">Saved providers</div>

        <div className="flex flex-col gap-2">
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{provider.name}</span>
                  <span
                    className={`badge ${
                      provider.is_active ? "badge-ok" : "badge-regular"
                    }`}
                  >
                    {provider.is_active ? "active" : "inactive"}
                  </span>
                </div>

                <span className="mono text-xs text-[#8b8fa3] break-all">
                  {provider.api_url}
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