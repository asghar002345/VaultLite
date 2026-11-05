# VaultLite UI v2 plan (reference-independent phase)

Visual styling (colours, type, radii, imagery) will be re-done once Hammad's reference images arrive. This phase does only the structural work, and keeps every visual decision in tokens so the reference pass mostly touches `src/constants/theme.ts`.

## 1. Information architecture

```
(tabs)
  home         balances, hero, filter, quick actions (Send, Receive, Scan, Connect)
  activity     history (sent + received)
  escrow       my escrows + withdrawable
  settings     hub (new)
stack
  token/[chain]/[address]
  receive
  send/index → send/review (hold to confirm) → send/status/[hash]
  tokens/add
  scan
  walletconnect/index          sessions list (+ "Connect a dApp")
  walletconnect/pair           paste / scan a wc: URI (new)
  walletconnect/[topic]        session detail: peer, chains, methods, accounts, expiry, disconnect (new)
  walletconnect/request        full-screen review for complex requests: eth_sendTransaction, eth_signTypedData*, tron_signTransaction (new)
  escrow/create
  escrow/[id]                  detail + action list
  escrow/[id]/action           one action per screen: summary → confirm (re-auth) → result (new)
  escrow/withdraw
  settings/networks            per-chain RPC health + show/hide on home (new)
  settings/appearance          theme: system / dark / light (new)
  settings/currency            display currency explanation (testnets have no price feed; stablecoins valued at $1) (new)
  settings/security            hub: change PIN, biometrics, auto-lock, reveal recovery phrase (new)
  settings/security/pin        change PIN: current → new → confirm (new)
  settings/security/reveal     re-auth → phrase (blurred until held, FLAG_SECURE) (new)
  settings/about               version, build, links, licences, testnet notice (new)
sheets (light only)
  WC session proposal          one decision (approve/reject) with risk notes
  WC quick request             personal_sign / eth_sign style messages that fit one screen
  ConfirmSheet                 generic destructive confirm (disconnect, reset wallet, clear history)
```

**Rule:** a sheet is used only when there is a single decision with one or two facts on it. Anything with a decoded payload, fee choice or multi-step progress gets a screen.

## 2. Flows

- **Send:** form → review (fee tier, totals, re-auth via PIN or biometrics) → hold to confirm → status (pending / confirmed / failed / replaced, with speed-up and cancel). Already implemented; v2 changes are the state kit, icons and responsive width.
- **WalletConnect:**
  - Home or Settings leads to Sessions.
  - Connecting: Connect → pair screen → paste or scan → proposal sheet.
  - Requests are routed by kind: `message` → quick sheet; `typed_data` / `send_tx` / `tron_tx` → `walletconnect/request` screen.
  - Requests live in a shared queue store, so a dismissed sheet or screen can be re-opened from the sessions list ("1 pending request").
- **Escrow:** list → create → detail → action screen. The action screen has three steps:
  - **Summary:** what happens, the amounts, and who receives the funds.
  - **Confirm:** re-auth plus a type-specific warning for cancel, dispute and refund.
  - **Result:** success with the tx hash and explorer link, or an error with retry.
- **Security:**
  - Change PIN: verifies the current PIN, re-encrypts the vault with the new PIN, and rewraps the biometric key.
  - Biometrics toggle: requires the PIN.
  - Auto-lock timer: immediately / 30 s / 1 min / 5 min / 15 min after backgrounding.
  - Reveal recovery phrase: needs the PIN; the phrase auto-hides on blur.

## 3. Icon set

- **lucide-react-native**, one family. Stroke width 2, sizes 16 / 20 / 24 only.
- Rendered through a single `<Icon name>` wrapper (`src/components/icon.tsx`) that maps semantic names (`send`, `receive`, `success`, `danger`, `pending` …) to Lucide glyphs and theme colours. Screens never import Lucide directly.
- Every emoji and unicode glyph used as an icon gets replaced.

## 4. State kit (`src/components/states.tsx`)

- **`LoadingState`:** skeleton rows or a spinner with a label.
- **`EmptyState`:** icon, title, body, optional action.
- **`ErrorState`:** icon, humanised message, Retry action. Takes the error and an `onRetry`.
- **`SuccessState`:** burst or check, title, body, actions.
- **`Notice`:** inline info / warning / danger / disabled-reason row, with an icon.
- **`ConfirmSheet`:** destructive confirm, works on web too (replaces `Alert.alert`).
- **Field:** a label + input + helper + error line so all forms share the same layout.

Every screen must render one of these for each applicable state from the audit table.

## 5. Responsive primitives (`src/components/layout.tsx`)

- **Breakpoints:** `compact` < 360 dp, `regular` < 600 dp, `medium` < 900 dp, `expanded` ≥ 900 dp. The `useBreakpoint()` hook also exposes `landscape`.
- **Content width:**
  - `Screen` centres content at `MaxContentWidth` (560) by default.
  - `wide` screens (home, activity) go up to 960 and get a 2-column token grid from `medium` up.
- **Safe areas:** `Screen` owns the insets. Tab screens get the bottom padding from the tab bar's measured height (a shared constant), not a magic number.
- **Landscape:**
  - On phones in landscape, the tab bar becomes compact (icons only).
  - Welcome and lock switch from vertical centring to a scrollable layout.
- **Type:** the hero and title sizes scale down one step on `compact`.

## 6. Forms, confirmations and errors

- **Fields:** every input sits in a `Field` with a label above, helper text, and an error below in danger colour with an icon. Fields are validated on blur or as you type.
- **Primary action:** at the bottom of the form, disabled with a `Notice` that explains why when the reason isn't obvious.
- **Re-auth:** a single `ReauthField` (PIN entry when biometrics are off, otherwise nothing; biometrics prompt on submit).
- **Errors:** always go through `humanizeError`, with Retry where the action is idempotent (reads); writes show the error and keep the form state.

## 7. Theming hooks for the reference pass

- **New tokens:** `scrim`, `qrInk`, `qrPaper`, plus `alpha(color, a)` instead of string concatenation.
- **Theme preference:** system / dark / light, stored in app settings and read by `useTheme()`.

## 8. Out of scope for this phase

Final colours, typography choice, illustration and imagery, and the aurora tuning. These wait for the references. No EAS build until the reference pass is done.
