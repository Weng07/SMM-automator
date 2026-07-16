"use client";

import { useEffect, useState } from "react";

type Pool = {
  id: string;
  name: string;
  platform?: string;
  category?: string | null;
  unused_count: number;
};

type Account = {
  id: string;
  handle: string;
  tier: string;
  poll_interval_minutes: number;
  active: boolean;
  last_seen_tweet_id: string | null;
  comment_pools?: { name: string } | null;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [handle, setHandle] = useState("");
  const [tier, setTier] = useState("priority");
  const [commentPoolId, setCommentPoolId] = useState("");
  const [xCommentCategory, setXCommentCategory] = useState("");

  async function load() {
    const [a, p] = await Promise.all([
      fetch("/api/watched-accounts").then((r) => r.json()),
      fetch("/api/comments/upload").then((r) => r.json()),
    ]);
    setAccounts(a.accounts ?? []);
    setPools(p.pools ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    const selectedTier = tier;

    await fetch("/api/watched-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        tier: selectedTier,
        comment_pool_id: selectedTier === "priority" ? commentPoolId || null : null,
      }),
    });
    setHandle("");
    setXCommentCategory("");
    load();
  }

  const visiblePools = pools.filter((pool) => {
    if (pool.platform && pool.platform !== "x") {
      return false;
    }

    if (
      xCommentCategory &&
      !(pool.category ?? "").toLowerCase().includes(xCommentCategory.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  async function toggleActive(acc: Account) {
    await fetch("/api/watched-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: acc.id, active: !acc.active }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/watched-accounts?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">X Accounts</h1>
        <p className="text-sm text-[#8b929c] mt-1">
          Only X supports full auto-detection. A cron job polls each account below and
          orders automatically the moment a new post appears.
        </p>
      </div>

      <form onSubmit={addAccount} className="panel p-5 flex flex-col gap-4">
        <div className="text-sm font-medium">Watch a new account</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">Handle</label>
            <input
              className="input"
              placeholder="username (no @)"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">Tier</label>
            <select
              className="input"
              value={tier}
              onChange={(e) => {
                const nextTier = e.target.value;
                setTier(nextTier);

                if (nextTier !== "priority") {
                  setCommentPoolId("");
                  setXCommentCategory("");
                }
              }}
            >
              <option value="priority">priority</option>
              <option value="regular">regular</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">X comment category filter</label>
            <input
              className="input"
              placeholder="Optional keyword/category"
              value={xCommentCategory}
              onChange={(e) => setXCommentCategory(e.target.value)}
              disabled={tier !== "priority"}
            />
          </div>
          <div>
            <label className="text-xs text-[#8b929c] block mb-1">Comment pool</label>
            <select
              className="input"
              value={commentPoolId}
              onChange={(e) => setCommentPoolId(e.target.value)}
              disabled={tier !== "priority"}
            >
              <option value="">— none —</option>
              {visiblePools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.category ? ` [${p.category}]` : ""} ({p.unused_count} left)
                </option>
              ))}
            </select>
            {tier !== "priority" && (
              <div className="text-[11px] text-[#8b929c] mt-1">
                Comments are only used in priority mode.
              </div>
            )}
          </div>
        </div>
        <div>
          <button className="btn" type="submit">
            Add account
          </button>
        </div>
      </form>

      <div className="panel p-5">
        <div className="text-sm font-medium mb-4">Watched accounts</div>
        <div className="flex flex-col gap-2">
          {accounts.length === 0 && (
            <div className="text-sm text-[#8b929c]">No accounts yet.</div>
          )}
          {accounts.map((a) => (
            <div
              key={a.id}
              className="border border-[#23272e] rounded-md p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">@{a.handle}</span>
                <span className={`badge ${a.tier === "priority" ? "badge-priority" : "badge-regular"}`}>
                  {a.tier}
                </span>
                <span className="mono text-xs text-[#8b929c]">
                  {a.comment_pools?.name ?? "no comment pool"}
                </span>
                <span className="mono text-xs text-[#8b929c]">
                  last seen: {a.last_seen_tweet_id ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary" onClick={() => toggleActive(a)}>
                  {a.active ? "Pause" : "Resume"}
                </button>
                <button className="btn-secondary" onClick={() => remove(a.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
