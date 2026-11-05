# Bundler / paymaster proxy — design

**Status:** spec only. Not built or deployed. A teammate will host it on Vercel (Next.js App Router).
**Goal:** the app never ships a Pimlico API key. It talks to `POST {EXPO_PUBLIC_BUNDLER_PROXY_URL}/api/bundler/:chainId`; the proxy adds the key, filters requests and enforces a sponsorship policy.

```
VaultLite app ──JSON-RPC──▶ /api/bundler/84532 ──(adds ?apikey=)──▶ https://api.pimlico.io/v2/84532/rpc
                            allowlists · rate limits · sponsorship policy
```

## 1. Endpoint
`POST /api/bundler/:chainId` — body is a single JSON-RPC 2.0 request (batches rejected in v1: easier to rate-limit and audit). `Content-Type: application/json`, max body 64 KB.

### Chain allowlist
| chainId | Network | Upstream |
|---|---|---|
| `84532` | Base Sepolia | `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}` |

Anything else → `404 chain_not_allowed`. Mainnets are never added (VaultLite is testnet-only).

### Method allowlist (names per current Pimlico docs, checked 2026-10-25)
| Method | Kind | Policy applied |
|---|---|---|
| `eth_sendUserOperation` | bundler | sender rate limit; must target escrow (see §4) if it carries Pimlico paymaster data |
| `eth_estimateUserOperationGas` | bundler | rate limit |
| `eth_getUserOperationReceipt` | bundler | read, loose limit |
| `eth_getUserOperationByHash` | bundler | read, loose limit |
| `eth_supportedEntryPoints` | bundler | read; cacheable 1 h |
| `pimlico_getUserOperationGasPrice` | bundler | read; cacheable 5 s |
| `pimlico_getUserOperationStatus` | bundler | read (optional, useful for status UI) |
| `pm_getPaymasterStubData` | paymaster (ERC-7677) | **sponsorship policy** |
| `pm_getPaymasterData` | paymaster (ERC-7677) | **sponsorship policy** |

Not allowed (examples): `pm_sponsorUserOperation` (the app uses ERC-7677 only), `pimlico_sendUserOperationNow`, `pimlico_simulateAssetChanges`, `pimlico_getTokenQuotes`, `pm_validateSponsorshipPolicies`, any `eth_*` node method (Pimlico rejects these anyway). → `403 method_not_allowed`.

EntryPoint allowlist: only v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (second param of the userOp methods) → else `400 entrypoint_not_allowed`.

## 2. Secrets & config (server env vars only)
| Var | Purpose |
|---|---|
| `PIMLICO_API_KEY` | Pimlico key. **Never** `NEXT_PUBLIC_*`, never logged, never echoed in errors. Restrict it in the Pimlico dashboard too (allowed IPs = Vercel egress if available). |
| `PIMLICO_SPONSORSHIP_POLICY_ID` | `sp_…` passed as paymaster context so Pimlico also enforces limits server-side (defense in depth). |
| `ESCROW_ADDRESS_84532` | MilestoneEscrow address (sponsorship target). |
| `ACCOUNT_FACTORY_84532` | Factory allowed in `factory`/`initCode` for first-deploy userOps. |
| `MAX_SPONSORED_GAS` | Cap on `callGasLimit + verificationGasLimit + preVerificationGas (+ paymaster gas)`, default `1_500_000`. |
| `MAX_SPONSORED_FEE_WEI` | Cap on `totalGas × maxFeePerGas`, default `0.002 ETH`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (Vercel Marketplace) for rate-limit counters. |
| `ALLOWED_ORIGINS` | Comma list for browser CORS (dev web build). |

## 3. Rate limiting
Sliding window in Redis (`@upstash/ratelimit`), keys hashed:
| Key | Limit | Applies to |
|---|---|---|
| `ip:{x-forwarded-for first hop}` | 60 req / min, 1 000 / day | all methods |
| `sender:{userOp.sender lowercase}` | 20 req / min | estimate / pm_* / send |
| `sponsor:{sender}` | 10 sponsored ops / day, 50 / week | `pm_getPaymasterData` |
| `global:sponsor` | 2 000 / day | kill switch for spend |

Exceeded → `429 rate_limited` with `Retry-After`. Reads (`eth_getUserOperationReceipt`, `…ByHash`, status) use a looser 120/min IP bucket since the app polls.

