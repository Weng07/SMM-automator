"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PLATFORM_META, PLATFORMS, PlatformKey } from "@/lib/platform-meta";
import { X_COMMENT_CATEGORIES } from "@/lib/comment-categories";
import { RefreshCw, Search, ServerCog } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  api_url: string;
  is_active: boolean;
};

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
  comment_categories?: string[] | null;
  enabled: boolean;
};

type DraftPreset = {
  api_provider_id: string | null;
  panel_service_id: string | null;
  socpanel_service_id: string | null;
  quantity: number;
  comment_categories: string[];
  enabled: boolean;
};

const TIERS = ["priority", "regular"];

const DEFAULT_SERVICE_TYPES: Record<string, Record<string, string[]>> = {
  regular: {
    x: ["views", "likes", "retweets"],
    instagram: ["views", "likes", "shares"],
    tiktok: ["views", "likes", "shares"],
    linkedin: ["likes", "comments", "shares"],
    youtube: ["views", "likes", "subscribers"],
  },
  priority: {
    x: ["views", "likes", "retweets", "comments_slot_1", "comments_slot_2"],
    instagram: ["views", "likes", "comments", "shares"],
    tiktok: ["views", "likes", "shares", "comments"],
    linkedin: ["likes", "comments", "shares"],
    youtube: ["views", "likes", "comments", "subscribers"],
  },
};

function isCommentSlot(serviceType: string) {
  return serviceType.startsWith("comments_slot_");
}

function serviceTypeLabel(serviceType: string) {
  if (!isCommentSlot(serviceType)) {
    return serviceType;
  }

  const slot = serviceType.replace("comments_slot_", "");
  return `comments slot ${slot}`;
}

function toggleCategorySelection(current: string[], category: string) {
  if (current.includes(category)) {
    return current.filter((item) => item !== category);
  }

  if (current.length >= 3) {
    return current;
  }

  return [...current, category];
}

function makeRowKey(tier: string, serviceType: string) {
  return `${tier}:${serviceType}`;
}

