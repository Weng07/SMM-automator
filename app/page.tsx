"use client";

import { useEffect, useState } from "react";

type Order = {
  id: string;
  platform: string;
  tier: string;
  link: string;
  source: string;
  status: string;
  services_ordered: { service_type: string; quantity: number; error?: string }[];
  created_at: string;
};

type Pool = { id: string; name: string; unused_count: number };

const PLATFORMS = ["x", "instagram", "tiktok", "linkedin"];

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

  const [platform, setPlatform] = useState("instagram");
  const [tier, setTier] = useState("regular");
  const [link, setLink] = useState("");
  const [commentPoolId, setCommentPoolId] = useState("");

  async function loadOrders() {
    const res = await fetch("/api/orders?limit=25");
    const data = await res.json();
    setOrders(data.orders ?? []);
  }

  async function loadPools() {
    const res = await fetch("/api/comments/upload");
    const data = await res.json();
    setPools(data.pools ?? []);
  }

  useEffect(() => {
    loadOrders();
    loadPools();
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
          platform,
          tier,
          link,
          commentPoolId: commentPoolId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(data.hasError ? "Submitted with some errors — check the table below." : "Order submitted.");
      setLink("");
      loadOrders();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-[#8b929c] mt-1">
          X posts from your watched priority account are ordered automatically. Paste links here for
          Instagram, TikTok, and LinkedIn.
        </p>
      </div>

      <form onSubmit={submitOrder} className="panel p-5 flex flex-col gap-4">
        <div className="text-sm font-medium">Submit a manual order</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">Platform</label>
            <select
              className="input"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">Tier</label>
            <select className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="priority">priority</option>
              <option value="regular">regular</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-[#8b929c] block mb-1">Post link</label>
          <input
            className="input"
            placeholder="https://..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
          />
        </div>
        {tier === "priority" && (
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">
              Comment pool (required if this tier includes custom comments)
            </label>
            <select
              className="input"
              value={commentPoolId}
              onChange={(e) => setCommentPoolId(e.target.value)}
            >
              <option value="">— none —</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unused_count} left)
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Submitting…" : "Submit order"}
          </button>
          {msg && <span className="text-sm text-[#8b929c]">{msg}</span>}
        </div>
      </form>

      <div className="panel p-5">
        <div className="text-sm font-medium mb-4">Recent orders</div>
        <div className="flex flex-col gap-2">
          {orders.length === 0 && (
            <div className="text-sm text-[#8b929c]">No orders yet.</div>
          )}
          {orders.map((o) => (
            <div
              key={o.id}
              className="border border-[#23272e] rounded-md p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="mono text-xs text-[#8b929c] uppercase">{o.platform}</span>
                  <TierBadge tier={o.tier} />
                  <StatusBadge status={o.status} />
                  <span className="mono text-xs text-[#8b929c]">{o.source}</span>
                </div>
                <span className="mono text-xs text-[#8b929c]">
                  {new Date(o.created_at).toLocaleString()}
                </span>
              </div>
              <a
                href={o.link}
                target="_blank"
                className="text-sm text-[#f2f3f5] underline break-all"
              >
                {o.link}
              </a>
              <div className="flex flex-wrap gap-2">
                {o.services_ordered.map((s, i) => (
                  <span
                    key={i}
                    className={`badge ${s.error ? "badge-err" : "badge-ok"}`}
                    title={s.error}
                  >
                    {s.service_type}: {s.quantity}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
