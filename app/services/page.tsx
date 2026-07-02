"use client";

import { useEffect, useMemo, useState } from "react";
import { PLATFORM_META, PLATFORMS, PlatformKey } from "@/lib/platform-meta";
import { RefreshCw, Search, ServerCog } from "lucide-react";

type Provider = { id: string; name: string; api_url: string; is_active: boolean };
type PanelService = {
  service: string;
  name: string;
  type?: string;
  category?: string;
  rate?: string;
  min?: string;
  max?: string;
};

type Preset = {
  id: string;
  platform: string;
  tier: string;
  service_type: string;
  api_provider_id: string | null;
  panel_service_id: string | null;
  socpanel_service_id: string | null;
  quantity: number;
  enabled: boolean;
};

const TIERS = ["priority", "regular"];

const DEFAULT_SERVICE_TYPES: Record<string, string[]> = {
  x: ["views", "likes", "retweets", "comments"],
  instagram: ["views", "likes", "comments", "shares"],
  tiktok: ["views", "likes", "shares", "comments"],
  linkedin: ["likes", "comments", "shares"],
  youtube: ["views", "likes", "comments", "subscribers"],
};

export default function ServicesPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [panelServices, setPanelServices] = useState<PanelService[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [platform, setPlatform] = useState<PlatformKey>("x");
  const [loadingServices, setLoadingServices] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadProviders() {
    const res = await fetch("/api/providers");
    const data = await res.json();
    setProviders(data.providers ?? []);
    if (!providerId && data.providers?.[0]?.id) setProviderId(data.providers[0].id);
  }

  async function loadPresets() {
    const res = await fetch("/api/service-presets");
    const data = await res.json();
    setPresets(data.presets ?? []);
  }

  async function loadPanelServices() {
    if (!providerId) {
      setError("Add an API provider in Settings first.");
      return;
    }

    setLoadingServices(true);
    setError(null);

    try {
      const res = await fetch(`/api/panel/services?providerId=${providerId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPanelServices(data.services ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingServices(false);
    }
  }

  useEffect(() => {
    loadProviders();
    loadPresets();
  }, []);

  function getPreset(tier: string, serviceType: string): Preset | undefined {
    return presets.find(
      (p) => p.platform === platform && p.tier === tier && p.service_type === serviceType
    );
  }

  async function savePreset(tier: string, serviceType: string, updates: Partial<Preset>) {
    const existing = getPreset(tier, serviceType);
    const selectedProviderId = updates.api_provider_id ?? existing?.api_provider_id ?? providerId ?? null;
    const selectedServiceId =
      updates.panel_service_id ??
      updates.socpanel_service_id ??
      existing?.panel_service_id ??
      existing?.socpanel_service_id ??
      null;

    const body = {
      platform,
      tier,
      service_type: serviceType,
      api_provider_id: selectedProviderId,
      panel_service_id: selectedServiceId,
      socpanel_service_id: selectedServiceId,
      quantity: existing?.quantity ?? 0,
      enabled: existing?.enabled ?? true,
      ...updates,
    };

    await fetch("/api/service-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    loadPresets();
  }

  const serviceTypes = DEFAULT_SERVICE_TYPES[platform] ?? [];
  const activeProvider = providers.find((provider) => provider.id === providerId);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return panelServices.slice(0, 250);

    return panelServices
      .filter((service) => {
        const haystack = [
          service.service,
          service.name,
          service.category,
          service.type,
          service.rate,
          service.min,
          service.max,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      })
      .slice(0, 250);
  }, [panelServices, search]);

  return (
    <div className="flex flex-col gap-7">
      <section
        className="panel"
        style={{ padding: "22px" }}
      >
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Service routing</span>
          <h1 className="display text-2xl font-semibold tracking-tight">Provider map</h1>
          <p className="text-sm text-[#9aa3c7] max-w-2xl">
            Connect any SMM-panel-style API, pull its catalog, search by service ID or keyword, then map each tier to the exact service.
          </p>
        </div>
      </section>

      <div className="panel flex flex-col gap-4" style={{ padding: "22px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
            gap: "14px",
            alignItems: "end",
          }}
        >
          <div>
            <label className="field-label">API provider</label>
            <select className="input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">No provider selected</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Search services</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64708f]" />
              <input
                className="input pl-9"
                placeholder="Search ID, name, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn-secondary flex items-center gap-2"
            style={{ minHeight: "48px", whiteSpace: "nowrap" }}
            onClick={loadPanelServices}
            disabled={loadingServices || !providerId}
          >
            <RefreshCw size={14} className={loadingServices ? "animate-spin" : ""} />
            {loadingServices ? "Pulling..." : "Pull services"}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#7f89b2]">
          <ServerCog size={14} />
          {activeProvider ? `${activeProvider.name} selected` : "Add providers in Settings first"}
          {panelServices.length > 0 && ` · ${panelServices.length} services loaded · showing ${filteredServices.length}`}
        </div>
      </div>

      <div className="platform-grid">
        {PLATFORMS.map((p) => {
          const meta = PLATFORM_META[p];
          const Icon = meta.icon;
          return (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`platform-pill ${p === platform ? "active" : ""}`}
            >
              <Icon size={15} style={{ color: meta.color }} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {error && <div className="panel-error">{error}</div>}

      {TIERS.map((tier) => (
        <div key={tier} className="panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className={`badge ${tier === "priority" ? "badge-priority" : "badge-regular"}`}>
              {tier}
            </span>
            <span className="text-sm text-[#8b8fa3]">for {PLATFORM_META[platform].label}</span>
          </div>

          <div className="flex flex-col gap-3">
            {serviceTypes.map((st) => {
              const preset = getPreset(tier, st);
              const currentServiceId = preset?.panel_service_id ?? preset?.socpanel_service_id ?? "";
              const currentMissingFromCatalog =
                currentServiceId && !filteredServices.some((service) => service.service === currentServiceId);

              return (
                <div key={st} className="service-row">
                  <div className="text-sm capitalize font-medium">{st}</div>

                  <select
                    className="input"
                    value={currentServiceId}
                    onChange={(e) =>
                      savePreset(tier, st, {
                        api_provider_id: providerId || preset?.api_provider_id || null,
                        panel_service_id: e.target.value || null,
                        socpanel_service_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Select provider service</option>
                    {currentMissingFromCatalog && (
                      <option value={currentServiceId}>[{currentServiceId}] Currently saved service</option>
                    )}
                    {filteredServices.map((service) => (
                      <option key={service.service} value={service.service}>
                        [{service.service}] {service.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={0}
                    className="input"
                    defaultValue={preset?.quantity ?? 0}
                    onBlur={(e) =>
                      savePreset(tier, st, { quantity: Number(e.target.value) })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={preset?.enabled ?? true}
                      onChange={(e) => savePreset(tier, st, { enabled: e.target.checked })}
                    />
                    on
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
