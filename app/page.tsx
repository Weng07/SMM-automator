"use client";

import { useEffect, useMemo, useState } from "react";
import { PLATFORM_META, PLATFORMS, PlatformKey } from "@/lib/platform-meta";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
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

type Pool = { id: string; name: string; unused_count: number };

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`badge ${tier === "priority" ? "badge-priority" : "badge-regular"}`}>
      {tier}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "submitted" ? "badge-ok" : status === "failed" ? "badge-err" : "badge-warn";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function OverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [platform, setPlatform] = useState<PlatformKey>("instagram");
  const [tier, setTier] = useState("regular");
  const [links, setLinks] = useState("");
  const [commentPoolId, setCommentPoolId] = useState("");

  const linkList = useMemo(
    () => links.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
    [links]
  );

  async function loadOrders() {
    const res = await fetch("/api/orders?limit=25");
    const data = await res.json();
    setOrders(data.orders ?? []);
  }

  async function loadPools(forPlatform: string) {
    const res = await fetch(`/api/comments/upload?platform=${forPlatform}`);
    const data = await res.json();
    setPools(data.pools ?? []);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    loadPools(platform);
    setCommentPoolId("");
  }, [platform]);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, tier, links: linkList, commentPoolId: commentPoolId || null }),
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
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const submitted = orders.filter((o) => o.status === "submitted").length;
    const pending = orders.filter((o) => o.status === "pending").length;
    const failed = orders.filter((o) => o.status === "failed").length;
    return { total: orders.length, submitted, pending, failed };
  }, [orders]);

  return (
    <div className="flex flex-col gap-7">
      <section className="hero-panel p-7 relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-2">
          <span className="eyebrow">Command deck</span>
          <h1 className="display text-3xl font-semibold tracking-tight">Mass order cockpit</h1>
          <p className="text-sm text-[#9aa3c7] max-w-2xl">
            Paste one link or a whole stack, choose platform and tier, then let the panel routing run quietly in the background.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-4">
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

      <form onSubmit={submitOrder} className="panel p-6 flex flex-col gap-5">
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
          <label className="field-label">Platform</label>
          <div className="grid grid-cols-4 gap-2">
            {PLATFORMS.map((p) => {
              const meta = PLATFORM_META[p];
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`platform-pill ${platform === p ? "active" : ""}`}
                >
                  <Icon size={15} style={{ color: meta.color }} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Tier</label>
            <select className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="priority">priority</option>
              <option value="regular">regular</option>
            </select>
          </div>
          {tier === "priority" && (
            <div>
              <label className="field-label">
                Comment pool <span className="text-[#565a6e]">(required only when comments are enabled)</span>
              </label>
              <select
                className="input"
                value={commentPoolId}
                onChange={(e) => setCommentPoolId(e.target.value)}
              >
                <option value="">No pool selected</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unused_count} left)
                  </option>
                ))}
              </select>
            </div>
          )}
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

      <div className="panel p-6">
        <div className="text-sm font-semibold mb-4">Recent orders</div>
        <div className="flex flex-col gap-2">
          {orders.length === 0 && <div className="empty-state">No orders yet. The launchpad is quiet.</div>}
          {orders.map((o) => {
            const meta = PLATFORM_META[o.platform as PlatformKey];
            const Icon = meta?.icon;
            return (
              <div key={o.id} className="panel-alt p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {Icon && (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10"
                        style={{ background: meta.bg }}
                      >
                        <Icon size={14} style={{ color: meta.color }} />
                      </div>
                    )}
                    <TierBadge tier={o.tier} />
                    <StatusBadge status={o.status} />
                  </div>
                  <span className="mono text-xs text-[#64708f]">
                    {new Date(o.created_at).toLocaleString()}
                  </span>
                </div>
                <a
                  href={o.link}
                  target="_blank"
                  className="text-sm text-[#f5f6fa] hover:text-[#a78bfa] flex items-center gap-1.5 break-all"
                >
                  {o.link}
                  <ExternalLink size={12} className="shrink-0 text-[#64708f]" />
                </a>
                <div className="flex flex-wrap gap-2">
                  {o.services_ordered.map((s, i) => (
                    <span key={i} className={`badge ${s.error ? "badge-err" : "badge-ok"}`} title={s.error}>
                      {s.error && <AlertTriangle size={11} />}
                      {s.service_type}: {s.quantity}
                      {s.provider_name ? ` · ${s.provider_name}` : ""}
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