export default function ServicesPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [panelServices, setPanelServices] = useState<PanelService[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [platform, setPlatform] = useState<PlatformKey>("x");
  const [loadingServices, setLoadingServices] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<Record<string, DraftPreset>>({});

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/providers");
    const data = await res.json();

    setProviders(data.providers ?? []);

    if (!providerId && data.providers?.[0]?.id) {
      setProviderId(data.providers[0].id);
    }
  }, [providerId]);

  const loadPresets = useCallback(async () => {
    const res = await fetch("/api/service-presets");
    const data = await res.json();
    setPresets(data.presets ?? []);
  }, []);

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

      if (!res.ok) {
        throw new Error(data.error);
      }

      setPanelServices(data.services ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setLoadingServices(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProviders();
    void loadPresets();
  }, [loadPresets, loadProviders]);

  function getPreset(tier: string, serviceType: string): Preset | undefined {
    return presets.find(
      (preset) =>
        preset.platform === platform &&
        preset.tier === tier &&
        preset.service_type === serviceType
    );
  }

  function createDraftFromPreset(preset?: Preset): DraftPreset {
    const savedServiceId =
      preset?.panel_service_id ?? preset?.socpanel_service_id ?? null;

    return {
      api_provider_id: preset?.api_provider_id ?? providerId ?? null,
      panel_service_id: savedServiceId,
      socpanel_service_id: savedServiceId,
      quantity: preset?.quantity ?? 0,
      comment_categories: Array.isArray(preset?.comment_categories)
        ? preset.comment_categories
        : [],
      enabled: preset?.enabled ?? true,
    };
  }

  function startEdit(tier: string, serviceType: string) {
    const key = makeRowKey(tier, serviceType);
    const preset = getPreset(tier, serviceType);

    setEditingRows((current) => ({
      ...current,
      [key]: createDraftFromPreset(preset),
    }));
  }

  function cancelEdit(tier: string, serviceType: string) {
    const key = makeRowKey(tier, serviceType);

    setEditingRows((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateDraft(
    tier: string,
    serviceType: string,
    updates: Partial<DraftPreset>
  ) {
    const key = makeRowKey(tier, serviceType);
    const preset = getPreset(tier, serviceType);
    const currentDraft = editingRows[key] ?? createDraftFromPreset(preset);

    setEditingRows((current) => ({
      ...current,
      [key]: {
        ...currentDraft,
        ...updates,
      },
    }));
  }

  async function saveDraft(tier: string, serviceType: string) {
    const key = makeRowKey(tier, serviceType);
    const draft = editingRows[key];

    if (!draft) {
      return;
    }

    const selectedServiceId =
      draft.panel_service_id ?? draft.socpanel_service_id ?? null;

    const body = {
      platform,
      tier,
      service_type: serviceType,
      api_provider_id: draft.api_provider_id ?? providerId ?? null,
      panel_service_id: selectedServiceId,
      socpanel_service_id: selectedServiceId,
      quantity: draft.quantity,
      comment_categories: draft.comment_categories,
      enabled: draft.enabled,
    };

    const res = await fetch("/api/service-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Failed to save service preset.");
      return;
    }

    cancelEdit(tier, serviceType);
    await loadPresets();
  }

  const activeProvider = providers.find((provider) => provider.id === providerId);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      return panelServices.slice(0, 250);
    }

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
      <section className="panel" style={{ padding: "22px" }}>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Service routing</span>
          <h1 className="display text-2xl font-semibold tracking-tight">
            Provider map
          </h1>
          <p className="text-sm text-[#9aa3c7] max-w-2xl">
            Connect any SMM-panel-style API, pull its catalog, search by service
            ID or keyword, then map each tier to the exact service.
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
            <select
              className="input"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
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
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64708f]"
              />
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
            <RefreshCw
              size={14}
              className={loadingServices ? "animate-spin" : ""}
            />
            {loadingServices ? "Pulling..." : "Pull services"}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#7f89b2]">
          <ServerCog size={14} />
          {activeProvider
            ? `${activeProvider.name} selected`
            : "Add providers in Settings first"}
          {panelServices.length > 0 &&
            ` · ${panelServices.length} services loaded · showing ${filteredServices.length}`}
        </div>
      </div>

      <div className="platform-grid">
        {PLATFORMS.map((p) => {
          const meta = PLATFORM_META[p];
          const Icon = meta.icon;

          return (
            <button
              key={p}
              onClick={() => {
                setPlatform(p);
                setEditingRows({});
                setSearch("");
              }}
              className={`platform-pill ${p === platform ? "active" : ""}`}
            >
              <Icon size={15} style={{ color: meta.color }} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {error && <div className="panel-error">{error}</div>}

      {TIERS.map((tier) => {
        const serviceTypes = DEFAULT_SERVICE_TYPES[tier]?.[platform] ?? [];

        return (
          <div key={tier} className="panel" style={{ padding: "22px" }}>
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`badge ${
                  tier === "priority" ? "badge-priority" : "badge-regular"
                }`}
              >
                {tier}
              </span>
              <span className="text-sm text-[#8b8fa3]">
                for {PLATFORM_META[platform].label}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {serviceTypes.map((serviceType) => {
                const rowKey = makeRowKey(tier, serviceType);
                const preset = getPreset(tier, serviceType);
                const isEditing = Boolean(editingRows[rowKey]);
                const draft =
                  editingRows[rowKey] ?? createDraftFromPreset(preset);

                const savedServiceId =
                  preset?.panel_service_id ?? preset?.socpanel_service_id ?? "";

                const draftServiceId =
                  draft.panel_service_id ?? draft.socpanel_service_id ?? "";

                const currentServiceId = isEditing
                  ? draftServiceId
                  : savedServiceId;

                const currentMissingFromCatalog =
                  currentServiceId &&
                  !filteredServices.some(
                    (service) => service.service === currentServiceId
                  );

                return (
                  <div
                    key={serviceType}
                    className="service-row"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isEditing) {
                        e.preventDefault();
                        saveDraft(tier, serviceType);
                      }
                    }}
                  >
                    <div className="text-sm capitalize font-medium">
                      {serviceTypeLabel(serviceType)}
                    </div>

                    <select
                      className="input"
                      value={currentServiceId}
                      disabled={!isEditing}
                      onChange={(e) => {
                        const value = e.target.value || null;

                        updateDraft(tier, serviceType, {
                          api_provider_id: providerId || preset?.api_provider_id || null,
                          panel_service_id: value,
                          socpanel_service_id: value,
                        });
                      }}
                    >
                      <option value="">Select provider service</option>

                      {currentMissingFromCatalog && (
                        <option value={currentServiceId}>
                          [{currentServiceId}] Currently saved service
                        </option>
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
                      value={isEditing ? draft.quantity : preset?.quantity ?? 0}
                      disabled={!isEditing}
                      onChange={(e) =>
                        updateDraft(tier, serviceType, {
                          quantity: Number(e.target.value),
                        })
                      }
                    />

                    {isCommentSlot(serviceType) && tier === "priority" && platform === "x" && (
                      <div
                        className="flex flex-wrap gap-2"
                        aria-label="Comment categories"
                      >
                        {X_COMMENT_CATEGORIES.map((category) => {
                          const selectedCategories = isEditing
                            ? draft.comment_categories
                            : preset?.comment_categories ?? [];
                          const active = selectedCategories.includes(category);

                          return (
                            <button
                              key={category}
                              type="button"
                              className={`platform-pill ${active ? "active" : ""}`}
                              disabled={!isEditing}
                              onClick={() => {
                                const next = toggleCategorySelection(
                                  draft.comment_categories,
                                  category
                                );

                                updateDraft(tier, serviceType, {
                                  comment_categories: next,
                                });
                              }}
                            >
                              {category}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={isEditing ? draft.enabled : preset?.enabled ?? true}
                        disabled={!isEditing}
                        onChange={(e) =>
                          updateDraft(tier, serviceType, {
                            enabled: e.target.checked,
                          })
                        }
                      />
                      on
                    </label>

                    <div className="flex items-center gap-2">
                      {!isEditing ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => startEdit(tier, serviceType)}
                        >
                          Edit
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => saveDraft(tier, serviceType)}
                          >
                            Save
                          </button>

                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => cancelEdit(tier, serviceType)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}