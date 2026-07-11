import { NextResponse } from "next/server";
import { fetchServices } from "@/lib/socpanel";

export async function GET() {
  try {
    const services = await fetchServices();
    return NextResponse.json({ services });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch services." },
      { status: 500 }
    );
  }
}
