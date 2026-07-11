import { NextRequest, NextResponse } from "next/server";
import { fetchServices } from "@/lib/smm-panel";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId");
    const services = await fetchServices(providerId);
    return NextResponse.json({ services });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch services." }, { status: 500 });
  }
}
