"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/services", label: "Services" },
  { href: "/accounts", label: "X Accounts" },
  { href: "/comments", label: "Comment Pools" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-[#23272e] p-6 shrink-0">
      <div className="mono text-sm text-[#8b929c] mb-8 tracking-wide">
        SMM AUTOMATOR
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2 rounded-md text-sm ${
                active
                  ? "bg-[#14171c] text-[#f2f3f5] font-medium"
                  : "text-[#8b929c] hover:text-[#f2f3f5]"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
