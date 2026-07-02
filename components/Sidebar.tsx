"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, ListChecks, MessagesSquare, SlidersHorizontal, Sparkles } from "lucide-react";

const links = [
  { href: "/", label: "Mass Orders", icon: LayoutGrid },
  { href: "/services", label: "Service Map", icon: ListChecks },
  { href: "/comments", label: "Comment Pools", icon: MessagesSquare },
  { href: "/settings", label: "API Providers", icon: SlidersHorizontal },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<{ balance: string; currency: string } | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    fetch("/api/panel/balance")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setBalanceError(true);
        else setBalance(d);
      })
      .catch(() => setBalanceError(true));
  }, []);

  return (
    <aside className="w-64 border-r border-white/10 p-5 shrink-0 flex flex-col sidebar-shell">
      <div className="flex items-center gap-3 mb-8 px-1">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#22d3ee] via-[#7c6cf0] to-[#a78bfa] flex items-center justify-center shadow-[0_0_30px_rgba(124,108,240,.35)]">
          <Sparkles size={17} strokeWidth={2.5} className="text-white" />
        </div>
        <div>
          <span className="display font-semibold text-[16px] tracking-tight block">Panelist</span>
          <span className="text-[10px] uppercase tracking-[0.24em] text-[#64708f]">SMM cockpit</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {links.map((l) => {
          const active = pathname === l.href;
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? "bg-white/8 text-[#f5f6fa] font-medium border border-white/10"
                  : "text-[#8b96bd] hover:text-[#f5f6fa] hover:bg-white/5 border border-transparent"
              }`}
            >
              <Icon size={16} strokeWidth={2} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="panel-alt px-3 py-3 flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-[#64708f] mono">
          Default balance
        </span>
        {balanceError ? (
          <span className="text-xs text-[#8b96bd]">Not connected</span>
        ) : balance ? (
          <span className="mono text-sm font-medium">
            {balance.balance} {balance.currency}
          </span>
        ) : (
          <span className="text-xs text-[#64708f]">Loading...</span>
        )}
      </div>
    </aside>
  );
}