## 4. Sponsorship policy (pm_* methods)
Sponsor only if **all** hold; otherwise `403 not_sponsorable` (client may still send self-paid ops):
1. `chainId == 84532`, EntryPoint v0.7.
2. `callData` decodes as the account's ERC-7579 `execute(bytes32 mode, bytes executionCalldata)` (selector `0xe9ae5c53`; nothing else, in particular no `executeFromExecutor`/`installModule`/`executeUserOp`), and **every** inner call is allowlisted (see below). Decoder:
   - `mode` byte 0 = callType, byte 1 = execType. Require execType `0x00` (default/revert); bytes 2..31 (unused, modeSelector, modePayload) must be zero.
   - callType `0x00` **single**: `executionCalldata = abi.encodePacked(address target (20), uint256 value (32), bytes callData)`, i.e. target = bytes[0:20], value = bytes[20:52], callData = bytes[52:]. Require length ≥ 52.
   - callType `0x01` **batch**: `executionCalldata = abi.encode(Execution[])` with `struct Execution { address target; uint256 value; bytes callData; }`. Decode with strict ABI decoding (bounds-checked offsets/lengths); require ≥ 1 element. Every element must pass the call allowlist.
   - callType `0xfe` (**delegatecall**), `0xff` (static/other) and any other callType or execType (e.g. `0x01` try) → reject `not_sponsorable`.
   - Allowed inner calls: target `ESCROW_ADDRESS_84532` with a selector from rule 3, or `approve(ESCROW_ADDRESS_84532, amount)` (`0x095ea7b3`, spender must equal the escrow) on an allowlisted test token (Circle Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`) batched before an escrow call. Any other target (the account itself, any module, SessionKeyValidator, other tokens) → reject. Calls that set up sessions or modules are therefore never sponsored; the app sends them self-paid.
3. Escrow selector allowlist: `createEscrow`, `fund`, `submitMilestone`, `approveMilestone`, `approveMilestoneWithSig`, `claimAfterReview`, `raiseDispute`, `cancel`, `refundExpired`, `withdraw` (no `resolveDispute` unless sender is a known arbiter).
4. `value` = 0 for sponsored calls except `fund` on native-token escrows (cap 0.05 ETH).
5. If `factory`/`initCode` present → factory == `ACCOUNT_FACTORY_84532`.
6. Gas caps: total gas ≤ `MAX_SPONSORED_GAS`, total gas × `maxFeePerGas` ≤ `MAX_SPONSORED_FEE_WEI`. For `pm_getPaymasterStubData` the gas fields may be zero — check after estimation in `pm_getPaymasterData`.
7. Per-sender quota (§3) not exhausted.
8. Proxy injects `{ sponsorshipPolicyId: PIMLICO_SPONSORSHIP_POLICY_ID }` as the paymaster context param, overriding anything the client sent (clients must not pick policies or ERC-20 tokens).

## 5. CORS
Native apps don't send `Origin`; allow requests without it. For browsers: echo `Origin` only if in `ALLOWED_ORIGINS`; `Access-Control-Allow-Methods: POST, OPTIONS`; `Access-Control-Allow-Headers: content-type`; `Access-Control-Max-Age: 600`; no credentials. `OPTIONS` → 204. CORS is not auth — the limits in §3/§4 are the real control. Optional later: App Attest / Play Integrity token header.

## 6. Error format
Always HTTP status + JSON-RPC envelope so viem/permissionless surface it:
```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32001, "message": "method_not_allowed", "data": { "reason": "pimlico_sendUserOperationNow is not allowlisted" } } }
```
| HTTP | `error.code` | message |
|---|---|---|
| 400 | -32600 | `invalid_request` (bad JSON, batch, >64 KB) / `entrypoint_not_allowed` |
| 403 | -32001 | `method_not_allowed` |
| 403 | -32002 | `not_sponsorable` (`data.reason` says which rule) |
| 404 | -32003 | `chain_not_allowed` |
| 429 | -32005 | `rate_limited` (`data.retryAfter` seconds) |
| 502 | -32603 | `upstream_error` |
Upstream JSON-RPC errors (e.g. `AA21`, `AA33`) pass through unchanged with HTTP 200, but strip any string containing the API key / upstream URL. Log: method, chainId, sender, decision, latency — never bodies' signatures or the key.

## 7. Next.js route handler sketch (`app/api/bundler/[chainId]/route.ts`)
```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { decodeFunctionData, type Hex } from 'viem';

export const runtime = 'nodejs';

const ENTRY_POINT = '0x0000000071727de22e5e9d8baf0edac6f37da032';
const CHAINS: Record<string, string> = { '84532': 'https://api.pimlico.io/v2/84532/rpc' };
const READ = new Set(['eth_getUserOperationReceipt', 'eth_getUserOperationByHash', 'eth_supportedEntryPoints',
  'pimlico_getUserOperationGasPrice', 'pimlico_getUserOperationStatus']);
