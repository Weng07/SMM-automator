import { supabaseAdmin } from "./supabase";
import { placePanelOrder } from "./smm-panel";

type Platform = "x" | "instagram" | "tiktok" | "linkedin";
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
  error?: string;
};

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

    if (poolCheckErr || !pool) throw new Error("Selected comment pool could not be found.");
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

  for (const preset of presets) {
    const serviceId = preset.panel_service_id || preset.socpanel_service_id;
    const providerId = preset.api_provider_id ?? null;
    const providerName = preset.api_providers?.name ?? (providerId ? "Provider" : "Default provider");

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

      if (preset.service_type === "comments") {
        if (!params.commentPoolId) {
          results.push({
            service_type: preset.service_type,
            api_provider_id: providerId,
            provider_name: providerName,
            panel_service_id: serviceId,
            socpanel_service_id: serviceId,
            quantity: preset.quantity,
            error: "Custom comments service requires a comment pool.",
          });
          continue;
        }

        const picked = await popComments(params.commentPoolId, preset.quantity);
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
        });
      }
    } catch (e: any) {
      results.push({
        service_type: preset.service_type,
        api_provider_id: providerId,
        provider_name: providerName,
        panel_service_id: serviceId,
        socpanel_service_id: serviceId,
        quantity: preset.quantity,
        error: e?.message ?? "Unknown error placing order.",
      });
    }
  }

  const hasError = results.some((r) => r.error);
  const allFailed = results.every((r) => r.error);

  await supabase
    .from("orders")
    .update({
      services_ordered: results,
      status: allFailed ? "failed" : "submitted",
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
  const cleanLinks = [...new Set(params.links.map((link) => link.trim()).filter(Boolean))];
  if (cleanLinks.length === 0) throw new Error("Add at least one post link.");

  const orders = [];
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
    } catch (e: any) {
      orders.push({ link, error: e?.message ?? "Failed to submit this link.", hasError: true });
    }
  }

  return {
    count: orders.length,
    submitted: orders.filter((order: any) => !order.error).length,
    failed: orders.filter((order: any) => order.error).length,
    hasError: orders.some((order: any) => order.hasError || order.error),
    orders,
  };
}
