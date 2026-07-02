import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseAdmin();

  const [
    totalResult,
    submittedResult,
    pendingResult,
    failedResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  if (totalResult.error) {
    return NextResponse.json(
      { error: totalResult.error.message },
      { status: 500 }
    );
  }

  if (submittedResult.error) {
    return NextResponse.json(
      { error: submittedResult.error.message },
      { status: 500 }
    );
  }

  if (pendingResult.error) {
    return NextResponse.json(
      { error: pendingResult.error.message },
      { status: 500 }
    );
  }

  if (failedResult.error) {
    return NextResponse.json(
      { error: failedResult.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    totalOrders: totalResult.count ?? 0,
    submittedOrders: submittedResult.count ?? 0,
    pendingOrders: pendingResult.count ?? 0,
    failedOrders: failedResult.count ?? 0,
  });
}