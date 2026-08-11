import { supabaseAdmin } from "./supabase";

type ProviderBalanceResult = {
  providerId: string;
  providerName: string;
  apiUrl: string;
  balance: number;
  currency: string;
  error?: string;
};

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringField(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) {
    return null;
  }

  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumberField(obj: Record<string, unknown> | null, key: string): number | null {
  if (!obj) {
    return null;
  }

  const value = obj[key];
  const parsed = parseBalanceValue(value);
  return parsed > 0 || value === 0 || value === "0" || value === "0.0" || value === "0.00"
    ? parsed
    : null;
}

function normalizePayload(payload: unknown): unknown {
  if (typeof payload !== "string") {
    return payload;
  }

  const trimmed = payload.trim();
  if (!trimmed) {
    return payload;
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return payload;
    }
  }

  return payload;
}

function parseProviderBalanceResponse(payload: unknown): {
  balance: number;
  currency: string;
  error?: string;
} {
  const normalizedPayload = normalizePayload(payload);

  if (typeof normalizedPayload === "number") {
    return {
      balance: normalizedPayload,
      currency: "USD",
    };
  }

  if (typeof normalizedPayload === "string") {
    const numericValue = parseBalanceValue(normalizedPayload);
    if (numericValue !== 0 || normalizedPayload.trim() === "0") {
      return {
        balance: numericValue,
        currency: "USD",
      };
    }
  }

  const root = getObject(normalizedPayload);
  const nestedData = getObject(root?.data);
  const nestedResult = getObject(root?.result);
  const nestedBalance = getObject(root?.balance);
  const nestedFunds = getObject(root?.funds);
  const candidates = [nestedData, nestedResult, nestedBalance, nestedFunds, root].filter(
    (item): item is Record<string, unknown> => Boolean(item)
  );

  if (!root || candidates.length === 0) {
    return {
      balance: 0,
      currency: "USD",
      error: "Unexpected balance response from provider.",
    };
  }

  const errorMessage = candidates
    .map((candidate) =>
      getStringField(candidate, "error") ??
      getStringField(candidate, "message") ??
      getStringField(candidate, "msg") ??
      getStringField(candidate, "err")
    )
    .find((value) => Boolean(value));

  const status = candidates
    .map((candidate) => getStringField(candidate, "status"))
    .find((value) => Boolean(value))
    ?.toLowerCase();

  const code = candidates
    .map((candidate) => getStringField(candidate, "code"))
    .find((value) => Boolean(value))
    ?.toLowerCase();

  const currency = normalizeCurrency(
    candidates
      .map((candidate) => getStringField(candidate, "currency") ?? getStringField(candidate, "currency_code"))
      .find((value) => Boolean(value))
  );

  const balance =
    candidates
      .map((candidate) =>
        getNumberField(candidate, "balance") ??
        getNumberField(candidate, "funds") ??
        getNumberField(candidate, "amount")
      )
      .find((value) => value !== null) ?? 0;

  if (errorMessage && errorMessage.trim()) {
    return {
      balance: 0,
      currency,
      error: errorMessage.trim(),
    };
  }

  if (status && ["error", "failed", "fail", "denied", "rejected"].includes(status)) {
    return {
      balance: 0,
      currency,
      error: "Provider returned a failed balance status.",
    };
  }

  if (code && ["error", "failed", "fail"].includes(code)) {
    return {
      balance: 0,
      currency,
      error: "Provider returned a failed balance code.",
    };
  }

  return {
    balance,
    currency,
  };
}

function normalizeApiUrl(apiUrl: string) {
  return apiUrl.replace(/\/+$/, "");
}

const SUPPORTED_BALANCE_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "INR",
  "PKR",
  "BDT",
  "PHP",
  "IDR",
  "VND",
  "THB",
  "TRY",
  "BRL",
  "RUB",
  "NGN",
  "AED",
  "SAR",
  "EGP",
  "KES",
  "ZAR",
]);

function normalizeCurrency(value: unknown) {
  if (typeof value !== "string") return "USD";

  const currency = value.trim().toUpperCase();

  if (SUPPORTED_BALANCE_CURRENCIES.has(currency)) {
    return currency;
  }

  return "USD";
}

