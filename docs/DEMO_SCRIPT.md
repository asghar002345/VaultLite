# VaultLite demo video: shot list (≈ 2:45)

Record on an Android emulator or phone running the **preview APK**, with a wallet pre-funded from testnet faucets (Sepolia ETH + USDC, Nile TRX + USDT). Use a throwaway mnemonic, **never** the public test phrase on camera with real intent, and never a real wallet.
Screen-capture protection blanks the secret, PIN and signing screens on Android. For those shots, either use a debug build with `useSecureScreen` disabled or voice over a title card ("screen protected").

| # | Time | Shot | On screen / action | Voice-over (suggested) |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Title card | "VaultLite · testnet-only multi-chain wallet demo" + TESTNET warning | "VaultLite is a self-custodial wallet demo. Testnets only, no real funds." |
| 2 | 0:10–0:30 | Onboarding | Welcome → Create → (protected) phrase → quiz → set PIN + biometrics | "Keys are created on-device. The phrase is encrypted with your PIN and never leaves the phone." |
| 3 | 0:30–0:50 | Home | Total, chain chips (filter Sepolia → Nile → Solana), pull-to-refresh with skeletons | "One wallet across four EVM testnets, Tron Nile and Solana Devnet." |
| 4 | 0:50–1:00 | Receive | EVM QR → switch to Tron → copy (haptic) | "Same EVM address on every EVM chain; separate Tron and Solana addresses." |
| 5 | 1:00–1:35 | Send USDC on Sepolia | Send → Scan a printed `ethereum:` transfer QR → review: fee tiers slow/normal/fast → hold-to-confirm → biometric | "Scan a payment request, pick a fee tier, hold to confirm, then biometrics." |
| 6 | 1:35–1:50 | Status + speed-up | Pending → tap Speed up → Confirmed; open explorer | "Stuck? Speed it up or cancel with the same nonce." |
| 7 | 1:50–2:00 | Tron fee | Send TRC-20 USDT on Nile → review shows bandwidth/energy breakdown | "Tron fees are shown as the bandwidth and energy actually burned." |
| 8 | 2:00–2:30 | WalletConnect | Scan the Reown sample dApp QR → connect → `personal_sign` → then an **unlimited approve** request: red risk banner, hold-to-approve → Reject (dApp shows 4001) | "Every request is decoded. Unlimited approvals and unverified domains are flagged before you sign." |
| 9 | 2:30–2:40 | Activity | Sent + received list, toggle "show likely spam" | "History merges your sends with incoming transfers, with spam and address poisoning filtered out." |
| 10 | 2:40–2:45 | Outro | Repo link, "testnets only · not audited" | "Code and docs on GitHub. Testnets only." |

## Prep checklist
- [ ] Preview APK installed; `EXPO_PUBLIC_REOWN_PROJECT_ID` set via EAS env (not visible on screen)
- [ ] Wallet funded: Sepolia ETH/USDC, Nile TRX/USDT, Devnet SOL (optional)
- [ ] Printed or second-screen QR: `ethereum:0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238@11155111/transfer?address=<recipient>&uint256=1e6`
- [ ] Reown sample dApp open on a laptop, with the unlimited-approve request prepared
- [ ] For shot 6, send with the *slow* tier during congestion, or set a deliberately low fee, so it stays pending
- [ ] Do Not Disturb on, 1080p capture, show touches enabled
