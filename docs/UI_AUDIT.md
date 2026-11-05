# VaultLite UI audit (branch `ui/redesign` → baseline for `ui/v2`)

Audited on 2026-10-27 against `ui/redesign@d6009eb`. The legend for the State column is in the next section; ✗ marks a gap.

## 1. Routes, sheets and their states

| route / surface | purpose | loading | empty | error | disabled | success | notes |
|---|---|---|---|---|---|---|---|
| `/` (index) | Redirects by session status | – | – | – | – | – | Renders nothing until the session loads; fonts gate the splash. |
| `/welcome` | Entry point: create or import | – | – | – | – | – | Aurora backdrop. |
| `/create` | Show the 12-word phrase | – | – | ✗ | "I wrote it down" until revealed | – | Phrase is not hidden again when leaving or backgrounding (the screen is FLAG_SECURE, but there is no re-blur). |
| `/verify` | Quiz on 3 words | – | – | inline text | Continue until all picked | – | Redirects to `/welcome` if no pending secret. |
| `/import` | Paste a mnemonic or private key | – | – | inline | Continue | – | |
| `/security` (onboarding) | Set PIN and biometrics | "Encrypting…" label | – | inline | – | – | Uses the name `security`, which collides conceptually with the planned security hub. |
| `/lock` | Unlock with PIN or biometrics | busy label | – | inline + shake | Unlock until 6 digits | – | "Reset wallet" uses `Alert.alert`, which does nothing on web: a dead end. |
| `(tabs)/home` | Balances, filter, entry points | skeletons | ✗ (all zero looks identical to "no tokens") | inline text, no retry | WalletConnect when not configured | – | Footer is a grab-bag (add token, WC, lock). No settings entry. |
| `(tabs)/activity` | Sent + received history | caption text only | "No activity yet." | per-source caption, no retry | – | – | "Refresh" and "Clear" buttons sit at the bottom of a long list. |
| `(tabs)/escrow` | My escrows + withdrawable balance | skeleton | caption | inline, no retry | – | – | |
| `/escrow/create` | Create a USDC escrow | busy label | – | inline | until valid | navigates to detail | PIN field appears inline when biometrics are off. |
| `/escrow/[id]` | Escrow detail + every action as buttons | "Loading…" text | "Escrow not found" | inline | buttons while busy | burst + last tx hash | 8 different actions on one screen. Destructive ones (cancel, dispute, refund) have no confirm step. |
| `/escrow/withdraw` | Pull-payment withdraw | "…" | ✗ (button just disabled at 0) | inline | at 0 | navigates back | |
| `/token/[chain]/[address]` | Token detail | skeleton | – | "Unknown token" | – | – | No history for the token. Remove only for custom tokens. |
| `/receive` | QR + address per family | – | Solana note | – | – | "Copied ✓" text | Emoji/glyph check mark. |
| `/send` | Form: asset, recipient, amount | – | ✗ no assets | inline "Invalid amount" | Review | – | Asset chips scroll horizontally; on small phones, long names truncate. |
| `/send/review` | Fee tier, totals, hold to send | fee skeleton | – | inline | hold until fee/affordable/auth | navigates to status | PIN inline. |
| `/send/status/[hash]` | Live status, speed up/cancel | pending label | – | reason text | – | burst | Back is hidden on purpose; "Done" exits. |
| `/tokens/add` | Import a custom ERC-20/TRC-20 | verify busy | – | inline | Add until verified | navigates back | |
| `/walletconnect` | Pair (paste/scan) + sessions list + disconnect | ✗ (init is silent) | "None" | caption, no retry | Connect | "Waiting for proposal…" | Pairing, list and detail are crammed into one screen. Disconnect has no confirm. Session detail (methods, accounts, expiry) is not shown. |
| `/scan` | Camera QR (address or WC) | "Checking camera permission…" | – | caption | – | navigates back | Camera is unavailable on web; the message is fine. |
| Proposal sheet (`WalletConnectHost`) | Approve/reject a session proposal | – | – | inline | Approve if unsupported chain or scam | closes | Hand-rolled modal with emoji risk icons (⛔ ⚠️). |
| Signing sheet | Every WC request: personal_sign, typed data, sendTx | fee preview | – | inline | approve until auth | haptic + close | Complex requests (EIP-712 trees, sendTx with fees/decoded calls) are squeezed into a 560 px scroll inside a modal. They deserve a full screen. |

**Legend.** "–" means the state doesn't apply; "✗" means the state applies but is missing.

## 2. Navigation gaps and dead ends
- **No settings or security area.** You cannot change the PIN, toggle biometrics, choose the auto-lock time, reveal the recovery phrase, pick a theme or see network status.
- **Auto-lock** is hard-wired to "lock on background", with no timer.
- **Reset wallet** uses `Alert.alert`, a no-op on web. Destructive actions (WC disconnect, escrow cancel/dispute, clear history) have no consistent confirmation.
- **WalletConnect:** there is no session detail screen, and incoming requests can only be seen in the sheet. If the sheet is dismissed by the OS, the request is lost.
- **Escrow actions** all run in place with no review step, and there's no visible place to see what the action will do.
- **Home's footer** is the only route to WalletConnect and custom tokens, and it's buried below the token list.

## 3. Placeholder or stub UI
- `StubEscrowService` still ships (unused by screens). Fine as a fallback, but it isn't wired.
- The home caption "Testnets" next to the wordmark is filler.
- "Currency" is implicit: test stablecoins are valued at $1 and nothing explains that outside the hero caption.

## 4. Icon inconsistency
Glyphs and emoji are mixed with no icon family:
- `◆ ≋ ⧉` in the tab bar.
- `↗ ↙` in the home buttons.
- `◌ ✓ ✕ ↺` in tx rows.
- `✓` in the burst.
- `⛔ ⚠️` in risk lists.
- `↓` for incoming.
- "Copied ✓".

They render differently per platform and font, can't be tinted consistently, and some (emoji) ignore the theme colour.

## 5. Responsiveness
- **No max content width.** On tablets and web, cards and buttons stretch to 1000 px or more.
- **No breakpoints.** The token list could be two columns on wide screens; the hero font (52) is fixed.
- **Landscape:** the floating tab bar covers about 25 % of the height on phones. ScrollViews work, but the welcome and lock screens centre content into a short viewport and buttons overflow.
- **Small phones (320 px):** the testnet banner pill nearly fills the width, the hero with 2 side-by-side buttons is tight, and the chain filter labels get truncated.
- **Safe areas:** handled by `SafeAreaView` per screen, but the tab bar's bottom inset is computed separately, and the inner screens' bottom padding (120) is a magic number.

## 6. Things that still look generic
- Stack headers are default React Navigation headers (title + arrow) with only the font swapped.
- Forms are plain stacked inputs with no labels, no helper text and inconsistent error placement (some above the button, some below).
- Cards are uniform rounded rectangles everywhere: list rows, info blocks and the risk list all look the same.
- Empty states are a single grey caption.

## 7. Theming readiness
- Colours, radii, spacing and fonts are centralised in `src/constants/theme.ts`, and motion lives in `src/motion`. That part is ready to retheme.
- Hardcoded exceptions:
  - QR paper colour `#F6F3EC` and ink `#07080C` in `receive.tsx`.
  - Modal backdrop `#000A` / `#0008`.
  - Hex alpha suffixes appended inline (`+ '1A'`).
  - These should become tokens (`qrPaper`, `qrInk`, `scrim`) plus an `alpha()` helper.
