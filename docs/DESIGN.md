# VaultLite design: "Obsidian Aurora"

VaultLite should feel like a slab of polished obsidian with an aurora moving underneath it. The base is dark, warm and quiet. Living light (mint, ultraviolet and ember) appears only where value or intent is: the balance hero, confirmations and the active selection.
Everything else stays matte, so the eye goes straight to the light. The light theme uses the same idea on warm paper ("Aurora on Paper").

## 1. Colour tokens (`src/constants/theme.ts`)

| token | dark (default) | light | use |
|---|---|---|---|
| `background` | `#07080C` ink | `#F6F3EC` paper | screen |
| `surface` | `#10131B` | `#FFFFFF` | cards, inputs |
| `surfaceRaised` | `#171B26` | `#EFEAE0` | sheets, pressed rows |
| `border` | `#232838` | `#E0D9CB` | hairlines |
| `text` | `#F4F1EA` bone | `#12131A` | primary text |
| `textSecondary` | `#8E95A7` | `#5D6170` | captions |
| `primary` | `#5CF2C4` aurora mint | `#0E9F79` | primary actions, success |
| `onPrimary` | `#03130D` | `#FFFFFF` | text on primary |
| `accent` | `#8B7CFF` ultraviolet | `#5B4BE8` | focus, selection, ring |
| `accentWarm` | `#FF8A5C` ember | `#E2622F` | highlights, burst particles |
| `danger` | `#FF5D73` | `#D7263D` | destructive actions, risk |
| `warning` | `#FFC857` | `#B7791F` | testnet banner, warnings |
| `success` | `#5CF2C4` | `#0E9F79` | confirmed transactions |

- **Chain hues** (token orbs): Sepolia `#8B7CFF`, Amoy `#B07CFF`, BSC `#FFC857`, Base `#4C8DFF`, Nile `#FF5D73`, Solana `#5CF2C4`.
- **Dark-first:** the app is dark unless the OS explicitly reports light.

## 2. Typography

The fonts are loaded with `expo-font` and `@expo-google-fonts/*`. The splash screen stays up until the fonts are ready.

- **Display:** Space Grotesk 700. Its quirky geometric shapes set the character. Used for the hero balance, screen titles and the wordmark.
- **UI:** Inter 400/500/600. Neutral and very legible at small sizes.
- **Numbers:** Inter with `fontVariant: ['tabular-nums']`, so amounts and the count-up never jitter.
- **Mono:** JetBrains Mono 500 for addresses, hashes and the recovery phrase.

The type scale is caption 12, body 16, label 14, title 24 and hero 44, with tighter tracking on the display face.

## 3. Motion style (`src/motion`)

- **Springs:**
  - `snappy` (damping 18, stiffness 320) for presses and toggles.
  - `gentle` (damping 16, stiffness 160) for layout changes and indicators.
  - `bouncy` (damping 10, stiffness 180) for celebrations only.
- **Durations:**
  - `fast` 140 ms for fades.
  - `base` 240 ms for entrances.
  - `slow` 420 ms for the hero.
  - `count` 900 ms for the balance count-up.
- **Easing:** `out` = cubic-bezier(0.2, 0.8, 0.2, 1). Use `inOut` for loops.
- **Rules:**
  - Everything runs on the UI thread (Reanimated shared values, Skia uniforms). No `setState` per frame; the one exception is web, where the count-up text falls back to JS.
  - Entrances are staggered at 40 ms, with a maximum of 8 steps.
- **Reduced motion:**
  - `useMotion().reduced` combines Reanimated `useReducedMotion()`, which reads the OS setting.
  - With reduced motion on, springs become 0 ms or fade-only timings, loops stop on their first frame, the count-up jumps to its final value, and the burst is replaced by a fade.
  - Haptics stay on, because they are not motion.

## 4. Screens to restyle

