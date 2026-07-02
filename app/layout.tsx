import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Panelist",
  description: "Automate SMM panel orders from your social posts",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <Sidebar />
          <main className="mx-auto w-full max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
