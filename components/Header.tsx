"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/", label: "New Order" },
  { href: "/orders", label: "Orders" },
  { href: "/services", label: "Services" },
  { href: "/providers", label: "API Providers" },
  { href: "/comments", label: "Comments" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="app-brand">
          <img src="/logo.svg" alt="Panelist" className="app-logo" />
          <span>Panelist</span>
        </Link>

        <nav className="app-nav">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="app-menu-button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open menu"
        >
          ☰
        </button>
      </div>

      {open && (
        <nav className="app-mobile-nav">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}