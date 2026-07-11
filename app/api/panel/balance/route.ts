import { NextRequest, NextResponse } from "next/server";
import { fetchBalance } from "@/lib/smm-panel";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId");
    const balance = await fetchBalance(providerId);
    return NextResponse.json(balance);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch balance." }, { status: 500 });
  }
}
