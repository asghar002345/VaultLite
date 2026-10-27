# Integrations — where things plug in

VaultLite is **testnet-only**. Every chain lives in `src/config/chains.ts`; do not add mainnets.

## Environment (`.env`, untracked — copy `.env.example`)
| Var | Used by | Notes |
|---|---|---|
| `EXPO_PUBLIC_REOWN_PROJECT_ID` | `src/config/env.ts` | WalletConnect/Reown. Fallback: `app.json > expo.extra.reownProjectId`, else `REPLACE_ME`. |
| `EXPO_PUBLIC_ESCROW_ADDRESS_BASE_SEPOLIA` | `src/modules/escrow/deployments.ts` | MilestoneEscrow address, overrides the in-code placeholder. |
| `EXPO_PUBLIC_BUNDLER_PROXY_URL` | `src/modules/smartAccount/config.ts` | Base URL of our bundler/paymaster proxy (`/api/bundler/:chainId`). See `docs/BUNDLER_PROXY.md`. |

⚠️ `EXPO_PUBLIC_*` values are inlined into the JS bundle. That is fine for a Reown project id (public by design) and the proxy URL. The Pimlico API key lives **only** on the proxy server (`PIMLICO_API_KEY`) — see `docs/BUNDLER_PROXY.md`.

## Escrow — `src/modules/escrow/`
Contract: **MilestoneEscrow** (source/spec in the teammate's `milestone-escrow` repo, `SPEC.md`). Target chain: **Base Sepolia (84532)**.

| What | Where |
|---|---|
| ABI | `abi/MilestoneEscrow.ts` — generated from `milestone-escrow/out/MilestoneEscrow.sol/MilestoneEscrow.json` as an `as const` array so viem infers types. Regenerate after contract changes (see snippet below). |
| Address | `deployments.ts` → `ESCROW_DEPLOYMENTS.baseSepolia.address` (currently `null`) or env var above. `isAvailable(chain)` is false until set. |
| EIP-712 domain | `name="MilestoneEscrow"`, `version="1"`, `chainId`, `verifyingContract=address`. Type: `ApproveMilestone(uint256 escrowId,uint256 index,uint256 amount,uint256 sigDeadline)`. |
| Interface | `types.ts` → `EscrowService` |
| Stub | `EscrowService.stub.ts` (reads return empty, writes throw) |

Flow → `EscrowService` method → contract function:
- client: `createEscrow` → `createEscrow(provider, arbiter, token, amounts[], reviewPeriod, deadline)`; `fund` (exact `msg.value` for native, or ERC-20 `approve` + `fund`, ideally batched in one UserOp); `cancel`; `approveMilestone`; `signApproval` (off-chain EIP-712, viem `signTypedData`); `refundExpired`.
- anyone/relayer: `approveMilestoneWithSig`.
- provider: `submitMilestone`, `claimAfterReview`, `providerRefund`.
- disputes: `raiseDispute`, `resolveDispute(bps)` (arbiter), `resolveAfterArbiterTimeout` (after 30 d).
- pull payments: `withdrawable(account, token)` view + `withdraw(token)`.
- reads: `getEscrow` + `getMilestones`; `listForAccount` should index `EscrowCreated` logs from `deployBlock`.

Enums are mirrored in `ESCROW_STATUS` / `MILESTONE_STATUS` (order must match the Solidity enums).

Regenerate ABI:
```sh
python3 -c "import json;a=json.load(open('../milestone-escrow/out/MilestoneEscrow.sol/MilestoneEscrow.json'))['abi'];open('src/modules/escrow/abi/MilestoneEscrow.ts','w').write('export const milestoneEscrowAbi = '+json.dumps(a,indent=2)+' as const;\n')"
```

## Smart account (ERC-4337) — `src/modules/smartAccount/`
Plan: **EntryPoint v0.7** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`), single EOA owner = vault's `m/44'/60'/0'/0/0` key, factory with counterfactual (CREATE2) addresses, **Pimlico** bundler + paymaster on Base Sepolia.

| What | Where |
|---|---|
| Factory address / ABI | `config.ts` → `SMART_ACCOUNT_CONFIG.baseSepolia.factory` (`null`), `factoryAbi`, `accountAbi` |
| Bundler / paymaster URL | same entry, `bundlerProxyUrl(84532)` → `${EXPO_PUBLIC_BUNDLER_PROXY_URL}/api/bundler/84532` (proxy forwards to Pimlico) |
| Interface | `types.ts` → `SmartAccountProvider` (`getAddress`, `isDeployed`, `buildUserOperation`, `sendUserOperation`, `waitForReceipt`) |
| Stub | `SmartAccountProvider.stub.ts` |

Suggested implementation: viem `account-abstraction` (`createBundlerClient`, `toSmartAccount`) or `permissionless` with a custom account matching the teammate's factory; `getAddress` via factory `getAddress(owner, salt)` / `getSenderAddress`; `factory`/`factoryData` only when `!isDeployed()`; paymaster via `pm_sponsorUserOperation` / ERC-7677 `pm_getPaymasterStubData`+`pm_getPaymasterData`. The escrow uses `msg.sender` only and ERC-1271 for signed approvals, so the smart account works as client/provider directly (see SPEC §10).

## Balances & tokens — `src/config/tokens.ts`, `src/services/{evm,tron}.ts`
Curated list; only addresses verified from official sources (2026-10-25):
| Chain | Token | Address | Source |
|---|---|---|---|
| Sepolia | USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle docs |
| Polygon Amoy | USDC | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` | Circle docs |
| Base Sepolia | USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Circle docs |
| Tron Nile | USDT (TRC-20) | `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` | Nile faucet (nileex.io) |
Skipped: BSC Testnet USDC (not listed by Circle), USDT on EVM testnets (no official Tether deployment). EVM reads via viem (fallback transports); Tron via TronGrid HTTP (`/wallet/getaccount`, `/wallet/triggerconstantcontract`).

## Send
EVM: viem `estimateGas` (+20 %), EIP-1559 tiers in `src/lib/fees.ts`. Tron: TronGrid `createtransaction` / `triggersmartcontract` (fee_limit 100 TRX) → local secp256k1 signature over `txID` → `broadcasttransaction`; status via `gettransactioninfobyid`.

## Day 3 additions
- **QR scanner** — `src/app/scan.tsx` (expo-camera `CameraView`, QR only; permission text in `app.json` plugin, mic disabled). `src/lib/scan.ts` parses WalletConnect v2 URIs (needs `symKey` + `relay-protocol`), EIP-681 `ethereum:` (testnet chain ids only; `/transfer` calls not yet), `tron:` and bare addresses. Address results go back to `/send` via `src/lib/scan-bus.ts`; `mode=wc` pairs directly.
- **Local tx history** — `src/store/history{,-core}.ts`, AsyncStorage key `vaultlite.history.v1` (max 200, serialized writes). Pending txs poll every 5 s; Home shows a Pending section, `/activity` lists everything. Only sends made from this device (no explorer indexing).
- **Tron fee estimate** — `estimateTronFee` in `src/services/tron.ts`: builds the unsigned tx for its size, `getaccountresource` (free + staked bandwidth, energy), `getchainparameters` (`getTransactionFee`, `getEnergyFee`, activation fees, cached 10 min), `triggerconstantcontract` `energy_used` for TRC-20s, `getaccount` to detect unactivated recipients. Math in `tronFeeSun` (bandwidth all-or-nothing, energy shortfall burned).
- **Custom tokens** — `/tokens/add`, stored under `vaultlite.customTokens.v1`. Verified on-chain at import (EVM: code exists + `decimals()`/`symbol()`/`name()`; Tron: same via constant calls). Custom tokens can never shadow curated addresses.
- **Speed-up / cancel** — EVM sends now use an explicit pending nonce stored in history. Replacements reuse the nonce with fees `max(old × 1.125, market)` (`bumpFees`); cancel = 0-value self-send, 21 000 gas. Missing receipt + consumed nonce ⇒ shown as *Replaced*.
- **Errors** — `src/lib/errors.ts` `humanizeError` maps viem/RPC/TronGrid errors to short messages and strips URLs.

## Day 4–5 additions
- **Signing sheet** — `src/walletconnect/{requests,decode,execute,errors,signing-sheet}.ts(x)`. Supported: `personal_sign` (hex shown as text when printable), `eth_signTypedData`/`_v4` (domain + indented message tree), `eth_sendTransaction` (ERC-20 `transfer`/`approve`/`transferFrom`/`increaseAllowance`, `setApprovalForAll`, `permit` decoded; unknown selectors flagged), `wallet_switchEthereumChain` (auto-answered + `chainChanged` event, no prompt), `tron_signMessage` (TronWeb `signMessageV2` scheme, cross-checked against TronWeb 6 output), `tron_signTransaction` (v1 and legacy nested params; returns the signed tx, dApp broadcasts).
- **Checks before the sheet opens:** method allowlist; chain must be a testnet *and* approved in the session; account must be ours; typed-data `domain.chainId` / tx `chainId` must match the request chain; Tron `txID == sha256(raw_data_hex)` and owner = our address; contract deployment refused.
- **Error codes:** 4001 user rejected · 4100 wrong account · 4200 unsupported method (incl. `eth_sign`, `eth_signTransaction`, `wallet_addEthereumChain`) · 4901 chain not in session · 4902 unknown/mainnet chain · -32602 bad params / chainId mismatch · -32603 execution failure.
- **Risk hints:** unlimited ERC-20 approve (≥ 2^255), `setApprovalForAll(true)`, Permit / Permit2 (unlimited flagged), marketplace orders, native value + calldata, Reown Verify (`verifyContext.verified`: INVALID → danger, UNKNOWN → warning, `isScam` → danger and blocks session approval). Any danger risk switches Approve to a 2.5 s hold. Every approval needs biometric or PIN re-auth.
- **Incoming transfers** — `src/services/incoming.ts`, keyless only: Blockscout REST v2 for Sepolia and Base Sepolia, TronGrid v1 for Nile. Polygon Amoy and BSC Testnet are skipped (their explorers need API keys). Merged with local sends in `/activity`. Not filtered for spam tokens.
- **EIP-681 token transfer QR** — `ethereum:<token>@<chainId>/transfer?address=<to>&uint256=<amount>` (decimal, scientific or hex amounts). Picks the token if it's known/custom, otherwise asks you to import it first.

## Day 6 additions
- **Solana Devnet** — `src/crypto/solana.ts`: SLIP-0010 ed25519 (`m/44'/501'/i'/0'`, matches Phantom/`@solana/web3.js` + `ed25519-hd-key`; SLIP-0010 vector 1 tested). Address + `getBalance` via `https://api.devnet.solana.com`. Receive + balance only (no send, not in WalletConnect namespaces). Not available for raw private-key imports.
- **Signing sheet fee preview** — `previewEvmTxFee` (dApp gas or estimate +20 %, dApp fees or market EIP-1559), refreshed every 15 s.
- **dApp txs in history** — `src/walletconnect/history.ts` decodes ERC-20 `transfer` into token amounts; `approve`/`transferFrom`/unknown calls become labelled `contract` entries with the dApp name.
- **Spam filtering** — `src/lib/spam.ts`: hides zero-value transfers, URL/bait/non-ASCII symbols, curated-symbol impersonation, and address-poisoning senders; unknown tokens are tagged "unverified". Toggle in Activity.
- **WC de-dup** — `src/walletconnect/dedupe.ts`: per-topic request ids + identical payloads within 5 s.
- **UX** — Reanimated spring press-scale on buttons/chips, `FadeInDown` token rows, `expo-haptics` (press, selection, hold-complete, copy, approve), accessibility labels/roles/states, hold-to-confirm exposes an `activate` accessibility action.
- **Screen capture** — `expo-screen-capture` (`useSecureScreen`) on create/verify/import/security/lock, send review and the signing sheet.
- **E2E** — `.maestro/onboarding-import.yaml` (import → PIN → home → receive → lock/unlock) and `.maestro/onboarding-create.yaml` (to the quiz). appId `com.vaultlite.demo`.
- **CI** — `.github/workflows/ci.yml` (Node 22, `npm ci`, typecheck, lint, jest). **EAS** — `eas.json` `development` (dev client, internal APK / iOS simulator) and `preview` (internal APK). Set `EXPO_PUBLIC_REOWN_PROJECT_ID` as an EAS environment variable, not in git.

## WalletConnect — `src/walletconnect/`
Polyfills: `index.js` → `src/polyfills.ts`, with `@walletconnect/react-native-compat` first. Packages: `@reown/walletkit`, `@walletconnect/core`, `@walletconnect/utils`, peers `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-application`. Needs a dev build (native modules — not Expo Go).
`walletkit.ts` inits WalletKit with `env.REOWN_PROJECT_ID`, handles `session_proposal` (approve with testnet-only `supportedNamespaces`, reject), lists/disconnects sessions, and routes `session_request` through `analyzeRequest` → signing sheet (see Day 4–5). Tron Nile CAIP-2 `tron:0xcd8690dc` verified (Reown Tron RPC docs + Nile genesis blockID suffix).

## MilestoneEscrow (Base Sepolia 84532)

- Address: `0xD861488f2ba02df4047DDE41EFeCdCEd1FD6E528` (deploy block 50793329, fee 0), verified on Sourcify:
  https://repo.sourcify.dev/84532/0xD861488f2ba02df4047DDE41EFeCdCEd1FD6E528
- Repo ABI compared with the Sourcify ABI: all 80 entries identical. All function selectors are present in the 13,647-byte runtime code.
  Live reads return `nextEscrowId=1`, `feeBps=0` and the EIP-712 domain `MilestoneEscrow`/`1`/84532.
- `ViemEscrowService` (`src/modules/escrow/EscrowService.viem.ts`): the contract has a `getEscrow` / `getMilestones` / `withdrawable` read path.
  `listForAccount` uses a multicall scan over the newest ids. Every write runs simulate → sign → wait.
  Every signature first goes through biometric or PIN re-auth (`useEscrow`).
  ERC-20 funding asks for the allowance and sends approve when needed, then fund; one auth prompt covers both.
- approveBySig: the EIP-712 `ApproveMilestone(uint256 escrowId,uint256 index,uint256 amount,uint256 sigDeadline)` hash
  matches the on-chain `approvalDigest`, and a unit test pins that vector.
- Screens: `/escrow` (lists mine and shows the withdrawable balance), `/escrow/create`, `/escrow/[id]` (fund/submit/approve/claim/dispute/cancel/refund),
  and `/escrow/withdraw`.
- Live write tests have not run: there are no faucet funds on this box.
