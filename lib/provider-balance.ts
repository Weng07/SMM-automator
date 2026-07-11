import { supabaseAdmin } from "./supabase";

type ProviderBalanceResult = {
  providerId: string;
  providerName: string;
  apiUrl: string;
  balance: number;
  currency: string;
  error?: string;
};

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

        const body = new URLSearchParams({
          key: provider.api_key,
          action: "balance",
        });

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          return {
            providerId: provider.id,
            providerName: provider.name,
            apiUrl: provider.api_url,
            balance: 0,
            currency: "USD",
            error: `Balance request failed with status ${res.status}.`,
          };
        }

        const balance = parseBalanceValue(data?.balance);
        const currency = normalizeCurrency(data?.currency);

        return {
          providerId: provider.id,
          providerName: provider.name,
          apiUrl: provider.api_url,
          balance,
          currency,
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