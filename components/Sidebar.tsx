"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, ListChecks, MessagesSquare, SlidersHorizontal, Zap } from "lucide-react";

const links = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/services", label: "Services", icon: ListChecks },
  { href: "/comments", label: "Comment Pools", icon: MessagesSquare },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<{ balance: string; currency: string } | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    fetch("/api/socpanel/balance")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setBalanceError(true);
        else setBalance(d);
      })
      .catch(() => setBalanceError(true));
  }, []);

  return (
    <aside className="w-60 border-r border-[#262837] p-5 shrink-0 flex flex-col">
      <div className="flex items-center gap-2 mb-8 px-1">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c6cf0] to-[#a78bfa] flex items-center justify-center">
          <Zap size={15} strokeWidth={2.5} className="text-white" />
        </div>
        <span className="display font-semibold text-[15px] tracking-tight">Panelist</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {links.map((l) => {
          const active = pathname === l.href;
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-[#7c6cf0]/12 text-[#f5f6fa] font-medium"
                  : "text-[#8b8fa3] hover:text-[#f5f6fa] hover:bg-[#14151f]"
              }`}
              style={active ? { boxShadow: "inset 2px 0 0 #7c6cf0" } : undefined}
            >
              <Icon size={16} strokeWidth={2} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="panel-alt px-3 py-3 flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-[#565a6e] mono">
          SocPanel balance
        </span>
        {balanceError ? (
          <span className="text-xs text-[#8b8fa3]">Not connected</span>
        ) : balance ? (
          <span className="mono text-sm font-medium">
            {balance.balance} {balance.currency}
          </span>
        ) : (
          <span className="text-xs text-[#565a6e]">Loading…</span>
        )}
      </div>
    </aside>
  );
}