const USEROP = new Set(['eth_sendUserOperation', 'eth_estimateUserOperationGas']);
const SPONSOR = new Set(['pm_getPaymasterStubData', 'pm_getPaymasterData']);

const redis = Redis.fromEnv();
const ipLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:ip' });
const senderLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 m'), prefix: 'rl:sender' });
const sponsorQuota = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(10, '1 d'), prefix: 'rl:sponsor' });

const rpcError = (id: unknown, status: number, code: number, message: string, data?: object) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } }, { status, headers: cors() });

function cors(origin?: string | null): HeadersInit {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
  return origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : {};
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) });
}

export async function POST(req: Request, { params }: { params: Promise<{ chainId: string }> }) {
  const { chainId } = await params;
  const upstream = CHAINS[chainId];
  if (!upstream) return rpcError(null, 404, -32003, 'chain_not_allowed');

  const raw = await req.text();
  if (raw.length > 65_536) return rpcError(null, 400, -32600, 'invalid_request');
  let body: { jsonrpc: string; id: unknown; method: string; params?: unknown[] };
  try { body = JSON.parse(raw); } catch { return rpcError(null, 400, -32600, 'invalid_request'); }
  if (Array.isArray(body) || body.jsonrpc !== '2.0') return rpcError(null, 400, -32600, 'invalid_request');

  const { id, method, params: p = [] } = body;
  if (!READ.has(method) && !USEROP.has(method) && !SPONSOR.has(method))
    return rpcError(id, 403, -32001, 'method_not_allowed', { reason: `${method} is not allowlisted` });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const r = await ipLimit.limit(ip);
  if (!r.success) return rpcError(id, 429, -32005, 'rate_limited', { retryAfter: Math.ceil((r.reset - Date.now()) / 1000) });

  let forwardParams = p;
  if (USEROP.has(method) || SPONSOR.has(method)) {
    const [userOp, entryPoint] = p as [Record<string, Hex>, string];
    if (entryPoint?.toLowerCase() !== ENTRY_POINT) return rpcError(id, 400, -32600, 'entrypoint_not_allowed');
    const sender = userOp?.sender?.toLowerCase();
    if (!sender || !(await senderLimit.limit(sender)).success) return rpcError(id, 429, -32005, 'rate_limited');

    if (SPONSOR.has(method)) {
      const verdict = checkSponsorship(userOp, method);           // §4 rules 2–6 (decode ERC-7579 execute(mode, data): single/batch only,
      if (!verdict.ok) return rpcError(id, 403, -32002, 'not_sponsorable', { reason: verdict.reason }); // targets, selectors, factory, gas caps)
      if (method !== 'pm_getPaymasterStubData' && !(await sponsorQuota.limit(sender)).success)
        return rpcError(id, 429, -32005, 'rate_limited', { reason: 'daily sponsorship quota' });
      // Server decides the policy; ignore any client-supplied context (ERC-7677 4th param / Pimlico 3rd).
      const ctx = { sponsorshipPolicyId: process.env.PIMLICO_SPONSORSHIP_POLICY_ID };
      forwardParams = [userOp, entryPoint, (p as unknown[])[2], ctx]; // ERC-7677: [op, entryPoint, chainIdHex, ctx]
    }
  }

  const res = await fetch(`${upstream}?apikey=${process.env.PIMLICO_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: forwardParams }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) return rpcError(id, 502, -32603, 'upstream_error');
  const text = (await res.text()).replaceAll(process.env.PIMLICO_API_KEY!, '***');
  return new Response(text, { status: res.ok ? 200 : 502, headers: { 'content-type': 'application/json', ...cors(req.headers.get('origin')) } });
}

declare function checkSponsorship(op: Record<string, Hex>, method: string): { ok: true } | { ok: false; reason: string };
void decodeFunctionData; // used inside checkSponsorship with the account + escrow ABIs
```

## 8. App side (done)
- `src/modules/smartAccount/config.ts` → `bundlerProxyUrl(84532)` from `EXPO_PUBLIC_BUNDLER_PROXY_URL`; used for both `bundlerUrl` and `paymasterUrl` (viem `createBundlerClient({ transport: http(url), paymaster: createPaymasterClient({ transport: http(url) }) })`).
- No `EXPO_PUBLIC_PIMLICO*` variables remain.

## 9. Test checklist for the backend
Disallowed method → 403; chain 1 / 8453 → 404; wrong EntryPoint → 400; non-escrow target with pm_* → 403 `not_sponsorable`; gas over cap → 403; 61st request/min from one IP → 429; key never appears in responses or logs; OPTIONS from allowed/disallowed origin.
