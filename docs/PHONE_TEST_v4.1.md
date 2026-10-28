# VaultLite v4.1 phone test (Pixel)

Build: EAS Android preview APK from `feat/binance-market`. **Testnets only.** Use a throwaway wallet or the public test mnemonic. Never use a real seed.
Mark each row **P** (pass) or **F** (fail) and add a note for every fail.

> **Note:** the Settings → Smart account screen lives on `feat/smart-account` (local, unmerged). It is **not** in a `feat/binance-market` build. Rows S1–S3 apply only to a build that includes that branch. Otherwise mark them N/A.

| # | Area | Steps | Expected | P/F |
|---|---|---|---|---|
| O1 | Onboarding: create | Fresh install → Create wallet → write the phrase → verify words → set a 6-digit PIN → enable biometrics if offered | Lands on Home with a TESTNET pill. No crash. Biometric prompt appears if enabled. | |
| O2 | Onboarding: import | Reset wallet → Import → paste the 12-word test phrase → PIN | Home shows the same EVM address as before the reset | |
| L1 | PIN unlock | Kill the app → reopen → enter the correct PIN on the keypad | Dots fill, then it submits automatically at 6 digits and opens Home | |
| L2 | Wrong PIN | Enter 000000 | Stays locked with an error. No Home flash. | |
| L3 | Biometric unlock | Kill → reopen → tap the face/fingerprint key (or wait for the auto prompt) → authenticate | Unlocks to Home. Cancelling falls back to the keypad. | |
| L4 | Auto-lock | Background the app longer than the auto-lock time → return | Lock screen shows. Wallet content is not visible in the app switcher. | |
| R1 | Pull-to-refresh: Home | Pull down on Home | Spinner shows and then clears. Balances and market rows update. No duplicate spinners. | |
| R2 | Pull-to-refresh: Markets | Home → Markets "See all" → pull down | Spinner clears. The freshness label resets to live/recent. | |
| R3 | Pull-to-refresh: Market detail | Open BTC/USDT → pull down | Price and chart refresh. The selected range is kept. | |
| C1 | Chart ranges | On BTC/USDT, tap **1D, 1W, 1M, 1Y, 5Y** in turn (1W is the default) | Each tap dims the old chart with "Loading …", then the line, "<range> range" label, % change and H/L update. No blank flash. | |
| C2 | Rapid switching | Tap 1D→5Y→1M quickly | The final chart and label match the last pill tapped (1M) | |
| C3 | Live candle | Stay on 1D for about 1 min | The last point of the line moves (WebSocket kline) | |
| N1 | Offline: enter | On Markets, turn on airplane mode | An offline notice appears. Prices stay visible, labelled lagging/stale over time. No crash. No endless error loop. | |
| N2 | Offline: chart | While offline, switch to a range not yet viewed | An error with Retry, or an explicit message. **Must not** show the previous range's chart under the new label (see QA issue M1). | |
| N3 | Offline: pull | While offline, pull to refresh | The spinner ends within about 10–20 s. The app stays usable. | |
| N4 | Recovery | Turn airplane mode off | Within about 15 s the notice clears, prices go live again and the chart loads | |
| N5 | Offline cold start | Airplane on → kill → reopen → unlock | Unlock works offline. Home renders with cached or empty prices and a clear offline state. | |
| W1 | Receive | Home → Receive | The QR and mono address match Home. Copy shows a confirmation. Share opens the share sheet. | |
| W2 | Send review | Home → Send → paste a testnet address and a small amount → Review | Review shows the recipient, network and fee. With 0 balance, an insufficient-funds or fee error is shown. Nothing is broadcast without hold-to-confirm and PIN. | |
| W3 | Contract recipient | Send to a contract address (e.g. Sepolia USDC) → Review | The danger block and CONTRACT tag appear, and confirm is disabled until "I understand the risk" is ticked | |
| S1 | Settings → Smart account | Settings → Smart account | Shows counterfactual address, "Counterfactual" status, owner, factory and validator | |
| S2 | Bundler not configured | Same screen in a build without EXPO_PUBLIC_BUNDLER_PROXY_URL | A "Bundler not configured" notice is shown. Nothing can be sent. | |
| S3 | Address matches | Compare with the test owner's expected value when using the test mnemonic | 0x9fC283814D91Aa88fcA0C6c60d1e868b582ca0dd | |

Automated equivalents (USB, optional): `scripts/run-maestro-usb.sh` runs `.maestro/v41-unlock.yaml`, `v41-pull-to-refresh.yaml` and `v41-chart-ranges.yaml`. Biometrics, airplane mode and Share stay manual.

Tester: ______  Date: ______  Build/commit: ______  Android version: ______
