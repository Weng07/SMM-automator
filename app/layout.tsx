import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "SMM Order Automator",
  description: "Automate SMM panel orders from your social posts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-8 max-w-[1500px] mx-auto w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
