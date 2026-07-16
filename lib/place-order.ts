import { supabaseAdmin } from "./supabase";
import { placePanelOrder } from "./smm-panel";

type Platform = "x" | "instagram" | "tiktok" | "linkedin" | "youtube";

type ServiceResult = {
  service_type: string;
  slot_index?: number;
  keywords?: string[];
  api_provider_id?: string | null;
  provider_name?: string | null;
  panel_service_id: string | null;
  socpanel_service_id?: string | null;
  quantity: number;
  panel_order_id?: string | number;
  socpanel_order_id?: string | number;
  skipped?: boolean;
  error?: string;
  status?: string;
  debug_detected_categories?: string[];
  debug_effective_categories?: string[];
  debug_slot_decision?: string;
};

function isInstagramReel(link: string) {
  try {
    const url = new URL(link);
    return url.hostname.includes("instagram.com") && url.pathname.includes("/reel/");
  } catch {
    return link.includes("instagram.com/reel/");
  }
}

async function popComments(poolId: string, count: number): Promise<string[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("comment_pool_items")
    .select("id, comment")
    .eq("pool_id", poolId)
    .eq("used", false)
    .limit(count);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ids = data.map((d) => d.id);
  await supabase.from("comment_pool_items").update({ used: true }).in("id", ids);

  return data.map((d) => d.comment);
}

async function findOldestAvailablePool(platform: Platform) {
  const supabase = supabaseAdmin();

  const { data: pools, error } = await supabase
    .from("comment_pools")
    .select("id, name, category, created_at")
    .eq("platform", platform)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!pools || pools.length === 0) return null;

  for (const pool of pools) {
    const { count, error: countError } = await supabase
      .from("comment_pool_items")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool.id)
      .eq("used", false);

    if (countError) throw countError;

    if ((count ?? 0) > 0) {
      return pool;
    }
  }

  return null;
}

function isCommentServiceType(serviceType: string) {
  return serviceType === "comments";
}

function normalizeServiceCategory(serviceType: string): string {
  const normalized = serviceType.trim().toLowerCase();

  if (normalized === "comments") {
    return "comments";
  }

  // Treat reaction variants as one duplicate category.
  if (normalized.includes("reaction")) {
    return "reactions";
  }

  return normalized;
}

function shouldSubmitComments(params: { platform: Platform; tier: string }) {
  return Boolean(params.platform);
}

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean))];
}

function extractDetectedKeywordsFromLink(link: string): string[] {
  const normalized = decodeURIComponent(link).toLowerCase();
  const matches = normalized.match(/[a-z0-9_\-]+/g) ?? [];
  return [...new Set(matches.filter(Boolean))];
}

function matchesAnyKeyword(link: string, keywords: string[]) {
  if (keywords.length === 0) {
    return false;
  }

  const normalizedLink = decodeURIComponent(link).toLowerCase();
  return keywords.some((keyword) => normalizedLink.includes(keyword));
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickShuffledSlot<T extends { slot_index?: number }>(params: {
  candidates: T[];
  seed: string;
}) {
  if (params.candidates.length <= 1) {
    return params.candidates[0] ?? null;
  }

  // Keep ordering stable so hash modulo maps consistently over time.
  const ordered = [...params.candidates].sort(
    (a, b) => (a.slot_index ?? 1) - (b.slot_index ?? 1)
  );
  // Deterministic distribution: same seed => same slot, different seeds spread across slots.
  const pick = hashString(params.seed) % ordered.length;
  return ordered[pick] ?? null;
}

async function findOldestAvailablePoolForCategories(params: {
  platform: Platform;
  categories: string[];
}) {
  if (params.categories.length === 0) {
    return findOldestAvailablePool(params.platform);
  }

  const supabase = supabaseAdmin();
  const { data: pools, error } = await supabase
    .from("comment_pools")
    .select("id, name, category, created_at")
    .eq("platform", params.platform)
    .in("category", params.categories)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!pools || pools.length === 0) return null;

  for (const pool of pools) {
    const { count, error: countError } = await supabase
      .from("comment_pool_items")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool.id)
      .eq("used", false);

    if (countError) throw countError;

    if ((count ?? 0) > 0) {
      return pool;
    }
  }

  return null;
}

