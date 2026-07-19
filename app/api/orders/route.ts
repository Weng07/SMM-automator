import { after, NextRequest, NextResponse } from "next/server";
import { retryOrderForId, submitOrderForLink } from "@/lib/place-order";
import { parseOrderLinks } from "@/lib/order-links";
import { fetchOrderStatus } from "@/lib/smm-panel";

type Platform = "x" | "instagram" | "tiktok" | "linkedin" | "youtube";

type ServiceEntry = {
  service_type?: string;
  quantity?: number;
  provider_name?: string;
  panel_service_id?: string;
  socpanel_service_id?: string;
  panel_order_id?: string | number | null;
  socpanel_order_id?: string | number | null;
  api_provider_id?: string | null;
  error?: string;
  skipped?: boolean;
  status?: string;
  [key: string]: unknown;
};

const CANCELED_STATUSES = new Set([
  "canceled",
  "cancelled",
  "cancel",
  "cancellation",
  "failed",
  "error",
  "declined",
  "rejected",
  "denied",
]);

function extractNormalizedProviderState(payload: unknown): {
  status?: string;
  error?: string;
} {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return {};
    return { error: trimmed };
  }

  if (!payload || typeof payload !== "object") {
    return {};
  }

  const response = payload as Record<string, unknown>;
  const nested =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : undefined;
  const candidate = nested ?? response;

  const status =
    typeof candidate.status === "string"
      ? candidate.status
      : typeof candidate.state === "string"
        ? candidate.state
        : undefined;

  const error =
    typeof candidate.error === "string"
      ? candidate.error
      : typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.err === "string"
          ? candidate.err
          : typeof candidate.detail === "string"
            ? candidate.detail
            : typeof candidate.reason === "string"
              ? candidate.reason
              : undefined;

  return {
    status: status?.trim().toLowerCase(),
    error: error?.trim(),
  };
}

function isCanceledOnProviderSide(payload: unknown): boolean {
  const state = extractNormalizedProviderState(payload);

  if (state.status && CANCELED_STATUSES.has(state.status)) {
    return true;
  }

  if (!state.error) {
    return false;
  }

  return /canceled|cancelled|cancel|failed|error|declined|rejected|denied/i.test(
    state.error
  );
}

function normalizeOrderStatus(services: ServiceEntry[]): "submitted" | "failed" {
  const realServices = services.filter((service) => !service.skipped);
  const hasError = realServices.some((service) => Boolean(service.error));
  return hasError ? "failed" : "submitted";
}

function isDuplicateSkippedService(service: ServiceEntry): boolean {
  if (!service.skipped) {
    return false;
  }

  const errorMessage = typeof service.error === "string" ? service.error : "";

  return /duplicate service skipped|already submitted successfully/i.test(
    errorMessage
  );
}

function detectPlatformFromLink(link: string): Platform | null {
  const cleanLink = link.trim().toLowerCase();

  try {
    const url = new URL(cleanLink);
    const host = url.hostname.replace(/^www\./, "");

    if (
      host === "x.com" ||
      host === "twitter.com" ||
      host.endsWith(".x.com") ||
      host.endsWith(".twitter.com")
    ) {
      return "x";
    }

    if (
      host === "instagram.com" ||
      host.endsWith(".instagram.com")
    ) {
      return "instagram";
    }

    if (
      host === "tiktok.com" ||
      host === "vt.tiktok.com" ||
      host === "vm.tiktok.com" ||
      host.endsWith(".tiktok.com")
    ) {
      return "tiktok";
    }

    if (
      host === "linkedin.com" ||
      host.endsWith(".linkedin.com")
    ) {
      return "linkedin";
    }

    if (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "m.youtube.com" ||
      host.endsWith(".youtube.com")
    ) {
      return "youtube";
    }

    return null;
  } catch {
    if (cleanLink.includes("x.com/") || cleanLink.includes("twitter.com/")) {
      return "x";
    }

    if (cleanLink.includes("instagram.com/")) {
      return "instagram";
    }

    if (cleanLink.includes("tiktok.com/")) {
      return "tiktok";
    }

    if (cleanLink.includes("linkedin.com/")) {
      return "linkedin";
    }

    if (
      cleanLink.includes("youtube.com/") ||
      cleanLink.includes("youtu.be/")
    ) {
      return "youtube";
    }

    return null;
  }
}