function parseBalanceValue(value: unknown) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export async function getProviderBalances(): Promise<ProviderBalanceResult[]> {
  const supabase = supabaseAdmin();

  const { data: providers, error } = await supabase
    .from("api_providers")
    .select("id, name, api_url, api_key, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  if (!providers || providers.length === 0) {
    return [];
  }

  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        const apiUrl = normalizeApiUrl(provider.api_url);

        const params = new URLSearchParams({
          key: provider.api_key,
          action: "balance",
        });

        const postRes = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        });

        const postText = await postRes.text();
        const postParsed = parseProviderBalanceResponse(postText);

        let parsed = postParsed;
        let finalError =
          !postRes.ok && postParsed.error
            ? `${postParsed.error} (status ${postRes.status})`
            : !postRes.ok
              ? `Balance request failed with status ${postRes.status}.`
              : postParsed.error;

        const shouldTryGet =
          !postRes.ok ||
          (postParsed.balance === 0 &&
            typeof postParsed.error === "string" &&
            postParsed.error.toLowerCase().includes("unexpected"));

        if (shouldTryGet) {
          const separator = apiUrl.includes("?") ? "&" : "?";
          const getUrl = `${apiUrl}${separator}${params.toString()}`;
          const getRes = await fetch(getUrl, {
            method: "GET",
            cache: "no-store",
          });
          const getText = await getRes.text();
          const getParsed = parseProviderBalanceResponse(getText);

          if (getRes.ok || !getParsed.error || getParsed.balance > 0) {
            parsed = getParsed;
            finalError = getRes.ok ? getParsed.error : `${getParsed.error ?? "Balance request failed"} (status ${getRes.status})`;
          }
        }

        return {
          providerId: provider.id,
          providerName: provider.name,
          apiUrl: provider.api_url,
          balance: parsed.balance,
          currency: parsed.currency,
          error: finalError,
        };
      } catch (error) {
        return {
          providerId: provider.id,
          providerName: provider.name,
          apiUrl: provider.api_url,
          balance: 0,
          currency: "USD",
          error: error instanceof Error ? error.message : "Failed to fetch balance.",
        };
      }
    })
  );

  return results;
}

export const DISPLAY_CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "PHP", symbol: "₱", label: "Philippine Peso" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "IDR", symbol: "Rp", label: "Indonesian Rupiah" },
  { code: "VND", symbol: "₫", label: "Vietnamese Dong" },
  { code: "THB", symbol: "฿", label: "Thai Baht" },
  { code: "TRY", symbol: "₺", label: "Turkish Lira" },
  { code: "BRL", symbol: "R$", label: "Brazilian Real" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", label: "Saudi Riyal" },
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]["code"];

type ExchangeRateResponse = {
  result?: string;
  rates?: Record<string, number>;
};

let cachedRates: {
  timestamp: number;
  rates: Record<string, number>;
} | null = null;

async function getUsdExchangeRates(): Promise<Record<string, number>> {
  const oneHour = 1000 * 60 * 60;

  if (cachedRates && Date.now() - cachedRates.timestamp < oneHour) {
    return cachedRates.rates;
  }

  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    cache: "no-store",
  });

  const data = (await res.json()) as ExchangeRateResponse;

  if (!res.ok || !data.rates) {
    throw new Error("Failed to fetch currency exchange rates.");
  }

  const rates: Record<string, number> = {
    USD: 1,
    ...data.rates,
  };

  cachedRates = {
    timestamp: Date.now(),
    rates,
  };

  return rates;
}

export async function convertTotalsToCurrency(
  totalsByCurrency: Record<string, number>,
  targetCurrency: DisplayCurrency
) {
  const rates = await getUsdExchangeRates();

  const targetRate = rates[targetCurrency];

  if (typeof targetRate !== "number") {
    throw new Error(`Unsupported target currency: ${targetCurrency}`);
  }

  let convertedTotal = 0;

  for (const [sourceCurrency, amount] of Object.entries(totalsByCurrency)) {
    const sourceRate = rates[sourceCurrency];

    if (typeof sourceRate !== "number") {
      continue;
    }

    const amountInUsd = amount / sourceRate;
    const amountInTargetCurrency = amountInUsd * targetRate;

    convertedTotal += amountInTargetCurrency;
  }

  return convertedTotal;
}