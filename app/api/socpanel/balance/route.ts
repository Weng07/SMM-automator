import { NextResponse } from "next/server";
import { fetchBalance } from "@/lib/socpanel";

export async function GET() {
  try {
    const balance = await fetchBalance();
    return NextResponse.json(balance);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch balance." },
      { status: 500 }
    );
  }
}
