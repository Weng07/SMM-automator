"use client";

import { useEffect, useState } from "react";
import { PLATFORM_META, PlatformKey } from "@/lib/platform-meta";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ListOrdered,
  RefreshCw,
  XCircle,
} from "lucide-react";

type Order = {
  id: string;
  platform: string;
  tier: string;
  link: string;
  status: string;
  services_ordered: {
    service_type: string;
    quantity: number;
    provider_name?: string;
    panel_service_id?: string;
    error?: string;
    skipped?: boolean;
    debug_detected_categories?: string[];
    debug_effective_categories?: string[];
    debug_slot_decision?: string;
  }[];
  created_at: string;
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`badge ${tier === "priority" ? "badge-priority" : "badge-regular"}`}>
      {tier}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "submitted"
      ? "badge-ok"
      : status === "failed"
        ? "badge-err"
        : "badge-warn";

  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>(() => {
    if (typeof window === "undefined") return [];

    const cached = window.localStorage.getItem("panelist_orders_page_orders");

    if (!cached) return [];

    try {
      return JSON.parse(cached);
    } catch {
      return [];
    }
  });

  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    pending: 0,
    failed: 0,
  });

  const [statsLoading, setStatsLoading] = useState(true);

  const [ordersLoading, setOrdersLoading] = useState(() => {
    if (typeof window === "undefined") return true;

    return !window.localStorage.getItem("panelist_orders_page_orders");
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadOrders() {
    const hasCachedOrders =
      typeof window !== "undefined" &&
      window.localStorage.getItem("panelist_orders_page_orders");

    if (!hasCachedOrders) {
      setOrdersLoading(true);
    }

    try {
      const res = await fetch("/api/orders?limit=25");
      const data = await res.json();
      const nextOrders = data.orders ?? [];

      setOrders(nextOrders);
      window.localStorage.setItem(
        "panelist_orders_page_orders",
        JSON.stringify(nextOrders)
      );
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);

    try {
      const res = await fetch("/api/order-stats");
      const data = await res.json();

      setStats({
        total: data.totalOrders ?? 0,
        submitted: data.submittedOrders ?? 0,
        pending: data.pendingOrders ?? 0,
        failed: data.failedOrders ?? 0,
      });
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders();
    void loadStats();
  }, []);

  async function retryOrder(orderId: string) {
    setRetryingOrderId(orderId);
    setFeedback(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", orderId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Retry failed.");
      }

      setFeedback("Retry queued successfully.");
      await loadOrders();
      await loadStats();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setRetryingOrderId(null);
    }
  }

  async function syncOrders() {
    setSyncing(true);
    setFeedback(null);
    let shouldRefresh = false;

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", limit: 50 }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Sync failed.");
      }

      setFeedback(
        `${data.checkedOrders ?? 0} orders checked, ${data.updatedOrders ?? 0} updated, ${data.deletedOrders ?? 0} duplicate order${(data.deletedOrders ?? 0) === 1 ? "" : "s"} removed, ${data.canceledServices ?? 0} service${(data.canceledServices ?? 0) === 1 ? "" : "s"} marked as canceled on provider side, ${data.removedDuplicateServices ?? 0} duplicate trace${(data.removedDuplicateServices ?? 0) === 1 ? "" : "s"} removed, ${data.fallbackReordersQueued ?? 0} fallback reorder${(data.fallbackReordersQueued ?? 0) === 1 ? "" : "s"} queued${(data.fallbackReordersFailed ?? 0) > 0 ? ` (${data.fallbackReordersFailed} failed)` : ""}.`
      );
      shouldRefresh = true;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }

    if (shouldRefresh) {
      setLoading(true);
      try {
        await loadOrders();
        await loadStats();
      } finally {
        setLoading(false);
      }
    }
  }

  const visibleOrders = orders.filter((order) => {
    if (statusFilter === "all") return true;
    return order.status === statusFilter;
  });

  return (
    <div className="flex flex-col gap-7">
      <section className="panel" style={{ padding: "22px" }}>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Order monitor</span>
          <h1 className="display text-2xl font-semibold tracking-tight">
            Orders
          </h1>
          <p className="text-sm text-[#9aa3c7] max-w-2xl">
            Track submitted, pending, and failed orders from your mass order queue.
          </p>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        <div className="stat-card">
          <div className="flex items-center gap-2 text-[#9aa3c7]">
            <ListOrdered size={14} />
            <span className="text-xs">Total orders</span>
          </div>
          <span className="display text-2xl font-semibold">
            {statsLoading ? "..." : stats.total}
          </span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-[#2ecc71]">
            <CheckCircle2 size={14} />
            <span className="text-xs">Submitted</span>
          </div>
          <span className="display text-2xl font-semibold">
            {statsLoading ? "..." : stats.submitted}
          </span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-[#fbbf24]">
            <Clock size={14} />
            <span className="text-xs">Pending</span>
          </div>
          <span className="display text-2xl font-semibold">
            {statsLoading ? "..." : stats.pending}
          </span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-[#ef4444]">
            <XCircle size={14} />
            <span className="text-xs">Failed</span>
          </div>
          <span className="display text-2xl font-semibold">{stats.failed}</span>
        </div>
      </div>

      <div className="panel flex flex-col gap-4" style={{ padding: "22px" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Order list</div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={() => {
                void syncOrders();
              }}
              disabled={syncing || loading}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing..." : "Sync"}
            </button>

            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={() => {
                void (async () => {
                  setLoading(true);
                  try {
                    await loadOrders();
                    await loadStats();
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              disabled={loading || syncing}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "10px",
          }}
        >
          {["all", "submitted", "pending", "failed"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`platform-pill ${statusFilter === status ? "active" : ""}`}
            >
              {status}
            </button>
          ))}
        </div>

        {feedback && (
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#f5f6fa]">
            {feedback}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {visibleOrders.length === 0 && (
            <div className="empty-state">
              No orders found for this filter.
            </div>
          )}

          {ordersLoading && orders.length === 0 && (
            <div className="text-sm text-[#8b8fa3]">
              Loading recent orders...
            </div>
          )}

          {visibleOrders.map((order) => {
            const meta = PLATFORM_META[order.platform as PlatformKey];
            const Icon = meta?.icon;

            return (
              <div
                key={order.id}
                className="panel-alt flex flex-col gap-3"
                style={{ padding: "16px" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {Icon && (
                      <div
                        className="flex items-center justify-center border border-white/10"
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "5px",
                          background: meta.bg,
                        }}
                      >
                        <Icon size={14} style={{ color: meta.color }} />
                      </div>
                    )}

                    <TierBadge tier={order.tier} />
                    <StatusBadge status={order.status} />
                  </div>

                  <span className="mono text-xs text-[#64708f]">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>

                <a
                  href={order.link}
                  target="_blank"
                  className="text-sm text-[#f5f6fa] hover:text-[#a78bfa] flex items-center gap-1.5 break-all"
                >
                  {order.link}
                  <ExternalLink size={12} className="shrink-0 text-[#64708f]" />
                </a>

                <div className="flex flex-wrap items-center gap-2">
                  {order.services_ordered
                    .filter((service) => !service.skipped)
                    .map((service, index) => {
                    const isFailure = Boolean(service.error && !service.skipped);

                    return (
                      <span
                        key={index}
                        className={`badge ${isFailure ? "badge-err" : "badge-ok"}`}
                        title={service.error}
                      >
                        {service.error && <AlertTriangle size={11} />}
                        {service.service_type} · {service.quantity}
                        {service.provider_name ? ` · ${service.provider_name}` : ""}
                      </span>
                    );
                  })}
                </div>

                {order.services_ordered.some((service) => service.error && !service.skipped) && (
                  <button
                    type="button"
                    className="btn-secondary self-start"
                    onClick={() => retryOrder(order.id)}
                    disabled={retryingOrderId === order.id}
                  >
                    {retryingOrderId === order.id ? "Retrying..." : "Retry failed"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}