import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabase";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Failed to upload comments.";
}

function isMissingCategoryColumnError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("category") && message.includes("comment_pools");
}

function isMissingTableError(error: unknown, tableName: string) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes(tableName.toLowerCase()) &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}

function normalizeCommentLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function inferKeywordFromName(name: string, keywords: string[]) {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return null;

  // Prefer longer matches first so specific keywords win over short substrings.
  const ordered = [...new Set(keywords)]
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return ordered.find((keyword) => normalizedName.includes(keyword)) ?? null;
}

async function inferAutoCategoryForX(name: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("service_presets")
    .select("keywords, comment_categories")
    .eq("platform", "x")
    .eq("service_type", "comments")
    .eq("enabled", true)
    .order("slot_index", { ascending: true });

  if (error || !data) {
    return null;
  }

  const allKeywords = data.flatMap((preset) => {
    const source = Array.isArray(preset.keywords) && preset.keywords.length > 0
      ? preset.keywords
      : preset.comment_categories;

    return Array.isArray(source)
      ? source.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : [];
  });

  return inferKeywordFromName(name, allKeywords);
}

function extractCommentsFromCsvOrText(text: string) {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });

  const comments = parsed.data
    .map((row) => (Array.isArray(row) ? row[0] : String(row)))
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c));

  return comments;
}

function extractCommentsFromXlsx(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  return normalizeCommentLines(rows.map((row) => String(row?.[0] ?? "")));
}

async function extractCommentsFromDocxOrDoc(bytes: Uint8Array) {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return normalizeCommentLines(result.value.split(/\r?\n/));
  } catch {
    // Fallback for non-docx text-like document files.
    const text = Buffer.from(bytes).toString("utf-8");
    return normalizeCommentLines(text.split(/\r?\n/));
  }
}

async function extractCommentsFromFile(file: File) {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = Buffer.from(bytes).toString("utf-8");
    return extractCommentsFromCsvOrText(text);
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return extractCommentsFromXlsx(bytes);
  }

  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    return extractCommentsFromDocxOrDoc(bytes);
  }

  throw new Error("Unsupported file type. Use CSV, XLSX, XLS, DOCX, DOC, or TXT.");
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");

  let pools: Array<{ id: string; name: string; platform: string; category: string | null; created_at: string }> = [];
  {
    let query = supabase
      .from("comment_pools")
      .select("id, name, platform, category, created_at")
      .order("created_at", { ascending: false });

    if (platform) query = query.eq("platform", platform);

    const withCategory = await query;

    if (!withCategory.error) {
      pools = (withCategory.data ?? []) as Array<{
        id: string;
        name: string;
        platform: string;
        category: string | null;
        created_at: string;
      }>;
    } else if (isMissingCategoryColumnError(withCategory.error)) {
      let fallbackQuery = supabase
        .from("comment_pools")
        .select("id, name, platform, created_at")
        .order("created_at", { ascending: false });

      if (platform) fallbackQuery = fallbackQuery.eq("platform", platform);

      const fallback = await fallbackQuery;

      if (fallback.error) {
        return NextResponse.json({ error: getErrorMessage(fallback.error) }, { status: 500 });
      }

      pools = (fallback.data ?? []).map((pool) => ({ ...pool, category: null })) as Array<{
        id: string;
        name: string;
        platform: string;
        category: string | null;
        created_at: string;
      }>;
    } else {
      return NextResponse.json({ error: getErrorMessage(withCategory.error) }, { status: 500 });
    }
  }

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

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: "platform is required." }, { status: 400 });
    }

    const comments = await extractCommentsFromFile(file);

    if (comments.length === 0) {
      return NextResponse.json({ error: "No comments found in file." }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    let pool: { id: string } | null = null;
    const autoCategory = platform === "x" ? await inferAutoCategoryForX(name || file.name) : null;
    const category = categoryRaw || autoCategory || null;

    const withCategoryInsert = await supabase
      .from("comment_pools")
      .insert({ name, platform, category: platform === "x" ? category : null })
      .select()
      .single();

    if (!withCategoryInsert.error) {
      pool = withCategoryInsert.data as { id: string };
    } else if (isMissingCategoryColumnError(withCategoryInsert.error)) {
      const fallbackInsert = await supabase
        .from("comment_pools")
        .insert({ name, platform })
        .select()
        .single();

      if (fallbackInsert.error) {
        throw fallbackInsert.error;
      }

      pool = fallbackInsert.data as { id: string };
    } else {
      throw withCategoryInsert.error;
    }

    if (!pool?.id) {
      throw new Error("Failed to create comment pool.");
    }

    const rows = comments.map((comment) => ({ pool_id: pool.id, comment }));
    const { error: itemsErr } = await supabase.from("comment_pool_items").insert(rows);
    if (itemsErr) throw itemsErr;

    return NextResponse.json({ pool, count: comments.length });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Clear references first so pool deletion does not fail on FK constraints.
  const { error: watchedAccountsError } = await supabase
    .from("watched_x_accounts")
    .update({ comment_pool_id: null })
    .eq("comment_pool_id", id);

  if (watchedAccountsError && !isMissingTableError(watchedAccountsError, "watched_x_accounts")) {
    return NextResponse.json({ error: getErrorMessage(watchedAccountsError) }, { status: 500 });
  }

  const { error: ordersError } = await supabase
    .from("orders")
    .update({ comment_pool_id: null })
    .eq("comment_pool_id", id);

  if (ordersError && !isMissingTableError(ordersError, "orders")) {
    return NextResponse.json({ error: getErrorMessage(ordersError) }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("comment_pools")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: getErrorMessage(deleteError) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
