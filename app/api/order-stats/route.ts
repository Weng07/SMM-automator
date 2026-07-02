import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseAdmin();

  const { count: totalOrders, error: totalError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true });

  if (totalError) {
    return NextResponse.json({ error: totalError.message }, { status: 500 });
  }

  const { count: submittedOrders, error: submittedError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");

  if (submittedError) {
    return NextResponse.json({ error: submittedError.message }, { status: 500 });
  }

  const { count: pendingOrders, error: pendingError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const { count: failedOrders, error: failedError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed");

  if (failedError) {
    return NextResponse.json({ error: failedError.message }, { status: 500 });
  }

  return NextResponse.json({
    totalOrders: totalOrders ?? 0,
    submittedOrders: submittedOrders ?? 0,
    pendingOrders: pendingOrders ?? 0,
    failedOrders: failedOrders ?? 0,
  });
}