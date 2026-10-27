# VaultLite v3 — comparison with Stitch v3 references

Reference: `vaultlite-refs/stitch-v3/*.png`. Composites (before v2 | after v3 | reference): `vaultlite-shots/v3/compare/` (regenerate with `make.sh`). Shots: `vaultlite-shots/v3/`.

Global: palette (#0B0C0E / #141619 / #262A30, bone text, brass #C8A46A, danger #C4574B), Instrument Serif numerals/titles, Geist UI, Geist Mono addresses, 24px margins, 8pt grid, hairline cards, guilloché hero motif (6% opacity). Aurora, mint, violet removed.
**Dark-only by design** — the refs enforce "Vault Dark"; `useTheme` always returns the vault palette; Appearance screen states it. Motion is light and honours reduce-motion (`useMotion`).

**Dropped everywhere as invented/fake:** HSM/enclave badges, multisig/signers, "Audited", safe ratio, 24h delta, sync stats, nonce/bytecode labels, fiat conversions for testnet tokens, faucet banner, Markets tab, avatar/vault switcher.

| # | Screen | Matches | Deliberately differs (why) |
|---|---|---|---|
| 01 | Home | Header wordmark + testnet pill, single guilloché total hero, 3 quick actions (Send/Receive/Escrow), "Assets · View all" with max 4 rows, flat 4-tab bar | No fiat/24h/safe-ratio/HSM/faucet cards (not real data); tabs are Home/Activity/Connect/Settings per brief (no Markets); "View all" opens a real full list (`/tokens`) |
| 02 | Token detail | Serif holding hero, grouped detail rows, Receive/Send pair | No price chart/fiat (testnet tokens have no price); explorer/faucet/remove kept as ghost links (real config) |
| 03 | Send amount | Serif amount sized to content, Max, numeric keypad | Recipient + token fields stay on same screen (existing validated flow) |
| 04 | Send review | Outbound transfer hero, grouped Recipient/From/Network, fee section, hold-to-confirm | Shown as a full screen, not a sheet; real EIP-1559 fee tiers; PIN confirm kept (existing security); no "MPC"/"air-gapped" copy. Shot shows fee estimate error because the wallet is unfunded |
| 05 | Danger review | Danger block, CONTRACT tag, "I understand the risk" checkbox, danger hold button | Driven by a real `getCode` bytecode check; no fake bytecode-match/nonce labels |
| 06 | Receive | Framed QR on bone paper, mono address well, Copy/Share | Network chip from real chain list |
| 07 | Activity | Filter pills, day-grouped sections, serif amounts | Empty in shots (fresh wallet) |
| 08 | WalletConnect | Proposal sheet: peer card, account/networks group, scopes, Reject/Approve | Scopes derived from requested methods (no invented risk scores). Sheet needs a live dApp, so composite shows the Connect tab |
| 09 | Escrow | Reference header, locked/released hero, milestone timeline, settlement group, one primary action | Reached from Home quick action + Settings (not a tab). Detail shot shows "not found" — fresh wallet has no escrow |
| 10 | Settings/Security | Grouped hairline sections, Security first, Lock/Reset at end | No HSM/signers/enclave rows; only real settings |
| 11 | PIN lock | Monogram, serif "Enter PIN", 6 dots, round keypad, biometrics key, Forgot PIN? | Monogram only (no header/HSM footer) per brief; auto-submits at 6 digits; no letter sub-labels |

Caveats: WalletConnect proposal, escrow detail with data, and funded send flows can't be captured without a live dApp/funds; logic for them is unchanged and unit-tested.
