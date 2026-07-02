"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadOrders() {
    setLoading(true);

    try {
      const res = await fetch("/api/orders?limit=100");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const stats = useMemo(() => {
    const submitted = orders.filter((o) => o.status === "submitted").length;
    const pending = orders.filter((o) => o.status === "pending").length;
    const failed = orders.filter((o) => o.status === "failed").length;

    return {
      total: orders.length,
      submitted,
      pending,
      failed,
    };
  }, [orders]);

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
          <span className="display text-2xl font-semibold">{stats.total}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-[#2ecc71]">
            <CheckCircle2 size={14} />
            <span className="text-xs">Submitted</span>
          </div>
          <span className="display text-2xl font-semibold">{stats.submitted}</span>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 text-[#fbbf24]">
            <Clock size={14} />
            <span className="text-xs">Pending</span>
          </div>
          <span className="display text-2xl font-semibold">{stats.pending}</span>
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

          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={loadOrders}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
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

        <div className="flex flex-col gap-2">
          {visibleOrders.length === 0 && (
            <div className="empty-state">
              No orders found for this filter.
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

                <div className="flex flex-wrap gap-2">
                  {order.services_ordered.map((service, index) => (
                    <span
                      key={index}
                      className={`badge ${service.error ? "badge-err" : "badge-ok"}`}
                      title={service.error}
                    >
                      {service.error && <AlertTriangle size={11} />}
                      {service.service_type}: {service.quantity}
                      {service.provider_name ? ` · ${service.provider_name}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}