import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data: pools, error } = await supabase
    .from("comment_pools")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // attach unused counts
  const withCounts = await Promise.all(
    (pools ?? []).map(async (p) => {
      const { count } = await supabase
        .from("comment_pool_items")
        .select("id", { count: "exact", head: true })
        .eq("pool_id", p.id)
        .eq("used", false);
      return { ...p, unused_count: count ?? 0 };
    })
  );

  return NextResponse.json({ pools: withCounts });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string) || "Untitled pool";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });

    // Accept either a single column of comments, or take the first column
    // if the CSV has multiple columns.
    const comments = parsed.data
      .map((row) => (Array.isArray(row) ? row[0] : String(row)))
      .map((c) => c?.trim())
      .filter((c): c is string => !!c);

    if (comments.length === 0) {
      return NextResponse.json({ error: "No comments found in file." }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data: pool, error: poolErr } = await supabase
      .from("comment_pools")
      .insert({ name })
      .select()
      .single();

    if (poolErr) throw poolErr;

    const rows = comments.map((comment) => ({ pool_id: pool.id, comment }));
    const { error: itemsErr } = await supabase.from("comment_pool_items").insert(rows);
    if (itemsErr) throw itemsErr;

    return NextResponse.json({ pool, count: comments.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to upload comments." },
      { status: 500 }
    );
  }
}