export async function GET(req: NextRequest) {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const parsedLimit = Number(searchParams.get("limit") ?? "25");
  const parsedPage = Number(searchParams.get("page") ?? "1");
  const rawStatus = (searchParams.get("status") ?? "all").trim().toLowerCase();

  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(parsedLimit, 100))
    : 25;
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (["submitted", "pending", "failed"].includes(rawStatus)) {
    query = query.eq("status", rawStatus);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = count ?? 0;

  return NextResponse.json({
    orders: data ?? [],
    page,
    limit,
    total,
    hasPrev: page > 1,
    hasNext: from + (data?.length ?? 0) < total,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, orderId, tier, link, links, commentPoolId } = body;

    if (action === "sync") {
      const { supabaseAdmin } = await import("@/lib/supabase");
      const supabase = supabaseAdmin();

      const parsedLimit = Number(body.limit ?? "25");
      const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(parsedLimit, 200))
        : 25;

      let query = supabase
        .from("orders")
        .select("id, status, services_ordered, created_at")
        .order("created_at", { ascending: false });

      if (typeof orderId === "string" && orderId.trim()) {
        query = query.eq("id", orderId.trim());
      } else {
        query = query.limit(limit);
      }

      const { data: orders, error: ordersError } = await query;

      if (ordersError) {
        return NextResponse.json({ error: ordersError.message }, { status: 500 });
      }

      let checkedOrders = 0;
      let updatedOrders = 0;
      let canceledServices = 0;
      let removedDuplicateServices = 0;
      let deletedOrders = 0;
      let fallbackReordersQueued = 0;
      let fallbackReordersFailed = 0;

      for (const order of orders ?? []) {
        checkedOrders += 1;

        const services = Array.isArray(order.services_ordered)
          ? (order.services_ordered as ServiceEntry[])
          : [];

        if (services.length === 0) {
          continue;
        }

        let orderChanged = false;
        const nextServices: ServiceEntry[] = [];
        const canceledServiceTypes = new Set<string>();
        const canceledServiceIdsByType: Record<string, Set<string>> = {};
        const fallbackDefaultsByType: Record<
          string,
          { quantity?: number; keywords?: string[] }
        > = {};

        for (const service of services) {
          if (isDuplicateSkippedService(service)) {
            removedDuplicateServices += 1;
            orderChanged = true;
            continue;
          }

          const providerOrderId =
            service.panel_order_id ?? service.socpanel_order_id;
          const providerId =
            typeof service.api_provider_id === "string"
              ? service.api_provider_id
              : null;

          if (service.skipped || !providerOrderId) {
            nextServices.push(service);
            continue;
          }

          try {
            const statusPayload = await fetchOrderStatus(
              String(providerOrderId),
              providerId
            );

            if (!isCanceledOnProviderSide(statusPayload)) {
              nextServices.push(service);
              continue;
            }

            canceledServices += 1;
            orderChanged = true;

            if (typeof service.service_type === "string" && service.service_type.trim()) {
              const normalizedType = service.service_type.trim();
              canceledServiceTypes.add(normalizedType);

              const canceledServiceId = String(
                service.panel_service_id ?? service.socpanel_service_id ?? ""
              ).trim();

              if (canceledServiceId) {
                const existing = canceledServiceIdsByType[normalizedType] ?? new Set<string>();
                existing.add(canceledServiceId);
                canceledServiceIdsByType[normalizedType] = existing;
              }

              fallbackDefaultsByType[normalizedType] = {
                quantity:
                  typeof service.quantity === "number" && Number.isFinite(service.quantity)
                    ? Number(service.quantity)
                    : undefined,
                keywords: Array.isArray(service.keywords)
                  ? service.keywords
                      .map((value) => String(value).trim().toLowerCase())
                      .filter(Boolean)
                  : [],
              };
            }

            nextServices.push({
              ...service,
              panel_order_id: null,
              socpanel_order_id: null,
              status: "canceled",
              error: "Canceled on provider side.",
            });
          } catch {
            // Do not block sync because one provider status request failed.
            nextServices.push(service);
          }
        }

        if (!orderChanged) {
          continue;
        }

        if (nextServices.length === 0) {
          const { error: deleteError } = await supabase
            .from("orders")
            .delete()
            .eq("id", order.id);

          if (deleteError) {
            return NextResponse.json(
              { error: deleteError.message },
              { status: 500 }
            );
          }

          deletedOrders += 1;
          continue;
        }

        const nextStatus = normalizeOrderStatus(nextServices);

        const { error: updateError } = await supabase
          .from("orders")
          .update({
            services_ordered: nextServices,
            status: nextStatus,
          })
          .eq("id", order.id);

        if (updateError) {
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 }
          );
        }

        updatedOrders += 1;

        if (canceledServiceTypes.size > 0) {
          try {
            const avoidServiceIdsByType = Object.fromEntries(
              Object.entries(canceledServiceIdsByType).map(([serviceType, ids]) => [
                serviceType,
                [...ids],
              ])
            );

            await retryOrderForId(order.id, {
              forceFallbackServiceTypes: [...canceledServiceTypes],
              avoidServiceIdsByType,
              fallbackDefaultsByType,
            });

            fallbackReordersQueued += 1;
          } catch {
            fallbackReordersFailed += 1;
          }
        }
      }

      return NextResponse.json({
        ok: true,
        sync: true,
        checkedOrders,
        updatedOrders,
        deletedOrders,
        canceledServices,
        removedDuplicateServices,
        fallbackReordersQueued,
        fallbackReordersFailed,
      });
    }

    if (action === "retry") {
      if (typeof orderId !== "string" || !orderId.trim()) {
        return NextResponse.json(
          { error: "orderId is required for retry requests." },
          { status: 400 }
        );
      }

      const result = await retryOrderForId(orderId, {
        fallbackForFailedServices: true,
      });
      return NextResponse.json({ ok: true, retry: true, orderId: result.orderId });
    }

    const rawLinks =
      typeof links === "string"
        ? links
        : typeof link === "string"
          ? link
          : "";

    const batchLinks = Array.isArray(links)
      ? links
          .flatMap((item) => parseOrderLinks(String(item)))
          .filter(Boolean)
      : parseOrderLinks(rawLinks);

    if (batchLinks.length === 0) {
      return NextResponse.json(
        { error: "At least one link is required." },
        { status: 400 }
      );
    }

    const normalizedTier =
      typeof tier === "string" && tier.trim() ? tier.trim() : "regular";

    const normalizedUniqueLinks = [
      ...new Set(batchLinks.map((item) => item.trim()).filter(Boolean)),
    ];

    const detectedLinks = normalizedUniqueLinks.map((item) => {
      const detectedPlatform = detectPlatformFromLink(item);

      return {
        link: item,
        platform: detectedPlatform,
      };
    });

    const unsupportedLink = detectedLinks.find((item) => !item.platform);

    if (unsupportedLink) {
      return NextResponse.json(
        {
          error:
            "One of the links does not look like a supported social media URL. Please check the link and try again.",
          link: unsupportedLink.link,
        },
        { status: 400 }
      );
    }

    after(async () => {
      try {
        const tasks = detectedLinks
          .filter(
            (item): item is { link: string; platform: Platform } =>
              Boolean(item.platform)
          )
          .map((item) =>
            submitOrderForLink({
              platform: item.platform,
              tier: normalizedTier,
              link: item.link,
              commentPoolId: commentPoolId ?? null,
            })
          );

        const results = await Promise.allSettled(tasks);
        const failedCount = results.filter(
          (result) => result.status === "rejected"
        ).length;

        if (failedCount > 0) {
          console.error(
            `Background order submission finished with ${failedCount} failed task(s).`
          );
        }
      } catch (error) {
        console.error("Background order submission failed:", error);
      }
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      count: normalizedUniqueLinks.length,
      message: "Links detected and queued for background processing.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit order." },
      { status: 500 }
    );
  }
}