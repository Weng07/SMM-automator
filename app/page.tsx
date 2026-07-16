"use client";

import { useEffect, useMemo, useState } from "react";
import { PLATFORM_META, PLATFORMS } from "@/lib/platform-meta";
import { parseOrderLinks } from "@/lib/order-links";
import {
  CheckCircle2,
  Clock,
  Layers3,
  ListOrdered,
  Rocket,
  Sparkles,
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

export default function OverviewPage() {
  const [, setOrders] = useState<Order[]>(() => {
    if (typeof window === "undefined") return [];

    const cached = window.localStorage.getItem("panelist_recent_orders");

    if (!cached) return [];

    try {
      return JSON.parse(cached);
    } catch {
      return [];
    }
  });
  const [, setOrdersLoading] = useState(() => {
    if (typeof window === "undefined") return true;

    return !window.localStorage.getItem("panelist_recent_orders");
  });
  const [stats, setStats] = useState(() => {
    if (typeof window === "undefined") {
      return {
        total: 0,
        submitted: 0,
        pending: 0,
        failed: 0,
      };
    }

    const cached = window.localStorage.getItem("panelist_order_stats");

    if (!cached) {
      return {
        total: 0,
        submitted: 0,
        pending: 0,
        failed: 0,
      };
    }

    try {
      return JSON.parse(cached);
    } catch {
      return {
        total: 0,
        submitted: 0,
        pending: 0,
        failed: 0,
      };
    }
  });
  const [statsLoading, setStatsLoading] = useState(() => {
    if (typeof window === "undefined") return true;

    return !window.localStorage.getItem("panelist_order_stats");
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [links, setLinks] = useState("");

  const linkList = useMemo(() => parseOrderLinks(links), [links]);

  async function loadOrders() {
    const hasCachedOrders =
      typeof window !== "undefined" &&
      window.localStorage.getItem("panelist_recent_orders");

    if (!hasCachedOrders) {
      setOrdersLoading(true);
    }

    try {
      const res = await fetch("/api/orders?limit=25");
      const data = await res.json();
      const nextOrders = data.orders ?? [];

      setOrders(nextOrders);
      window.localStorage.setItem(
        "panelist_recent_orders",
        JSON.stringify(nextOrders)
      );
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadStats() {
    const hasCachedStats =
      typeof window !== "undefined" &&
      window.localStorage.getItem("panelist_order_stats");

    if (!hasCachedStats) {
      setStatsLoading(true);
    }

    try {
      const res = await fetch("/api/order-stats");
      const data = await res.json();

      const nextStats = {
        total: data.totalOrders ?? 0,
        submitted: data.submittedOrders ?? 0,
        pending: data.pendingOrders ?? 0,
        failed: data.failedOrders ?? 0,
      };

      setStats(nextStats);
      window.localStorage.setItem(
        "panelist_order_stats",
        JSON.stringify(nextStats)
      );
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders();
    void loadStats();
  }, []);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const count = data.count ?? 1;
      const failed = data.failed ?? 0;
      setMsg(
        failed
          ? `${count} link${count === 1 ? "" : "s"} processed with ${failed} failed. Check recent orders.`
          : `${count} link${count === 1 ? "" : "s"} sent to the background engine.`
      );

      setLinks("");
      loadOrders();
      loadStats();
    } catch (error) {
      setMsg(`Error: ${error instanceof Error ? error.message : "Unexpected error."}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
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
          <span className="display text-2xl font-semibold">
            {statsLoading ? "..." : stats.failed}
          </span>
        </div>
      </div>

      <div>
        <form
          onSubmit={submitOrder}
          className="panel p-6 flex flex-col gap-5"
          style={{ marginTop: "18px" , padding: "18px" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <Rocket size={16} className="text-[#22d3ee]" />
                New mass order
              </div>
              <p className="text-xs text-[#7f89b2] mt-1">One link per line, or comma-separated. The app will create one tracked order per link.</p>
            </div>
            <span className="badge badge-info">
              <Layers3 size={12} />
              {linkList.length} queued
            </span>
          </div>

          <div>
            <label className="field-label">Supported platforms</label>

            <p className="text-xs text-[#8b8fa3]" style={{ marginBottom: "10px" }}>
              Paste mixed links together. The system will detect each platform automatically.
            </p>

            <div className="platform-grid">
              {PLATFORMS.map((p) => {
                const meta = PLATFORM_META[p];
                const Icon = meta.icon;

                return (
                  <div
                    key={p}
                    className="platform-pill"
                    style={{
                      cursor: "default",
                      opacity: 0.95,
                    }}
                  >
                    <Icon size={15} style={{ color: meta.color }} />
                    {meta.label}
                  </div>
                );
              })}
            </div>
          </div>
        <div>
          <label className="field-label">Post links</label>
          <textarea
            className="input min-h-36 resize-y leading-6"
            placeholder={"https://post-link-1\nhttps://post-link-2\nhttps://post-link-3"}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <button className="btn flex items-center gap-2" type="submit" disabled={loading || linkList.length === 0}>
            <Sparkles size={14} />
            {loading ? "Submitting batch..." : linkList.length > 1 ? "Submit mass order" : "Submit order"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.startsWith("Error") ? "text-[#ef4444]" : "text-[#9aa3c7]"}`}>
              {msg}
            </span>
          )}
        </div>
      </form>
    </div>
    </div>
  );
}