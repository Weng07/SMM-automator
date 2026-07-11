"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  LayoutGrid,
  ListChecks,
  Menu,
  MessagesSquare,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";

const links = [
  { href: "/", label: "Mass Orders", icon: LayoutGrid },
  { href: "/services", label: "Service Map", icon: ListChecks },
  { href: "/comments", label: "Comment Pools", icon: MessagesSquare },
  { href: "/settings", label: "API Providers", icon: SlidersHorizontal },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<{ balance: string; currency: string } | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    void fetch("/api/panel/balance")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setBalanceError(true);
        else setBalance(d);
      })
      .catch(() => setBalanceError(true));
  }, []);


  return (
    <>
      <header className="top-shell sticky top-0 z-40 mx-auto mt-3 flex w-[calc(100%-24px)] max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image src="/logo.svg" alt="Panelist logo" width={40} height={40} className="h-10 w-10 rounded-app object-contain" />
          <div className="min-w-0">
            <span className="display block truncate text-[17px] font-semibold tracking-tight">Panelist</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex">
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link key={l.href} href={l.href} className={`nav-pill ${active ? "active" : ""}`}>
                <Icon size={15} strokeWidth={2.2} />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="balance-chip hidden sm:flex">
            <Wallet size={15} />
            {balanceError ? (
              <span>Not connected</span>
            ) : balance ? (
              <span className="mono">{balance.balance} {balance.currency}</span>
            ) : (
              <span>Loading...</span>
            )}
          </div>
          <button type="button" className="hamburger-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
        </div>
      </header>

      {open && <button className="drawer-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside className={`drawer-panel ${open ? "open" : ""}`}>
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Panelist logo" width={40} height={40} className="h-10 w-10 rounded-app object-contain" />
            <span className="display text-lg font-semibold">Panelist</span>
          </div>
          <button type="button" className="hamburger-btn" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`drawer-link ${active ? "active" : ""}`}>
                <Icon size={17} strokeWidth={2.2} />
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="mx-4 mt-auto mb-4 panel-alt px-3 py-3">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-[#64708f] mono">Default balance</span>
          {balanceError ? (
            <span className="text-xs text-[#8b96bd]">Not connected</span>
          ) : balance ? (
            <span className="mono text-sm font-medium">{balance.balance} {balance.currency}</span>
          ) : (
            <span className="text-xs text-[#64708f]">Loading...</span>
          )}
        </div>
      </aside>
    </>
  );
}
