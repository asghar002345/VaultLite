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
src/app/                 routes: (onboarding)/welcome|create|verify|import|security, lock, (tabs)/home
src/crypto/              BIP-39/32 derivation (EVM, Tron; Solana stub), backup quiz
src/vault/               encrypted vault (SecureStore), PIN + biometrics, in-memory session, auto-lock
src/config/              env.ts (Reown id), chains.ts (testnet registry)
src/modules/escrow/      MilestoneEscrow ABI + EscrowService interface/stub
src/modules/smartAccount ERC-4337 SmartAccountProvider interface/stub
docs/INTEGRATIONS.md     where ABIs, addresses, bundler/paymaster URLs plug in
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