async function wasServiceAlreadySubmitted(params: {
  platform: Platform;
  link: string;
  serviceType: string;
}) {
  const supabase = supabaseAdmin();
  const targetCategory = normalizeServiceCategory(params.serviceType);

  const { data, error } = await supabase
    .from("orders")
    .select("id, services_ordered")
    .eq("platform", params.platform)
    .eq("link", params.link)
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!data || data.length === 0) {
    return false;
  }

  for (const order of data) {
    const services = Array.isArray(order.services_ordered)
      ? order.services_ordered
      : [];

    const matchingService = services.find((service: Record<string, unknown>) => {
      const hasSuccessfulId = service.panel_order_id || service.socpanel_order_id;
      const errorMessage = typeof service.error === "string" ? service.error : "";
      const isCanceled = Boolean(
        errorMessage &&
          /canceled|cancelled|cancel|failed|error|declined|rejected|denied/i.test(errorMessage)
      );

      return (
        normalizeServiceCategory(String(service.service_type ?? "")) === targetCategory &&
        !service.skipped &&
        hasSuccessfulId &&
        !isCanceled
      );
    });

    if (matchingService) {
      return true;
    }
  }

  return false;
}

export async function retryOrderForId(orderId: string) {
  const supabase = supabaseAdmin();

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("id, platform, tier, link, comment_pool_id, source")
    .eq("id", orderId)
    .single();

  if (orderErr || !orderRow) {
    throw new Error("Order not found.");
  }

  return submitOrderForLink({
    platform: orderRow.platform as Platform,
    tier: orderRow.tier,
    link: orderRow.link,
    source: orderRow.source ?? "retry",
    commentPoolId: orderRow.comment_pool_id ?? null,
  });
}

