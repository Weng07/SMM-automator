import { NextResponse } from "next/server";
import { fetchBalance } from "@/lib/socpanel";

export async function GET() {
  try {
    const balance = await fetchBalance();
    return NextResponse.json(balance);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch balance." },
      { status: 500 }
    );
  }
}
