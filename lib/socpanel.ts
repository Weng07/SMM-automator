/**
 * SocPanel API client.
 *
 * SocPanel uses the near-universal "SMM panel API" format shared by most
 * panels (JAP, PerfectPanel-based panels, etc.): a single POST endpoint,
 * an API key, and an `action` field.
 *
 * NOTE: SocPanel's exact field names should be double-checked against your
 * own panel's API page (usually under Account → API in your SocPanel
 * dashboard) before going live — panel-to-panel there can be small
 * differences (e.g. `key` vs `api_key`). This client uses the common
 * defaults; adjust the field names in `buildBody` below if your panel's
 * docs differ.
 */

import { supabaseAdmin } from "./supabase";

const DEFAULT_API_URL = "https://socpanel.com/api/v2";

export type SocPanelService = {
  service: string; // service ID
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill?: boolean;
  cancel?: boolean;
};

export type SocPanelOrderResult = {
  order?: string | number;
  error?: string;
};

async function getCredentials() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("app_settings")
    .select("socpanel_api_key, socpanel_api_url")
    .eq("id", 1)
    .single();

  if (error || !data?.socpanel_api_key) {
    throw new Error(
      "SocPanel API key is not configured. Add it in Settings first."
    );
  }

  return {
    apiKey: data.socpanel_api_key as string,
    apiUrl: (data.socpanel_api_url as string) || DEFAULT_API_URL,
  };
}

async function callApi(body: Record<string, string | number>) {
  const { apiKey, apiUrl } = await getCredentials();

  const form = new URLSearchParams();
  form.set("key", apiKey);
  for (const [k, v] of Object.entries(body)) {
    form.set(k, String(v));
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    throw new Error(`SocPanel API HTTP error: ${res.status}`);
  }

  return res.json();
}

/** Fetch the full service catalog from SocPanel. */
export async function fetchServices(): Promise<SocPanelService[]> {
  const data = await callApi({ action: "services" });
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response fetching SocPanel services.");
  }
  return data as SocPanelService[];
}

/** Fetch account balance. */
export async function fetchBalance(): Promise<{ balance: string; currency: string }> {
  const data = await callApi({ action: "balance" });
  return data;
}

/** Place a single order. `comments` is a newline-separated string, required only for custom-comment services. */
export async function placeOrder(params: {
  serviceId: string;
  link: string;
  quantity: number;
  comments?: string;
}): Promise<SocPanelOrderResult> {
  const body: Record<string, string | number> = {
    action: "add",
    service: params.serviceId,
    link: params.link,
    quantity: params.quantity,
  };
  if (params.comments) {
    body.comments = params.comments;
  }
  const data = await callApi(body);
  return data;
}

/** Check status of a previously placed order. */
export async function fetchOrderStatus(orderId: string) {
  return callApi({ action: "status", order: orderId });
}
