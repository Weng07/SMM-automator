import { supabaseAdmin } from "./supabase";
import { placeOrder } from "./socpanel";

type Platform = "x" | "instagram" | "tiktok" | "linkedin";
type Tier = "priority" | "regular";

type ServiceResult = {
  service_type: string;
  socpanel_service_id: string | null;
  quantity: number;
  socpanel_order_id?: string | number;
  error?: string;
};

/**
 * Pulls a fresh, unused comment for the given pool, marks it used, and
 * links it to the order once the order row exists.
 */
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
  source?: "manual";
  commentPoolId?: string | null;
}) {
  const supabase = supabaseAdmin();

  // 0. If a comment pool was passed, make sure it actually belongs to this platform.
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

  // 1. Pull the enabled presets for this platform + tier.
  const { data: presets, error: presetErr } = await supabase
    .from("service_presets")
    .select("*")
    .eq("platform", params.platform)
    .eq("tier", params.tier)
    .eq("enabled", true);

  if (presetErr) throw presetErr;
  if (!presets || presets.length === 0) {
    throw new Error(
      `No enabled service presets found for ${params.platform}/${params.tier}. Configure them in Services first.`
    );
  }

  // 2. Create the order row up front so it's tracked even if a service call fails.
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
    if (!preset.socpanel_service_id) {
      results.push({
        service_type: preset.service_type,
        socpanel_service_id: null,
        quantity: preset.quantity,
        error: "No SocPanel service ID mapped for this preset yet.",
      });
      continue;
    }

    try {
      let comments: string | undefined;
      if (preset.service_type === "comments") {
        if (!params.commentPoolId) {
          results.push({
            service_type: preset.service_type,
            socpanel_service_id: preset.socpanel_service_id,
            quantity: preset.quantity,
            error: "Custom comments service requires a comment pool.",
          });
          continue;
        }
        const picked = await popComments(params.commentPoolId, preset.quantity);
        if (picked.length < preset.quantity) {
          results.push({
            service_type: preset.service_type,
            socpanel_service_id: preset.socpanel_service_id,
            quantity: preset.quantity,
            error: `Only ${picked.length} unused comments left in the pool (needed ${preset.quantity}).`,
          });
          continue;
        }
        comments = picked.join("\n");
      }

      const res = await placeOrder({
        serviceId: preset.socpanel_service_id,
        link: params.link,
        quantity: preset.quantity,
        comments,
      });

      if (res.error) {
        results.push({
          service_type: preset.service_type,
          socpanel_service_id: preset.socpanel_service_id,
          quantity: preset.quantity,
          error: res.error,
        });
      } else {
        results.push({
          service_type: preset.service_type,
          socpanel_service_id: preset.socpanel_service_id,
          quantity: preset.quantity,
          socpanel_order_id: res.order,
        });
      }
    } catch (e: any) {
      results.push({
        service_type: preset.service_type,
        socpanel_service_id: preset.socpanel_service_id,
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

  return { orderId: orderRow.id, results, hasError };
}
