import { LucideIcon, X, Camera, Music2, Share2 } from "lucide-react";

export type PlatformKey = "x" | "instagram" | "tiktok" | "linkedin";

export const PLATFORM_META: Record<
  PlatformKey,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  x: { label: "X", icon: X, color: "#e7e9ee", bg: "rgba(231,233,238,0.1)" },
  instagram: { label: "Instagram", icon: Camera, color: "#e1306c", bg: "rgba(225,48,108,0.12)" },
  tiktok: { label: "TikTok", icon: Music2, color: "#25f4ee", bg: "rgba(37,244,238,0.12)" },
  linkedin: { label: "LinkedIn", icon: Share2, color: "#0a66c2", bg: "rgba(10,102,194,0.14)" },
};

export const PLATFORMS: PlatformKey[] = ["x", "instagram", "tiktok", "linkedin"];
