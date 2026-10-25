import { decodeFunctionData, erc20Abi, formatUnits, maxUint256, parseAbi, type Hex } from 'viem';

export type Risk = { level: 'danger' | 'warning' | 'info'; text: string };

const EXTRA_ABI = parseAbi([
  'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
]);
const ABI = [...erc20Abi, ...EXTRA_ABI];

/** ≥ 2^255 is treated as "unlimited" (covers 2^256-1 and common near-max sentinels). */
export const UNLIMITED_THRESHOLD = 2n ** 255n;
export const isUnlimited = (v: bigint) => v >= UNLIMITED_THRESHOLD;

export interface DecodedCall {
  functionName: string | null;
  selector: Hex | null;
  args: { name: string; value: string }[];
  risks: Risk[];
}

export function decodeCalldata(data: Hex | undefined, token?: { symbol: string; decimals: number }): DecodedCall {
  if (!data || data === '0x') return { functionName: null, selector: null, args: [], risks: [] };
  const selector = data.slice(0, 10) as Hex;
  try {
    const d = decodeFunctionData({ abi: ABI, data });
    const item = ABI.find((x) => x.type === 'function' && x.name === d.functionName && x.inputs.length === (d.args?.length ?? 0));
    const fmtAmt = (v: bigint) => (token ? `${formatUnits(v, token.decimals)} ${token.symbol}` : v.toString());
    const args = (d.args ?? []).map((v, i) => {
      const name = item && 'inputs' in item ? item.inputs[i]?.name ?? `arg${i}` : `arg${i}`;
      const isAmt = typeof v === 'bigint' && /value|amount|addedValue/i.test(name);
      return { name, value: typeof v === 'bigint' ? (isAmt ? (isUnlimited(v) ? 'UNLIMITED' : fmtAmt(v)) : v.toString()) : String(v) };
    });
    const risks: Risk[] = [];
    if (d.functionName === 'approve' || d.functionName === 'increaseAllowance') {
      const amt = d.args![1] as bigint;
      if (isUnlimited(amt)) risks.push({ level: 'danger', text: `Unlimited approval: ${d.args![0]} could move ALL of this token, now and later.` });
      else risks.push({ level: 'info', text: `Grants ${d.args![0]} permission to spend ${fmtAmt(amt)}.` });
    }
    if (d.functionName === 'setApprovalForAll' && d.args![1] === true) {
      risks.push({ level: 'danger', text: `Approves ${d.args![0]} to transfer ALL your NFTs in this collection.` });
    }
    return { functionName: d.functionName, selector, args, risks };
  } catch {
    return {
      functionName: null,
      selector,
      args: [],
      risks: [{ level: 'warning', text: `Unknown contract call (selector ${selector}). Only continue if you trust this dApp.` }],
    };
  }
}

export type TreeNode = { depth: number; label: string; value?: string };

/** Flatten EIP-712 `message` into an indented, readable tree. */
export function typedDataTree(value: unknown, depth = 0, label = 'message'): TreeNode[] {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((v, i) => [`[${i}]`, v] as const) : Object.entries(value as Record<string, unknown>);
    return [{ depth, label }, ...entries.flatMap(([k, v]) => typedDataTree(v, depth + 1, k))];
  }
  return [{ depth, label, value: String(value) }];
}

export interface TypedData {
  domain?: { name?: string; version?: string; chainId?: number | string; verifyingContract?: string };
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
  message: Record<string, unknown>;
}

export function parseTypedData(raw: unknown): TypedData {
  const td = (typeof raw === 'string' ? JSON.parse(raw) : raw) as TypedData;
  if (!td || typeof td !== 'object' || !td.types || !td.primaryType || !td.message) throw new Error('Malformed EIP-712 typed data');
  return td;
}

export const typedDataChainId = (td: TypedData): number | null => {
  const c = td.domain?.chainId;
  if (c === undefined || c === null) return null;
  return typeof c === 'string' ? Number(c.startsWith('0x') ? BigInt(c) : c) : Number(c);
};

export function typedDataRisks(td: TypedData): Risk[] {
  const risks: Risk[] = [];
  const m = td.message as Record<string, unknown>;
  const big = (v: unknown) => {
    try {
      return BigInt(v as string);
    } catch {
      return null;
    }
  };
  if (td.primaryType === 'Permit') {
    const v = big(m.value);
    risks.push(
      v !== null && isUnlimited(v)
        ? { level: 'danger', text: `Off-chain UNLIMITED token approval (Permit) to ${String(m.spender)}.` }
        : { level: 'warning', text: `Off-chain token approval (Permit) to ${String(m.spender)}. No gas, but it can be used to move tokens.` },
    );
  }
  if (/^Permit(Single|Batch|TransferFrom|BatchTransferFrom)$/.test(td.primaryType)) {
    const details = (m.details ?? m.permitted) as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const list = Array.isArray(details) ? details : details ? [details] : [];
    const unlimited = list.some((d) => {
      const a = big(d.amount);
      return a !== null && a >= 2n ** 159n; // Permit2 amounts are uint160
    });
    risks.push({ level: unlimited ? 'danger' : 'warning', text: `Permit2 approval to ${String(m.spender)}${unlimited ? ' for an UNLIMITED amount' : ''}.` });
  }
  if (td.primaryType === 'Order' || /order/i.test(td.primaryType)) {
    risks.push({ level: 'warning', text: 'This looks like a marketplace order — it may transfer assets when filled.' });
  }
  return risks;
}

export const MAX_UINT = maxUint256;

/** Show personal_sign payloads as text when they're printable UTF-8, else hex. */
export function decodePersonalMessage(msg: string): { text: string; isHex: boolean } {
  if (!/^0x[0-9a-fA-F]*$/.test(msg)) return { text: msg, isHex: false };
  const bytes = new Uint8Array((msg.length - 2) / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(msg.slice(2 + i * 2, 4 + i * 2), 16);
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(s)) return { text: s, isHex: false };
  } catch {
    /* not utf-8 */
  }
  return { text: msg, isHex: true };
}
