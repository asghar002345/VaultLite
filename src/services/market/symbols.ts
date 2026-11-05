/**
 * Asset → Binance spot symbol mapping (mainnet reference only).
 * VaultLite holds TESTNET assets; these pairs price the mainnet asset of the same name and are
 * never multiplied into testnet balances (USDC→USDT conversion of test stablecoins is the one
 * labelled exception, see Home total).
 */
export const QUOTE = 'USDT' as const;

/** Reviewed static table. Keys are wallet asset symbols as they appear in config/tokens + chains. */
export const ASSET_TO_BINANCE: Readonly<Record<string, string>> = {
  ETH: 'ETHUSDT',
  POL: 'POLUSDT',
  tBNB: 'BNBUSDT',
  BNB: 'BNBUSDT',
  TRX: 'TRXUSDT',
  SOL: 'SOLUSDT',
  USDC: 'USDCUSDT',
};

/** Default Markets universe (also used for the WS subscription when the Markets screen is open). */
export const MARKET_UNIVERSE = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'TRXUSDT', 'POLUSDT', 'USDCUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT'] as const;

export type MarketRef =
  | { kind: 'pair'; symbol: string }
  | { kind: 'quote' } // the asset IS the quote currency (USDT): 1 USDT by definition, not a market price
  | { kind: 'unavailable'; reason: string };

/** Map a wallet asset to a Binance reference. Custom tokens are never auto-mapped by ticker (spoofable). */
export function marketRefFor(asset: { symbol: string; custom?: boolean }): MarketRef {
  if (asset.custom) return { kind: 'unavailable', reason: 'Custom tokens have no verified Binance market' };
  if (asset.symbol === QUOTE) return { kind: 'quote' };
  const s = ASSET_TO_BINANCE[asset.symbol];
  return s ? { kind: 'pair', symbol: s } : { kind: 'unavailable', reason: `No Binance market for ${asset.symbol}` };
}

/** Validate a mapped symbol against exchangeInfo (must exist and be TRADING). */
export function validateRef(ref: MarketRef, info: Record<string, { status: string }> | undefined): MarketRef {
  if (ref.kind !== 'pair' || !info) return ref;
  const s = info[ref.symbol];
  if (!s) return { kind: 'unavailable', reason: `${ref.symbol} not listed on Binance` };
  if (s.status !== 'TRADING') return { kind: 'unavailable', reason: `${ref.symbol} is ${s.status.toLowerCase()} on Binance` };
  return ref;
}

export const baseOf = (symbol: string) => (symbol.endsWith(QUOTE) ? symbol.slice(0, -QUOTE.length) : symbol);
