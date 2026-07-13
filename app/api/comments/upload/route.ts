import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabase";
import { isXCommentCategory } from "@/lib/comment-categories";

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

function normalizeCommentLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
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

    const comments = await extractCommentsFromFile(file);

    if (comments.length === 0) {
      return NextResponse.json({ error: "No comments found in file." }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    let pool: { id: string } | null = null;

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
