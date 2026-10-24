# Integrations — where things plug in

VaultLite is **testnet-only**. Every chain lives in `src/config/chains.ts`; do not add mainnets.

## Environment (`.env`, untracked — copy `.env.example`)
| Var | Used by | Notes |
|---|---|---|
| `EXPO_PUBLIC_REOWN_PROJECT_ID` | `src/config/env.ts` | WalletConnect/Reown. Fallback: `app.json > expo.extra.reownProjectId`, else `REPLACE_ME`. |
| `EXPO_PUBLIC_ESCROW_ADDRESS_BASE_SEPOLIA` | `src/modules/escrow/deployments.ts` | MilestoneEscrow address, overrides the in-code placeholder. |
| `EXPO_PUBLIC_PIMLICO_URL_BASE_SEPOLIA` | `src/modules/smartAccount/config.ts` | Pimlico bundler + paymaster RPC. |

⚠️ `EXPO_PUBLIC_*` values are inlined into the JS bundle. That is fine for a Reown project id (public by design), but a Pimlico **API key** shipped in the app is extractable. For anything beyond a demo, proxy bundler/paymaster calls through a backend or use a restricted/sponsorship-policy key.

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
| Bundler / paymaster URL | same entry, from env (`https://api.pimlico.io/v2/84532/rpc?apikey=…`) |
| Interface | `types.ts` → `SmartAccountProvider` (`getAddress`, `isDeployed`, `buildUserOperation`, `sendUserOperation`, `waitForReceipt`) |
| Stub | `SmartAccountProvider.stub.ts` |

Suggested implementation: viem `account-abstraction` (`createBundlerClient`, `toSmartAccount`) or `permissionless` with a custom account matching the teammate's factory; `getAddress` via factory `getAddress(owner, salt)` / `getSenderAddress`; `factory`/`factoryData` only when `!isDeployed()`; paymaster via `pm_sponsorUserOperation` / ERC-7677 `pm_getPaymasterStubData`+`pm_getPaymasterData`. The escrow uses `msg.sender` only and ERC-1271 for signed approvals, so the smart account works as client/provider directly (see SPEC §10).

## WalletConnect (Day 2+)
Polyfills are loaded first in `index.js` → `src/polyfills.ts` (`react-native-get-random-values`, then `fast-text-encoding`). Add `@walletconnect/react-native-compat` there before other WC imports.
