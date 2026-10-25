# VaultLite

Self-custodial multi-chain wallet **demo** built with React Native + Expo (SDK 58, expo-router, TypeScript strict).

> ⚠️ **TESTNETS ONLY** — Sepolia, Polygon Amoy, BSC Testnet, Base Sepolia, Tron Nile. Do not use with real funds.

## Quick start
```sh
npm install
cp .env.example .env   # set EXPO_PUBLIC_REOWN_PROJECT_ID
npx expo start         # needs a dev build / Expo Go
```
Node ≥ 22.13 is recommended by Expo SDK 58.

## Scripts
| | |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` (ESLint flat config) |
| `npm test` | Jest (`jest-expo`) — derivation vectors, vault crypto, config |

## Architecture
```
index.js                 polyfills → expo-router entry
src/app/                 routes: (onboarding)/*, lock, (tabs)/home, token/[chain]/[address], receive,
                         send, send/review, send/status/[hash], walletconnect, scan, activity, tokens/add
src/store/               local tx history + custom tokens (AsyncStorage)
src/config/tokens.ts     curated testnet tokens (verified addresses only)
src/services/            evm.ts (viem reads/sends), tron.ts (TronGrid HTTP, local signing)
src/lib/                 address validation, EIP-1559 fee math, amounts
src/walletconnect/       WalletKit init, proposal handler, sessions
src/crypto/              BIP-39/32 derivation (EVM, Tron; Solana stub), backup quiz
src/vault/               encrypted vault (SecureStore), PIN + biometrics, in-memory session, auto-lock
src/config/              env.ts (Reown id), chains.ts (testnet registry)
src/modules/escrow/      MilestoneEscrow ABI + EscrowService interface/stub
src/modules/smartAccount ERC-4337 SmartAccountProvider interface/stub
docs/INTEGRATIONS.md     where ABIs, addresses, bundler/paymaster URLs plug in
docs/BUNDLER_PROXY.md    spec for the Pimlico proxy backend (no key in the app)
```

### Keys
- EVM: `m/44'/60'/0'/0/0`, address via viem `privateKeyToAccount`.
- Tron: `m/44'/195'/0'/0/0`, address = base58check(0x41 ‖ keccak256(pubkey)[12:]) implemented with `@noble`/`@scure` only.
- Solana: `m/44'/501'/0'/0'` (SLIP-0010 ed25519) — not yet implemented.

### Vault
- Secret (mnemonic or private key) encrypted with XChaCha20-Poly1305 under KEK = scrypt(PIN, salt); stored in `expo-secure-store` (Keychain / Keystore, this-device-only).
- PIN never stored; a separately-salted scrypt verifier checks it; 10 failed attempts lock the vault.
- Biometrics: KEK also stored in SecureStore with `requireAuthentication` (OS biometric prompt).
- Decrypted secret lives only in memory while unlocked; app going to background → lock.

## Status
Day 1: scaffold, keys, vault, onboarding/lock/home screens, config, extension-point stubs, tests.
Day 2: React Query balances (4 EVM testnets + Tron Nile), home/token/receive screens, send flow (EVM native/ERC-20, Tron TRX/TRC-20) with EIP-1559 tiers, hold-to-confirm and biometric/PIN re-auth, WalletConnect (WalletKit init, proposals, sessions), bundler proxy spec.
Day 3: QR scanner (addresses + WalletConnect), local tx history with pending on Home, Tron bandwidth/energy fee estimate, on-chain-verified custom tokens, EVM speed-up/cancel, readable RPC errors.
Day 4–5: WalletConnect signing sheet (EVM + Tron, decoded calldata, typed-data tree, risk hints, Verify API, biometric gating, EIP-1193 error codes), incoming transfers via keyless explorers, EIP-681 token-transfer QR.
WalletConnect, the camera and other native modules need a **dev build** (`npx expo run:android` / EAS), not Expo Go.
