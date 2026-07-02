import { NextRequest, NextResponse } from "next/server";
import { fetchBalance } from "@/lib/smm-panel";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId");
    const balance = await fetchBalance(providerId);
    return NextResponse.json(balance);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to fetch balance." }, { status: 500 });
  }
}
