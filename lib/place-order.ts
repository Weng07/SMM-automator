import { supabaseAdmin } from "./supabase";
import { placePanelOrder } from "./smm-panel";
import { isXCommentCategory } from "./comment-categories";

type Platform = "x" | "instagram" | "tiktok" | "linkedin" | "youtube";
type Tier = "priority" | "regular";

type ServiceResult = {
  service_type: string;
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
  return serviceType === "comments" || serviceType.startsWith("comments_slot_");
}

function normalizeCommentCategories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter((item): item is string => isXCommentCategory(item));
}

function inferXCommentCategoriesFromLink(link: string): string[] {
  const normalized = link.toLowerCase();
  const categories = ["litho", "ignite", "thanos"];

  return categories.filter((category) => normalized.includes(category));
}

function resolveCommentCategories(params: {
  platform: Platform;
  link: string;
  presetCategories: string[];
}) {
  const presetCategories = [...new Set(params.presetCategories)];

  if (params.platform !== "x") {
    return presetCategories;
  }

  const inferredFromLink = inferXCommentCategoriesFromLink(params.link);

  if (inferredFromLink.length === 0) {
    return presetCategories;
  }

  if (presetCategories.length === 0) {
    return inferredFromLink;
  }

  const intersection = presetCategories.filter((category) =>
    inferredFromLink.includes(category)
  );

  return intersection.length > 0 ? intersection : inferredFromLink;
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
  tier: Tier;
  link: string;
  serviceType: string;
}) {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("orders")
    .select("id, services_ordered")
    .eq("platform", params.platform)
    .eq("tier", params.tier)
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
        service.service_type === params.serviceType &&
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
    tier: orderRow.tier as Tier,
    link: orderRow.link,
    source: orderRow.source ?? "retry",
    commentPoolId: orderRow.comment_pool_id ?? null,
  });
}

export async function submitOrderForLink(params: {
  platform: Platform;
  tier: Tier;
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
    .eq("tier", params.tier)
    .eq("enabled", true);

  if (presetErr) throw presetErr;

  if (!presets || presets.length === 0) {
    throw new Error(
      `No enabled service presets found for ${params.platform}/${params.tier}. Configure them in Services first.`
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
      tier: params.tier,
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

  for (const preset of filteredPresets) {
    if (
      params.platform === "x" &&
      params.tier === "priority" &&
      preset.service_type === "comments"
    ) {
      results.push({
        service_type: preset.service_type,
        api_provider_id: preset.api_provider_id ?? null,
        provider_name: preset.api_providers?.name ?? "Provider",
        panel_service_id: preset.panel_service_id || preset.socpanel_service_id,
        socpanel_service_id: preset.panel_service_id || preset.socpanel_service_id,
        quantity: preset.quantity,
        skipped: true,
        error: "Legacy comments preset skipped. Use comments slot 1/2 in Services.",
      });
      continue;
    }

    const serviceId = preset.panel_service_id || preset.socpanel_service_id;
    const providerId = preset.api_provider_id ?? null;
    const providerName =
      preset.api_providers?.name ?? (providerId ? "Provider" : "Default provider");

    const alreadySubmitted = await wasServiceAlreadySubmitted({
      platform: params.platform,
      tier: params.tier,
      link: params.link,
      serviceType: preset.service_type,
    });

    if (alreadySubmitted) {
      results.push({
        service_type: preset.service_type,
        api_provider_id: providerId,
        provider_name: providerName,
        panel_service_id: serviceId,
        socpanel_service_id: serviceId,
        quantity: 0,
        skipped: true,
        error: "Duplicate service skipped because it was already submitted successfully for this link.",
      });

      continue;
    }

    if (!serviceId) {
      results.push({
        service_type: preset.service_type,
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

      if (isCommentServiceType(preset.service_type)) {
        if (params.tier !== "priority") {
          results.push({
            service_type: preset.service_type,
            api_provider_id: providerId,
            provider_name: providerName,
            panel_service_id: serviceId,
            socpanel_service_id: serviceId,
            quantity: preset.quantity,
            skipped: true,
            error: "Comments are only submitted in priority mode.",
          });
          continue;
        }

        const selectedCategories = normalizeCommentCategories(
          (preset as { comment_categories?: unknown }).comment_categories
        );
        const effectiveCategories = resolveCommentCategories({
          platform: params.platform,
          link: params.link,
          presetCategories: selectedCategories,
        });

      let poolId = params.commentPoolId ?? null;

        if (poolId) {
          const { data: poolRow, error: poolErr } = await supabase
            .from("comment_pools")
            .select("id, category, platform")
            .eq("id", poolId)
            .single();

          if (poolErr || !poolRow || poolRow.platform !== params.platform) {
            results.push({
              service_type: preset.service_type,
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
            effectiveCategories.length > 0 &&
            (!poolRow.category || !effectiveCategories.includes(poolRow.category))
          ) {
            results.push({
              service_type: preset.service_type,
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
            categories: effectiveCategories,
          });

          if (!autoPool) {
            const categoryHint =
              effectiveCategories.length > 0
                ? ` in categories [${effectiveCategories.join(", ")}]`
                : "";

            results.push({
              service_type: preset.service_type,
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
            service_type: preset.service_type,
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
          service_type: preset.service_type,
          api_provider_id: providerId,
          provider_name: providerName,
          panel_service_id: serviceId,
          socpanel_service_id: serviceId,
          quantity: preset.quantity,
          error: res.error,
          status: res.status,
        });
      } else {
        results.push({
          service_type: preset.service_type,
          api_provider_id: providerId,
          provider_name: providerName,
          panel_service_id: serviceId,
          socpanel_service_id: serviceId,
          quantity: preset.quantity,
          panel_order_id: res.order,
          socpanel_order_id: res.order,
          status: res.status,
        });
      }
    } catch (error) {
      results.push({
        service_type: preset.service_type,
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
  tier: Tier;
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