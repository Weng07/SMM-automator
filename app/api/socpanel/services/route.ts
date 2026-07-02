import { NextResponse } from "next/server";
import { fetchServices } from "@/lib/socpanel";

export async function GET() {
  try {
    const services = await fetchServices();
    return NextResponse.json({ services });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch services." },
      { status: 500 }
    );
  }
}
