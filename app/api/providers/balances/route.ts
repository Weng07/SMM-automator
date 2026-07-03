import { NextRequest, NextResponse } from "next/server";
import {
  DISPLAY_CURRENCIES,
  convertTotalsToCurrency,
  getProviderBalances,
  type DisplayCurrency,
} from "@/lib/provider-balance";

export async function GET(req: NextRequest) {
  try {
    const selectedCurrencyParam =
      req.nextUrl.searchParams.get("currency")?.toUpperCase() ?? "USD";

    const selectedCurrency = DISPLAY_CURRENCIES.some(
      (item) => item.code === selectedCurrencyParam
    )
      ? (selectedCurrencyParam as DisplayCurrency)
      : "USD";

    const selectedCurrencyMeta =
      DISPLAY_CURRENCIES.find((item) => item.code === selectedCurrency) ??
      DISPLAY_CURRENCIES[0];

    const balances = await getProviderBalances();

    const totalsByCurrency = balances.reduce<Record<string, number>>(
      (acc, item) => {
        if (!item.error) {
          acc[item.currency] = (acc[item.currency] ?? 0) + item.balance;
        }

        return acc;
      },
      {}
    );

    const convertedTotal = await convertTotalsToCurrency(
      totalsByCurrency,
      selectedCurrency
    );

    return NextResponse.json({
      balances,
      totalsByCurrency,
      convertedTotal,
      selectedCurrency,
      selectedCurrencySymbol: selectedCurrencyMeta.symbol,
      availableCurrencies: DISPLAY_CURRENCIES,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch provider balances." },
      { status: 500 }
    );
  }
}