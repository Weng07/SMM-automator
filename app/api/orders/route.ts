import { after, NextRequest, NextResponse } from "next/server";
import { submitBatchOrders, submitOrderForLink } from "@/lib/place-order";

type Platform = "x" | "instagram" | "tiktok" | "linkedin" | "youtube";

const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

function detectPlatformFromLink(link: string): Platform | null {
  const cleanLink = link.trim().toLowerCase();

  try {
    const url = new URL(cleanLink);
    const host = url.hostname.replace(/^www\./, "");

    if (
      host === "x.com" ||
      host === "twitter.com" ||
      host.endsWith(".x.com") ||
      host.endsWith(".twitter.com")
    ) {
      return "x";
    }

    if (
      host === "instagram.com" ||
      host.endsWith(".instagram.com")
    ) {
      return "instagram";
    }

    if (
      host === "tiktok.com" ||
      host === "vt.tiktok.com" ||
      host === "vm.tiktok.com" ||
      host.endsWith(".tiktok.com")
    ) {
      return "tiktok";
    }

    if (
      host === "linkedin.com" ||
      host.endsWith(".linkedin.com")
    ) {
      return "linkedin";
    }

    if (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "m.youtube.com" ||
      host.endsWith(".youtube.com")
    ) {
      return "youtube";
    }

    return null;
  } catch {
    if (cleanLink.includes("x.com/") || cleanLink.includes("twitter.com/")) {
      return "x";
    }

    if (cleanLink.includes("instagram.com/")) {
      return "instagram";
    }

    if (cleanLink.includes("tiktok.com/")) {
      return "tiktok";
    }

    if (cleanLink.includes("linkedin.com/")) {
      return "linkedin";
    }

    if (
      cleanLink.includes("youtube.com/") ||
      cleanLink.includes("youtu.be/")
    ) {
      return "youtube";
    }

    return null;
  }
}

function validateLinksForPlatform(platform: Platform, links: string[]) {
  for (const link of links) {
    const detectedPlatform = detectPlatformFromLink(link);

    if (!detectedPlatform) {
      return {
        ok: false,
        error:
          "One of the links does not look like a supported social media URL. Please check the link and try again.",
        link,
      };
    }

    if (detectedPlatform !== platform) {
      return {
        ok: false,
        error: `This looks like a ${PLATFORM_LABELS[detectedPlatform]} link, but you selected ${PLATFORM_LABELS[platform]}. Please switch to ${PLATFORM_LABELS[detectedPlatform]} before submitting.`,
        link,
        detectedPlatform,
        selectedPlatform: platform,
      };
    }
  }

  return { ok: true };
}

export async function GET(req: NextRequest) {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "50");

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, tier, link, links, commentPoolId } = body;

    const batchLinks = Array.isArray(links)
      ? links
          .map((item) => String(item).trim())
          .filter(Boolean)
      : typeof link === "string"
        ? link
            .split(/\r?\n|,/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    if (!platform || !tier || batchLinks.length === 0) {
      return NextResponse.json(
        { error: "platform, tier, and at least one link are required." },
        { status: 400 }
      );
    }

    const allowedPlatforms: Platform[] = [
      "x",
      "instagram",
      "tiktok",
      "linkedin",
      "youtube",
    ];

    if (!allowedPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: "Unsupported platform selected." },
        { status: 400 }
      );
    }

    const validation = validateLinksForPlatform(platform, batchLinks);

    if (!validation.ok) {
      return NextResponse.json(validation, { status: 400 });
    }

    after(async () => {
      try {
        if (batchLinks.length === 1) {
          await submitOrderForLink({
            platform,
            tier,
            link: batchLinks[0],
            commentPoolId: commentPoolId ?? null,
          });

          return;
        }

        await submitBatchOrders({
          platform,
          tier,
          links: batchLinks,
          commentPoolId: commentPoolId ?? null,
        });
      } catch (error) {
        console.error("Background order submission failed:", error);
      }
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      count: batchLinks.length,
      message: "Order submitted. Processing in background.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to submit order." },
      { status: 500 }
    );
  }
}