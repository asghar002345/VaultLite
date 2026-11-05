import { getExchangeInfo, MarketHttpError, type SymbolInfo } from './binance-rest';
import { ASSET_TO_BINANCE, MARKET_UNIVERSE } from './symbols';

/** Every symbol VaultLite may ever request. Anything outside this list is shown as unavailable. */
export const ALL_SYMBOLS: readonly string[] = [...new Set([...MARKET_UNIVERSE, ...Object.values(ASSET_TO_BINANCE)])];

/**
 * exchangeInfo for our universe. Binance fails the whole batch with 400 (-1121) if one symbol is
 * delisted, so on 400 fall back to per-symbol requests and drop the invalid ones.
 */
export async function loadExchangeInfo(symbols: readonly string[] = ALL_SYMBOLS, get = getExchangeInfo): Promise<Record<string, SymbolInfo>> {
  try {
    return await get(symbols);
  } catch (e) {
    if (!(e instanceof MarketHttpError && e.status === 400)) throw e;
    const parts = await Promise.all(
      symbols.map((s) =>
        get([s]).catch((err) => {
          if (err instanceof MarketHttpError && err.status === 400) return {};
          throw err;
        }),
      ),
    );
    return Object.assign({}, ...parts);
  }
}


/** Offline fallback is only trusted for this long (tick/step sizes rarely change, listings do). */
export const INFO_CACHE_MAX_AGE = 7 * 24 * 3600_000;

/**
 * exchangeInfo with an on-device fallback. A corrupt, malformed or too-old cache is ignored and the
 * original network error is rethrown (never a JSON SyntaxError).
 */
export async function loadInfoWithCache(d: {
  load: () => Promise<Record<string, SymbolInfo>>;
  getItem: () => Promise<string | null>;
  setItem: (v: string) => Promise<void>;
  now?: () => number;
  maxAge?: number;
}): Promise<Record<string, SymbolInfo>> {
  const now = d.now ?? Date.now;
  try {
    const info = await d.load();
    d.setItem(JSON.stringify({ at: now(), info })).catch(() => {});
    return info;
  } catch (e) {
    const raw = await d.getItem().catch(() => null);
    let cached: { at?: unknown; info?: unknown } | null = null;
    try {
      cached = raw ? JSON.parse(raw) : null;
    } catch {
      cached = null;
    }
    const fresh = typeof cached?.at === 'number' && now() - cached.at <= (d.maxAge ?? INFO_CACHE_MAX_AGE);
    if (fresh && cached?.info && typeof cached.info === 'object') return cached.info as Record<string, SymbolInfo>;
    throw e;
  }
}