export async function submitOrderForLink(params: {
  platform: Platform;
  tier?: string;
  link: string;
  source?: string;
  commentPoolId?: string | null;
}) {
  const supabase = supabaseAdmin();

  if (params.commentPoolId) {
    const { data: pool, error: poolCheckErr } = await supabase
      .from("comment_pools")
      .select("id, platform")
      .eq("id", params.commentPoolId)
      .single();

    if (poolCheckErr || !pool) {
      throw new Error("Selected comment pool could not be found.");
    }

    if (pool.platform !== params.platform) {
      throw new Error(
        `Comment pool is for "${pool.platform}" but this order is for "${params.platform}". Pick a matching pool.`
      );
    }
  }

  const { data: presets, error: presetErr } = await supabase
    .from("service_presets")
    .select("*, api_providers(name)")
    .eq("platform", params.platform)
    .eq("enabled", true);

  if (presetErr) throw presetErr;

  if (!presets || presets.length === 0) {
    throw new Error(
      `No enabled service presets found for ${params.platform}. Configure them in Services first.`
    );
  }

  const instagramShouldOrderViews =
    params.platform !== "instagram" || isInstagramReel(params.link);

  const filteredPresets = presets.filter((preset) => {
    if (
      params.platform === "instagram" &&
      preset.service_type === "views" &&
      !instagramShouldOrderViews
    ) {
      return false;
    }

    return true;
  });

  if (filteredPresets.length === 0) {
    throw new Error(
      `No eligible service presets found for this ${params.platform} link.`
    );
  }

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      platform: params.platform,
      tier: params.tier ?? "regular",
      link: params.link,
      source: params.source ?? "manual",
      status: "pending",
      comment_pool_id: params.commentPoolId ?? null,
      services_ordered: [],
    })
    .select()
    .single();

  if (orderErr) throw orderErr;

  const results: ServiceResult[] = [];
  const detectedKeywords = extractDetectedKeywordsFromLink(params.link);

  if (params.platform === "instagram" && !instagramShouldOrderViews) {
    results.push({
      service_type: "views",
      panel_service_id: null,
      socpanel_service_id: null,
      quantity: 0,
      skipped: true,
      error: "Instagram views skipped because this link is not a Reel.",
    });
  }

  const groupedPresets = new Map<string, Array<Record<string, unknown>>>();

  for (const preset of filteredPresets) {
    const serviceType = String(preset.service_type);
    const existing = groupedPresets.get(serviceType) ?? [];
    existing.push(preset as Record<string, unknown>);
    groupedPresets.set(serviceType, existing);
  }

  for (const [serviceType, servicePresets] of groupedPresets.entries()) {
    // Slots with explicit keywords participate only in keyword matching.
    const withKeywords = servicePresets.filter((preset) =>
      normalizeKeywords((preset as { keywords?: unknown; comment_categories?: unknown }).keywords ?? (preset as { comment_categories?: unknown }).comment_categories).length > 0
    );

    // Match slots whose configured keywords appear in the submitted link.
    const keywordMatched = withKeywords.filter((preset) =>
      matchesAnyKeyword(
        params.link,
        normalizeKeywords((preset as { keywords?: unknown; comment_categories?: unknown }).keywords ?? (preset as { comment_categories?: unknown }).comment_categories)
      )
    );

    // Slots without keywords are default fallback slots for unmatched links.
    const fallbackSlots = servicePresets.filter((preset) =>
      normalizeKeywords((preset as { keywords?: unknown; comment_categories?: unknown }).keywords ?? (preset as { comment_categories?: unknown }).comment_categories).length === 0
    );

    // If multiple keyword slots match, distribute links deterministically via hash.
    // If no keyword slot matches, use the first fallback slot (lowest slot_index).
    const selectedPreset = keywordMatched.length > 0
      ? pickShuffledSlot({
          candidates: keywordMatched as Array<{ slot_index?: number }>,
          seed: `${params.platform}:${serviceType}:${params.link}`,
        }) as Record<string, unknown> | null
      : ([...fallbackSlots]
          .sort(
            (a, b) =>
              (Number((a as { slot_index?: unknown }).slot_index) || 1) -
              (Number((b as { slot_index?: unknown }).slot_index) || 1)
          )[0] as Record<string, unknown> | undefined) ?? null;

    if (!selectedPreset) {
      continue;
    }

    const preset = selectedPreset as {
      service_type: string;
      slot_index?: number;
      keywords?: unknown;
      comment_categories?: unknown;
      api_provider_id?: string | null;
      api_providers?: { name?: string | null };
      panel_service_id?: string | null;
      socpanel_service_id?: string | null;
      quantity: number;
    };

    const serviceId = preset.panel_service_id || preset.socpanel_service_id || null;
    const providerId = preset.api_provider_id ?? null;
    const providerName =
      preset.api_providers?.name ?? (providerId ? "Provider" : "Default provider");

    const alreadySubmitted = await wasServiceAlreadySubmitted({
      platform: params.platform,
      link: params.link,
      serviceType: preset.service_type,
    });

    if (alreadySubmitted) {
      results.push({
        service_type: serviceType,
        slot_index: preset.slot_index ?? 1,
        keywords: normalizeKeywords(preset.keywords ?? preset.comment_categories),
        api_provider_id: providerId,
        provider_name: providerName,
        panel_service_id: serviceId,
        socpanel_service_id: serviceId,
        quantity: preset.quantity,
        error: "Duplicate order",
      });

      continue;
    }

    if (!serviceId) {
      results.push({
        service_type: serviceType,
        slot_index: preset.slot_index ?? 1,
        keywords: normalizeKeywords(preset.keywords ?? preset.comment_categories),
        api_provider_id: providerId,
        provider_name: providerName,
        panel_service_id: null,
        socpanel_service_id: null,
        quantity: preset.quantity,
        error: "No panel service ID mapped for this preset yet.",
      });
      continue;
    }

    try {
      let comments: string | undefined;
      let effectiveKeywordsForResult: string[] | undefined;

      if (isCommentServiceType(serviceType)) {
        if (!shouldSubmitComments({ platform: params.platform, tier: params.tier ?? "regular" })) {
          results.push({
            service_type: serviceType,
            slot_index: preset.slot_index ?? 1,
            keywords: normalizeKeywords(preset.keywords ?? preset.comment_categories),
            api_provider_id: providerId,
            provider_name: providerName,
            panel_service_id: serviceId,
            socpanel_service_id: serviceId,
            quantity: preset.quantity,
            skipped: true,
            error: "Comments are disabled for this platform.",
          });
          continue;
        }

        const effectiveKeywords = normalizeKeywords(
          preset.keywords ?? preset.comment_categories
        );
        effectiveKeywordsForResult = effectiveKeywords;

        let poolId = params.commentPoolId ?? null;

        if (poolId) {
          const { data: poolRow, error: poolErr } = await supabase
            .from("comment_pools")
            .select("id, category, platform")
            .eq("id", poolId)
            .single();

          if (poolErr || !poolRow || poolRow.platform !== params.platform) {
            results.push({
              service_type: serviceType,
              slot_index: preset.slot_index ?? 1,
              keywords: effectiveKeywords,
              api_provider_id: providerId,
              provider_name: providerName,
              panel_service_id: serviceId,
              socpanel_service_id: serviceId,
              quantity: preset.quantity,
              error: "Selected comment pool is invalid for this platform.",
            });
            continue;
          }

          if (
            effectiveKeywords.length > 0 &&
            poolRow.category &&
            !effectiveKeywords.includes(poolRow.category)
          ) {
            results.push({
              service_type: serviceType,
              slot_index: preset.slot_index ?? 1,
              keywords: effectiveKeywords,
              api_provider_id: providerId,
              provider_name: providerName,
              panel_service_id: serviceId,
              socpanel_service_id: serviceId,
              quantity: preset.quantity,
              error: `Selected pool category is ${poolRow.category ?? "uncategorized"} and does not match this slot.`,
            });
            continue;
          }
        }

        if (!poolId) {
          const autoPool = await findOldestAvailablePoolForCategories({
            platform: params.platform,
            categories: effectiveKeywords,
          });

          if (!autoPool) {
            const categoryHint =
              effectiveKeywords.length > 0
                ? ` in categories [${effectiveKeywords.join(", ")}]`
                : "";

            results.push({
              service_type: serviceType,
              slot_index: preset.slot_index ?? 1,
              keywords: effectiveKeywords,
              api_provider_id: providerId,
              provider_name: providerName,
              panel_service_id: serviceId,
              socpanel_service_id: serviceId,
              quantity: preset.quantity,
              error: `No unused comment pool found for ${params.platform}${categoryHint}.`,
            });
            continue;
          }

          poolId = autoPool.id;
        }

        const picked = await popComments(poolId as string, preset.quantity);

        if (picked.length < preset.quantity) {
          results.push({
            service_type: serviceType,
            slot_index: preset.slot_index ?? 1,
            keywords: effectiveKeywords,
            api_provider_id: providerId,
            provider_name: providerName,
            panel_service_id: serviceId,
            socpanel_service_id: serviceId,
            quantity: preset.quantity,
            error: `Only ${picked.length} unused comments left in the pool (needed ${preset.quantity}).`,
          });
          continue;
        }

        comments = picked.join("\n");
      }

      const res = await placePanelOrder({
        providerId,
        serviceId,
        link: params.link,
        quantity: preset.quantity,
        comments,
      });

      if (res.error) {
        results.push({
          service_type: serviceType,
          slot_index: preset.slot_index ?? 1,
          keywords: normalizeKeywords(preset.keywords ?? preset.comment_categories),
          api_provider_id: providerId,
          provider_name: providerName,
          panel_service_id: serviceId,
          socpanel_service_id: serviceId,
          quantity: preset.quantity,
          error: res.error,
          status: res.status,
          debug_detected_categories: isCommentServiceType(serviceType) ? detectedKeywords : undefined,
          debug_effective_categories: isCommentServiceType(serviceType)
            ? effectiveKeywordsForResult
            : undefined,
          debug_slot_decision: undefined,
        });
      } else {
        results.push({
          service_type: serviceType,
          slot_index: preset.slot_index ?? 1,
          keywords: normalizeKeywords(preset.keywords ?? preset.comment_categories),
          api_provider_id: providerId,
          provider_name: providerName,
          panel_service_id: serviceId,
          socpanel_service_id: serviceId,
          quantity: preset.quantity,
          panel_order_id: res.order,
          socpanel_order_id: res.order,
          status: res.status,
          debug_detected_categories: isCommentServiceType(serviceType) ? detectedKeywords : undefined,
          debug_effective_categories: isCommentServiceType(serviceType)
            ? effectiveKeywordsForResult
            : undefined,
          debug_slot_decision: undefined,
        });
      }
    } catch (error) {
      results.push({
        service_type: serviceType,
        slot_index: preset.slot_index ?? 1,
        keywords: normalizeKeywords(preset.keywords ?? preset.comment_categories),
        api_provider_id: providerId,
        provider_name: providerName,
        panel_service_id: serviceId,
        socpanel_service_id: serviceId,
        quantity: preset.quantity,
        error: error instanceof Error ? error.message : "Unknown error placing order.",
      });
    }
  }

  const realResults = results.filter((result) => !result.skipped);
  const hasError = realResults.some((result) => result.error);
  const nextStatus = hasError ? "failed" : "submitted";

  await supabase
    .from("orders")
    .update({
      services_ordered: results,
      status: nextStatus,
    })
    .eq("id", orderRow.id);

  return { orderId: orderRow.id, link: params.link, results, hasError };
}

export async function submitBatchOrders(params: {
  platform: Platform;
  tier?: string;
  links: string[];
  source?: string;
  commentPoolId?: string | null;
}) {
  const cleanLinks = [
    ...new Set(params.links.map((link) => link.trim()).filter(Boolean)),
  ];

  if (cleanLinks.length === 0) {
    throw new Error("Add at least one post link.");
  }

  const orders: Array<{ link: string; error?: string; hasError?: boolean; [key: string]: unknown }> = [];

  for (const link of cleanLinks) {
    try {
      orders.push(
        await submitOrderForLink({
          platform: params.platform,
          tier: params.tier,
          link,
          source: params.source ?? "manual",
          commentPoolId: params.commentPoolId ?? null,
        })
      );
    } catch (error) {
      orders.push({
        link,
        error: error instanceof Error ? error.message : "Failed to submit this link.",
        hasError: true,
      });
    }
  }

  return {
    count: orders.length,
    submitted: orders.filter((order: { error?: string }) => !order.error).length,
    failed: orders.filter((order: { error?: string }) => order.error).length,
    hasError: orders.some((order: { hasError?: boolean; error?: string }) => order.hasError || order.error),
    orders,
  };
}