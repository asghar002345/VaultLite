import { CHAIN_LIST } from '@/config/chains';
import { PLACEHOLDER, resolveReownProjectId } from '@/config/env';
import { buildQuiz } from '@/crypto/quiz';

it('chain registry is testnet-only with expected ids', () => {
  expect(CHAIN_LIST.every((c) => c.testnet)).toBe(true);
  expect(CHAIN_LIST.map((c) => c.chainId)).toEqual([11155111, 80002, 97, 84532, null]);
});

it('reown id falls back env → extra → placeholder', () => {
  expect(resolveReownProjectId('abc', { reownProjectId: 'x' })).toBe('abc');
  expect(resolveReownProjectId(undefined, { reownProjectId: 'x' })).toBe('x');
  expect(resolveReownProjectId('', undefined)).toBe(PLACEHOLDER);
});

it('backup quiz asks distinct positions with the answer among 4 options', () => {
  const words = 'a b c d e f g h i j k l'.split(' ');
  const q = buildQuiz(words, 3);
  expect(new Set(q.map((x) => x.index)).size).toBe(3);
  q.forEach((x) => {
    expect(x.options).toHaveLength(4);
    expect(x.options).toContain(words[x.index]);
  });
});

it('smart account points at the bundler proxy, never a Pimlico URL', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bundlerProxyUrl } = require('@/modules/smartAccount/config');
  expect(bundlerProxyUrl(84532, 'https://api.example.com/')).toBe('https://api.example.com/api/bundler/84532');
  expect(bundlerProxyUrl(84532, '')).toBeNull();
  expect(bundlerProxyUrl(84532, undefined)).toBeNull();
});
