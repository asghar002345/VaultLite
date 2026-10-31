// VaultLite bundler/paymaster proxy core (docs/BUNDLER_PROXY.md). Web-standard Request -> Response.
export const ENTRY_POINT = '0x0000000071727de22e5e9d8baf0edac6f37da032';
const UPSTREAM = { '84532': 'https://api.pimlico.io/v2/84532/rpc' };
const READ = ['eth_getUserOperationReceipt', 'eth_getUserOperationByHash', 'eth_supportedEntryPoints',
  'pimlico_getUserOperationGasPrice', 'pimlico_getUserOperationStatus'];
const USEROP = ['eth_sendUserOperation', 'eth_estimateUserOperationGas'];
const SPONSOR = ['pm_getPaymasterStubData', 'pm_getPaymasterData'];
export const ALLOWED_METHODS = new Set([...READ, ...USEROP, ...SPONSOR]);
export const MAX_BODY = 65_536;
const RATE = { limit: 60, windowMs: 60_000 };
const buckets = new Map();

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '600',
};

const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });
const rpcError = (id, status, code, message, data) =>
  json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, status);

export function redact(text, key) {
  let out = String(text);
  if (key) out = out.split(key).join('***');
  return out.replace(/https?:\/\/api\.pimlico\.io[^\s"']*/g, '[upstream]');
}

function rateLimited(ip, now = Date.now()) {
  let b = buckets.get(ip);
  if (!b || now - b.start >= RATE.windowMs) { b = { start: now, n: 0 }; buckets.set(ip, b); }
  if (buckets.size > 10_000) buckets.clear();
  return ++b.n > RATE.limit ? Math.ceil((b.start + RATE.windowMs - now) / 1000) : 0;
}
export const _resetRateLimit = () => buckets.clear();

export async function handle(req, chainId, env = process.env, fetchImpl = fetch) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return rpcError(null, 405, -32600, 'invalid_request', { reason: 'POST only' });
  const upstream = UPSTREAM[String(chainId)];
  if (!upstream) return rpcError(null, 404, -32003, 'chain_not_allowed');

  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) return rpcError(null, 400, -32600, 'invalid_request', { reason: 'body too large' });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY) return rpcError(null, 400, -32600, 'invalid_request', { reason: 'body too large' });
  let body;
  try { body = JSON.parse(raw); } catch { return rpcError(null, 400, -32600, 'invalid_request', { reason: 'bad json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string')
    return rpcError(null, 400, -32600, 'invalid_request');
  const { id, method } = body;
  const params = Array.isArray(body.params) ? body.params : [];
  if (!ALLOWED_METHODS.has(method))
    return rpcError(id, 403, -32001, 'method_not_allowed', { reason: `${method.slice(0, 64)} is not allowlisted` });

  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const retry = rateLimited(ip);
  if (retry) return rpcError(id, 429, -32005, 'rate_limited', { retryAfter: retry });

  let forward = params;
  if (USEROP.includes(method) || SPONSOR.includes(method)) {
    const [op, ep] = params;
    if (typeof ep !== 'string' || ep.toLowerCase() !== ENTRY_POINT) return rpcError(id, 400, -32600, 'entrypoint_not_allowed');
    if (!op || typeof op.sender !== 'string') return rpcError(id, 400, -32600, 'invalid_request', { reason: 'missing sender' });
    if (SPONSOR.includes(method)) {
      if (!env.PIMLICO_SPONSORSHIP_POLICY_ID)
        return rpcError(id, 403, -32001, 'sponsorship_disabled', { reason: 'no sponsorship policy configured; send self-paid' });
      // Server picks the policy; client-supplied context is ignored (ERC-7677: [op, ep, chainIdHex, ctx]).
      const ctx = { sponsorshipPolicyId: env.PIMLICO_SPONSORSHIP_POLICY_ID };
      forward = [op, ep, params[2] ?? '0x14a34', ctx];
    }
  }

  const key = env.PIMLICO_API_KEY;
  if (!key) return rpcError(id, 502, -32603, 'upstream_error', { reason: 'proxy not configured' });
  let res;
  try {
    res = await fetchImpl(`${upstream}?apikey=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: forward }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch { return rpcError(id, 502, -32603, 'upstream_error'); }
  let text;
  try { text = redact(await res.text(), key); } catch { return rpcError(id, 502, -32603, 'upstream_error'); }
  try { JSON.parse(text); } catch { return rpcError(id, 502, -32603, 'upstream_error', { status: res.status }); }
  return new Response(text, { status: res.ok ? 200 : 502, headers: { 'content-type': 'application/json', ...CORS } });
}
