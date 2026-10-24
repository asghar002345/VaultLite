import { randomBytes as nobleRandom } from '@noble/hashes/utils.js';

/** Uses crypto.getRandomValues (polyfilled on native by react-native-get-random-values). */
export const randomBytes = (n: number): Uint8Array => nobleRandom(n);
