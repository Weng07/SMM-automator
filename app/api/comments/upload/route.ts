import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { supabaseAdmin } from "@/lib/supabase";
import { isXCommentCategory } from "@/lib/comment-categories";

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");

  let query = supabase
    .from("comment_pools")
    .select("id, name, platform, category, created_at")
    .order("created_at", { ascending: false });

  if (platform) query = query.eq("platform", platform);

  const { data: pools, error } = await query;

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
    const platform = formData.get("platform") as string | null;
    const categoryRaw = (formData.get("category") as string | null)?.trim().toLowerCase() ?? "";
    const category = categoryRaw || null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: "platform is required." }, { status: 400 });
    }

    if (platform === "x" && (!category || !isXCommentCategory(category))) {
      return NextResponse.json(
        { error: "X comment category is required and must be litho, thanos, or ignite." },
        { status: 400 }
      );
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
      .insert({ name, platform, category: platform === "x" ? category : null })
      .select()
      .single();

    if (poolErr) throw poolErr;

    const rows = comments.map((comment) => ({ pool_id: pool.id, comment }));
    const { error: itemsErr } = await supabase.from("comment_pool_items").insert(rows);
    if (itemsErr) throw itemsErr;

    return NextResponse.json({ pool, count: comments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload comments." },
      { status: 500 }
    );
  }
}
