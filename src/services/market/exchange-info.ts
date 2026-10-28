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

