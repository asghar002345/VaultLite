/** EIP-1559 fee math. All values in wei (bigint). */
export type FeeTier = 'slow' | 'normal' | 'fast';

export interface FeeQuote {
  tier: FeeTier;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Priority fee multipliers (percent) and base-fee headroom (percent) per tier. */
export const TIER_PARAMS: Record<FeeTier, { tipPct: bigint; basePct: bigint }> = {
  slow: { tipPct: 80n, basePct: 110n },
  normal: { tipPct: 100n, basePct: 125n },
  fast: { tipPct: 150n, basePct: 200n },
};

/** Floor for the tip so tiny suggestions (some testnets report 0) still get mined. */
export const MIN_TIP = 1_000_000n; // 0.001 gwei

const pct = (v: bigint, p: bigint) => (v * p + 99n) / 100n; // ceil

export function feeTiers(baseFeePerGas: bigint, suggestedTip: bigint): Record<FeeTier, FeeQuote> {
  if (baseFeePerGas < 0n || suggestedTip < 0n) throw new Error('negative fee input');
  const out = {} as Record<FeeTier, FeeQuote>;
  for (const tier of Object.keys(TIER_PARAMS) as FeeTier[]) {
    const { tipPct, basePct } = TIER_PARAMS[tier];
    let tip = pct(suggestedTip, tipPct);
    if (tip < MIN_TIP) tip = MIN_TIP;
    out[tier] = { tier, maxPriorityFeePerGas: tip, maxFeePerGas: pct(baseFeePerGas, basePct) + tip };
  }
  return out;
}

/** Worst-case network fee = gasLimit × maxFeePerGas. */
export const maxFeeCost = (gasLimit: bigint, q: FeeQuote) => gasLimit * q.maxFeePerGas;

/** Expected fee if the base fee stays put: gasLimit × min(maxFee, base + tip). */
export function expectedFeeCost(gasLimit: bigint, baseFeePerGas: bigint, q: FeeQuote) {
  const eff = baseFeePerGas + q.maxPriorityFeePerGas;
  return gasLimit * (eff < q.maxFeePerGas ? eff : q.maxFeePerGas);
}

/** Pad a gas estimate by `pct` percent (default 20%). */
export const padGas = (estimate: bigint, p = 20n) => (estimate * (100n + p) + 99n) / 100n;

/** Can the sender afford value + worst-case fee (native sends) or the fee alone (token sends)? */
export function canAfford(nativeBalance: bigint, fee: bigint, nativeValue = 0n) {
  return nativeBalance >= fee + nativeValue;
}

/** Minimum bump most clients (geth/erigon txpool) require to replace a pending tx: +10%. We use +12.5%. */
export const REPLACEMENT_BUMP_PCT = 1125n; // per-mille

/**
 * Fees for a replacement (speed-up / cancel) of a pending tx with the same nonce:
 * each field is max(old × 1.125 rounded up, current market quote).
 */
export function bumpFees(
  old: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  market?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const bump = (v: bigint) => (v * REPLACEMENT_BUMP_PCT + 999n) / 1000n;
  let tip = bump(old.maxPriorityFeePerGas);
  let max = bump(old.maxFeePerGas);
  if (market) {
    if (market.maxPriorityFeePerGas > tip) tip = market.maxPriorityFeePerGas;
    if (market.maxFeePerGas > max) max = market.maxFeePerGas;
  }
  if (max < tip) max = tip;
  return { maxFeePerGas: max, maxPriorityFeePerGas: tip };
}

// ---------- Tron resource fees ----------

export interface TronResources {
  /** Free daily bandwidth left + staked bandwidth left. */
  bandwidthLeft: number;
  energyLeft: number;
}
export interface TronPrices {
  /** sun per bandwidth byte (getTransactionFee) */
  sunPerBandwidth: number;
  /** sun per energy unit (getEnergyFee) */
  sunPerEnergy: number;
}

/** Signed size ≈ raw_data bytes + 65-byte signature + protobuf/result overhead (TronWeb uses ~64+). */
export const tronTxBandwidth = (rawDataHexLen: number) => rawDataHexLen / 2 + 65 + 69;

/**
 * TRX burned (in sun). Bandwidth is all-or-nothing: if the account lacks enough
 * bandwidth for the whole tx it pays the full size in TRX. Energy shortfall is burned.
 */
export function tronFeeSun(bandwidth: number, energy: number, res: TronResources, prices: TronPrices, activationSun = 0) {
  const bwSun = res.bandwidthLeft >= bandwidth ? 0 : Math.ceil(bandwidth) * prices.sunPerBandwidth;
  const energyShort = Math.max(0, energy - res.energyLeft);
  const energySun = energyShort * prices.sunPerEnergy;
  return { bandwidth: Math.ceil(bandwidth), energy, bandwidthSun: bwSun, energySun, activationSun, totalSun: bwSun + energySun + activationSun };
}
