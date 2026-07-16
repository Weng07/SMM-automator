import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function normalizeSlotsForGroup(params: {
  platform: string;
  serviceType: string;
}) {
  const supabase = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: rows, error: rowsError } = await supabase
    .from("service_presets")
    .select("id, slot_index, created_at")
    .eq("platform", params.platform)
    .eq("service_type", params.serviceType)
    .order("slot_index", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (rowsError) {
    return rowsError.message;
  }

  const ordered = rows ?? [];
  const needsNormalization = ordered.some(
    (row, index) => Number(row.slot_index) !== index + 1
  );

  if (!needsNormalization) {
    return null;
  }

  const maxSlot = ordered.reduce(
    (max, row) => Math.max(max, Number(row.slot_index) || 0),
    0
  );
  const tempBase = maxSlot + ordered.length + 1000;

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    const { error: tempError } = await supabase
      .from("service_presets")
      .update({
        slot_index: tempBase + index + 1,
        updated_at: nowIso,
      })
      .eq("id", row.id);

    if (tempError) {
      return tempError.message;
    }
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    const { error: finalError } = await supabase
      .from("service_presets")
      .update({
        slot_index: index + 1,
        updated_at: nowIso,
      })
      .eq("id", row.id);

    if (finalError) {
      return finalError.message;
    }
  }

  return null;
}

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("service_presets")
    .select("*, api_providers(id, name)")
    .order("platform", { ascending: true })
    .order("service_type", { ascending: true })
    .order("slot_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    platform,
    service_type,
    slot_index,
    api_provider_id,
    panel_service_id,
    quantity,
    enabled,
    keywords,
    comment_categories,
  } = body;

  if (!platform || !service_type) {
    return NextResponse.json(
      { error: "platform and service_type are required." },
      { status: 400 }
    );
  }

  const normalizedSlot = Number.isInteger(Number(slot_index))
    ? Math.max(1, Number(slot_index))
    : 1;

  const keywordSource = Array.isArray(keywords) ? keywords : comment_categories;
  const serviceId = panel_service_id ?? null;
  const normalizedKeywords = Array.isArray(keywordSource)
    ? [...new Set(keywordSource
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean))]
    : [];

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("service_presets")
    .upsert(
      {
        platform,
        tier: "regular",
        service_type,
        slot_index: normalizedSlot,
        api_provider_id: api_provider_id || null,
        panel_service_id: serviceId,
        quantity: quantity ?? 0,
        comment_categories: normalizedKeywords,
        keywords: normalizedKeywords,
        enabled: enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,service_type,slot_index" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalizeError = await normalizeSlotsForGroup({
    platform,
    serviceType: service_type,
  });
  if (normalizeError) {
    return NextResponse.json({ error: normalizeError }, { status: 500 });
  }

  return NextResponse.json({ preset: data });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: preset, error: findError } = await supabase
    .from("service_presets")
    .select("id, platform, service_type")
    .eq("id", id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!preset) return NextResponse.json({ error: "Preset not found." }, { status: 404 });

  const { error: deleteError } = await supabase
    .from("service_presets")
    .delete()
    .eq("id", id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const normalizeError = await normalizeSlotsForGroup({
    platform: preset.platform,
    serviceType: preset.service_type,
  });
  if (normalizeError) {
    return NextResponse.json({ error: normalizeError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const platform = typeof body.platform === "string" ? body.platform : "";
  const serviceTypeFilter =
    typeof body.service_type === "string" && body.service_type.trim()
      ? body.service_type.trim()
      : null;

  if (!platform) {
    return NextResponse.json({ error: "platform is required." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: rows, error: rowsError } = await supabase
    .from("service_presets")
    .select("service_type")
    .eq("platform", platform);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const allTypes = [...new Set((rows ?? []).map((row) => String(row.service_type)))];
  const serviceTypes = serviceTypeFilter
    ? allTypes.filter((item) => item === serviceTypeFilter)
    : allTypes;

  for (const serviceType of serviceTypes) {
    const normalizeError = await normalizeSlotsForGroup({
      platform,
      serviceType,
    });

    if (normalizeError) {
      return NextResponse.json({ error: normalizeError }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, normalized: serviceTypes.length });
}
