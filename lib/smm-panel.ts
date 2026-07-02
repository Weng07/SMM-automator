import { supabaseAdmin } from "./supabase";

const DEFAULT_API_URL = "https://socpanel.com/api/v2";

export type ApiProvider = {
  id: string;
  name: string;
  api_url: string;
  api_key?: string;
  is_active: boolean;
};

export type PanelService = {
  service: string;
  name: string;
  type?: string;
  category?: string;
  rate?: string;
  min?: string;
  max?: string;
  refill?: boolean;
  cancel?: boolean;
};

export type PanelOrderResult = {
  order?: string | number;
  error?: string;
};

async function getProvider(providerId?: string | null) {
  const supabase = supabaseAdmin();

  if (providerId) {
    const { data, error } = await supabase
      .from("api_providers")
      .select("*")
      .eq("id", providerId)
      .single();

    if (error || !data) throw new Error("Selected API provider could not be found.");
    if (!data.api_key) throw new Error(`${data.name} API key is not configured.`);

    return {
      id: data.id as string,
      name: data.name as string,
      apiKey: data.api_key as string,
      apiUrl: (data.api_url as string) || DEFAULT_API_URL,
    };
  }

  const { data: provider } = await supabase
    .from("api_providers")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (provider?.api_key) {
    return {
      id: provider.id as string,
      name: provider.name as string,
      apiKey: provider.api_key as string,
      apiUrl: (provider.api_url as string) || DEFAULT_API_URL,
    };
  }

  // Backwards compatible fallback for old installs that only have app_settings.
  const { data, error } = await supabase
    .from("app_settings")
    .select("socpanel_api_key, socpanel_api_url")
    .eq("id", 1)
    .single();

  if (error || !data?.socpanel_api_key) {
    throw new Error("No API provider is configured. Add one in Settings first.");
  }

  return {
    id: null,
    name: "SocPanel",
    apiKey: data.socpanel_api_key as string,
    apiUrl: (data.socpanel_api_url as string) || DEFAULT_API_URL,
  };
}

async function callPanelApi(body: Record<string, string | number>, providerId?: string | null) {
  const provider = await getProvider(providerId);

  const form = new URLSearchParams();
  form.set("key", provider.apiKey);
  for (const [k, v] of Object.entries(body)) {
    form.set(k, String(v));
  }

  const res = await fetch(provider.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    throw new Error(`${provider.name} API HTTP error: ${res.status}`);
  }

  return res.json();
}

export async function fetchProviders() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("api_providers")
    .select("id, name, api_url, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchServices(providerId?: string | null): Promise<PanelService[]> {
  const data = await callPanelApi({ action: "services" }, providerId);
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response fetching provider services.");
  }
  return data as PanelService[];
}

export async function fetchBalance(providerId?: string | null): Promise<{ balance: string; currency: string }> {
  return callPanelApi({ action: "balance" }, providerId);
}

export async function placePanelOrder(params: {
  providerId?: string | null;
  serviceId: string;
  link: string;
  quantity: number;
  comments?: string;
}): Promise<PanelOrderResult> {
  const body: Record<string, string | number> = {
    action: "add",
    service: params.serviceId,
    link: params.link,
    quantity: params.quantity,
  };

  if (params.comments) body.comments = params.comments;

  return callPanelApi(body, params.providerId);
}

export async function fetchOrderStatus(orderId: string, providerId?: string | null) {
  return callPanelApi({ action: "status", order: orderId }, providerId);
}
