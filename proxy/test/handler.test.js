import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle, _resetRateLimit, ENTRY_POINT } from '../lib/handler.js';
const KEY = 'test-secret-KEY-123';
const env = { PIMLICO_API_KEY: KEY, PIMLICO_SPONSORSHIP_POLICY_ID: 'sp_test' };
const req = (body, extra = {}) => new Request('http://x/api/bundler/84532', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const rpc = (method, params = []) => ({ jsonrpc: '2.0', id: 7, method, params });
const mockFetch = (respBody, status = 200) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return new Response(typeof respBody === 'string' ? respBody : JSON.stringify(respBody), { status }); }; f.calls = calls; return f; };
beforeEach(() => _resetRateLimit());

test('allowlisted read is forwarded with key only on the upstream URL', async () => {
  const f = mockFetch({ jsonrpc: '2.0', id: 7, result: [ENTRY_POINT] });
  const r = await handle(req(rpc('eth_supportedEntryPoints')), '84532', env, f);
  assert.equal(r.status, 200);
  assert.match(f.calls[0].url, /^https:\/\/api\.pimlico\.io\/v2\/84532\/rpc\?apikey=/);
  const t = await r.text(); assert.ok(!t.includes(KEY)); assert.deepEqual(JSON.parse(t).result, [ENTRY_POINT]);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});
for (const m of ['pm_sponsorUserOperation', 'pimlico_sendUserOperationNow', 'eth_call', 'eth_sendRawTransaction', 'pimlico_getTokenQuotes']) {
  test(`rejects ${m}`, async () => {
    const f = mockFetch({});
    const r = await handle(req(rpc(m)), '84532', env, f);
    assert.equal(r.status, 403); const j = await r.json();
    assert.equal(j.error.code, -32001); assert.equal(j.error.message, 'method_not_allowed'); assert.equal(j.id, 7);
    assert.equal(f.calls.length, 0);
  });
}
test('chain other than 84532 -> 404', async () => {
  for (const c of ['1', '8453', '11155111']) { const r = await handle(req(rpc('eth_supportedEntryPoints')), c, env, mockFetch({})); assert.equal(r.status, 404); assert.equal((await r.json()).error.code, -32003); }
});
test('batch, bad json, oversize -> 400', async () => {
  assert.equal((await handle(req([rpc('eth_supportedEntryPoints')]), '84532', env, mockFetch({}))).status, 400);
  assert.equal((await handle(req('{nope'), '84532', env, mockFetch({}))).status, 400);
  assert.equal((await handle(req(JSON.stringify(rpc('eth_supportedEntryPoints', ['x'.repeat(70000)]))), '84532', env, mockFetch({}))).status, 400);
});
test('wrong entrypoint -> 400', async () => {
  const r = await handle(req(rpc('eth_estimateUserOperationGas', [{ sender: '0x1' }, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'])), '84532', env, mockFetch({}));
  assert.equal(r.status, 400); assert.equal((await r.json()).error.message, 'entrypoint_not_allowed');
});
test('pm_* gets server sponsorship context, client context overridden', async () => {
  const f = mockFetch({ jsonrpc: '2.0', id: 7, result: { paymaster: '0xabc' } });
  await handle(req(rpc('pm_getPaymasterStubData', [{ sender: '0x1' }, ENTRY_POINT, '0x14a34', { sponsorshipPolicyId: 'sp_evil', token: '0xdead' }])), '84532', env, f);
  assert.deepEqual(JSON.parse(f.calls[0].init.body).params[3], { sponsorshipPolicyId: 'sp_test' });
});
test('upstream JSON-RPC error passes through (200) with key/URL redacted', async () => {
  const f = mockFetch({ jsonrpc: '2.0', id: 7, error: { code: -32500, message: `AA21 didn't pay prefund (https://api.pimlico.io/v2/84532/rpc?apikey=${KEY}) ${KEY}` } });
  const r = await handle(req(rpc('eth_sendUserOperation', [{ sender: '0x1' }, ENTRY_POINT])), '84532', env, f);
  assert.equal(r.status, 200); const t = await r.text();
  assert.ok(!t.includes(KEY)); assert.ok(!t.includes('apikey')); const j = JSON.parse(t);
  assert.equal(j.error.code, -32500); assert.match(j.error.message, /^AA21/);
});
test('upstream network failure / non-JSON -> 502 without key', async () => {
  const boom = async () => { throw new Error(`connect failed https://api.pimlico.io/v2/84532/rpc?apikey=${KEY}`); };
  let r = await handle(req(rpc('eth_supportedEntryPoints')), '84532', env, boom);
  assert.equal(r.status, 502); assert.ok(!(await r.text()).includes(KEY));
  r = await handle(req(rpc('eth_supportedEntryPoints')), '84532', env, mockFetch(`<html>${KEY}</html>`, 500));
  assert.equal(r.status, 502); assert.ok(!(await r.text()).includes(KEY));
});
test('missing key -> 502, no upstream call', async () => {
  const f = mockFetch({}); const r = await handle(req(rpc('eth_supportedEntryPoints')), '84532', {}, f);
  assert.equal(r.status, 502); assert.equal(f.calls.length, 0);
});
test('per-IP rate limit: 61st request in a minute -> 429', async () => {
  const f = mockFetch({ jsonrpc: '2.0', id: 7, result: [] });
  for (let i = 0; i < 60; i++) assert.equal((await handle(req(rpc('eth_supportedEntryPoints'), { 'x-forwarded-for': '1.2.3.4' }), '84532', env, f)).status, 200);
  const r = await handle(req(rpc('eth_supportedEntryPoints'), { 'x-forwarded-for': '1.2.3.4' }), '84532', env, f);
  assert.equal(r.status, 429); assert.ok((await r.json()).error.data.retryAfter > 0);
});
test('OPTIONS -> 204 with CORS', async () => {
  const r = await handle(new Request('http://x/api/bundler/84532', { method: 'OPTIONS' }), '84532', env, mockFetch({}));
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});
