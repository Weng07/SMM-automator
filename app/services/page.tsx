"use client";

import { useEffect, useState } from "react";
import { PLATFORM_META, PLATFORMS, PlatformKey } from "@/lib/platform-meta";
import { RefreshCw } from "lucide-react";

type SocService = { service: string; name: string; rate: string; min: string; max: string };
type Preset = {
  id: string;
  platform: string;
  tier: string;
  service_type: string;
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
};

export default function ServicesPage() {
  const [socServices, setSocServices] = useState<SocService[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [platform, setPlatform] = useState<PlatformKey>("x");
  const [loadingServices, setLoadingServices] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPresets() {
    const res = await fetch("/api/service-presets");
    const data = await res.json();
    setPresets(data.presets ?? []);
  }

  async function loadSocServices() {
    setLoadingServices(true);
    setError(null);
    try {
      const res = await fetch("/api/socpanel/services");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSocServices(data.services ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingServices(false);
    }
  }

  useEffect(() => {
    loadPresets();
  }, []);

  function getPreset(tier: string, serviceType: string): Preset | undefined {
    return presets.find(
      (p) => p.platform === platform && p.tier === tier && p.service_type === serviceType
    );
  }

  async function savePreset(tier: string, serviceType: string, updates: Partial<Preset>) {
    const existing = getPreset(tier, serviceType);
    const body = {
      platform,
      tier,
      service_type: serviceType,
      socpanel_service_id: existing?.socpanel_service_id ?? null,
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

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="display text-2xl font-semibold">Services</h1>
        <p className="text-sm text-[#8b8fa3] mt-1">
          Set quantities per platform and tier, and map each to a real SocPanel service ID.
        </p>
      </div>

      <div className="flex items-center gap-2">
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
        <div className="flex-1" />
        <button className="btn-secondary flex items-center gap-2" onClick={loadSocServices} disabled={loadingServices}>
          <RefreshCw size={14} className={loadingServices ? "animate-spin" : ""} />
          {loadingServices ? "Loading…" : "Pull services from SocPanel"}
        </button>
      </div>

      {error && <div className="text-sm text-[#ef4444]">{error}</div>}

      {TIERS.map((tier) => (
        <div key={tier} className="panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className={`badge ${tier === "priority" ? "badge-priority" : "badge-regular"}`}>
              {tier}
            </span>
            <span className="text-sm text-[#8b8fa3]">— {PLATFORM_META[platform].label}</span>
          </div>

          <div className="flex flex-col gap-3">
            {serviceTypes.map((st) => {
              const preset = getPreset(tier, st);
              return (
                <div key={st} className="grid grid-cols-[100px_1fr_120px_50px] gap-3 items-center">
                  <div className="text-sm capitalize">{st}</div>
                  <select
                    className="input"
                    value={preset?.socpanel_service_id ?? ""}
                    onChange={(e) => savePreset(tier, st, { socpanel_service_id: e.target.value || null })}
                  >
                    <option value="">— map to SocPanel service —</option>
                    {socServices.map((s) => (
                      <option key={s.service} value={s.service}>
                        [{s.service}] {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="input"
                    value={preset?.quantity ?? 0}
                    onChange={(e) => savePreset(tier, st, { quantity: Number(e.target.value) })}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-[#8b8fa3]">
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