| screen | treatment |
|---|---|
| Onboarding (welcome/create/verify/security/import) | Full-bleed aurora backdrop, display wordmark, staggered copy. Recovery words appear as mono chips that cascade in. |
| Lock | Breathing aurora orb, 6 PIN dots that fill with a spring, and a shake plus error haptic on a wrong PIN. |
| Home | Balance hero card with an animated Skia aurora mesh and a count-up total. Chain filter pills with a sliding indicator. Token rows with chain orbs and a staggered spring entrance. |
| Token detail | A "shared-element-like" header: the orb and symbol spring in from the row's scale and position feel (zoom + fade). These are not true shared transitions. |
| Send / Review | Amount in large tabular display numerals. The hold-to-confirm ring (Skia arc) fills under the thumb with haptic ticks. |
| Send status | Pending pulse, then a success burst (Skia particles) and a success haptic, or a danger shake on failure. |
| Signing sheet (WalletConnect) | A custom bottom sheet that springs up over a fading backdrop. Risk items enter staggered. |
| Escrow | Milestone timeline with status dots. Actions use the same button system. |
| Activity | Grouped rows with staggered entrance and status chips. |
| Receive | QR on a paper card with a slowly rotating aurora border glow. Copy gives a check morph and a haptic. |
| Tab bar | Custom floating bar (Home, Activity, Escrow) with a spring-sliding pill indicator. |

## 5. Animation list (each with its haptic)

| # | animation | implementation | haptic | reduced motion |
|---|---|---|---|---|
| 1 | Balance count-up | `withTiming` shared value; animated `TextInput` text prop (UI thread) | none | jumps to final value |
| 2 | Aurora mesh hero | Skia `Canvas`: three blurred radial gradients orbiting on `useClock` | none | static frame |
| 3 | Token entrance + press | `FadeInDown.springify()` stagger; press scale 0.97 | `selection` on press | fade only, no scale |
| 4 | Token "shared-element-like" header | `ZoomIn.springify()` on orb + `FadeInUp` on title | `impactLight` on open | fade |
| 5 | Hold-to-confirm ring | Skia `Path` arc, `end` = progress shared value | light on start, ticks at 33/66 %, success at 100 % | ring still fills (it is information); no glow pulse |
| 6 | Success burst | 18 Skia particles, radial spring outward + fade | `notificationSuccess` | single fade-in check |
| 7 | Skeleton shimmer | translating highlight band (Reanimated) | none | static block |
| 8 | Tab / filter indicator | absolute pill; `withSpring(gentle)` on x/width | `selection` | instant move |
| 9 | Sheet spring | `SlideInDown.springify()` + backdrop fade | `impactMedium` on open, `warning` on reject | fade |
| 10 | PIN dots + shake | dot scale spring; `withSequence` x-shake | light per digit, `notificationError` on wrong | no shake, colour only |
| 11 | Button press | scale 0.96 snappy spring | light (danger = medium) | no scale |
| 12 | Receive glow / copy | rotating sweep gradient; check morph | `notificationSuccess` on copy | static border |

## 6. Libraries

- **Reanimated 4** (installed) handles everything except gradients and shaders.
- **@shopify/react-native-skia** was added with `npx expo install`, which picked a version compatible with SDK 58. It draws the aurora mesh, the hold ring and the burst particles: GPU work driven directly by shared values.
  - On web, `LoadSkiaWeb()` (CanvasKit wasm) runs before first render.
- **Not used:**
  - **Lottie:** the effects are generative, so there is no designer-made asset to play.
  - **Moti:** a wrapper around Reanimated 4 that we don't need.

## 7. Implementation notes

- Motion lives in `src/motion/index.ts`: presets, the haptic vocabulary and `useMotion()`. The pure tokens are in `src/motion/tokens.ts`.
- The effects are in `src/components/fx/`: `aurora`, `hold-ring`, `burst` (Skia), `pulse` and `animated-number`.
- Screens import Skia effects through `fx/skia(.web).tsx`.
  - On native this is a direct re-export.
  - On web, `WithSkiaWeb` loads CanvasKit first and then code-splits the component in. Skia's JS API binds to CanvasKit at import time, so the import has to come after the load.
- Web-only shims, used only for the preview and screenshot build:
  - `secure-store-kv.web.ts` keeps the vault in memory; nothing is persisted.
  - `use-secure-screen.web.ts` is a no-op.
- `npm run export:web` copies `canvaskit.wasm` into `public/`. That file is gitignored.
- On web, `Link asChild` forwards `style` straight to `<a>`, so link children must receive flattened styles.
- The tab bar is a custom floating bar for Home, Activity and Escrow. The URLs are unchanged: `/activity` and `/escrow` moved into the `(tabs)` group.

## 8. Verification

Screenshots are produced by driving the real app on Expo web with headless Chromium (Playwright). Device behaviour, meaning haptics, native frame pacing and Android blur, has not been verified on hardware.
