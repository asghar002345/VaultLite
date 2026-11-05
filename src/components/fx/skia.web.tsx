import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { ComponentProps } from 'react';

import type { SuccessBurst as BurstT } from './burst';
import type { HoldRing as RingT } from './hold-ring';

/**
 * Web: Skia's JS API binds to CanvasKit at import time, so Skia components must be imported only
 * after the wasm has loaded. WithSkiaWeb loads CanvasKit (served from /canvaskit.wasm) and then
 * code-splits the component in.
 */
const opts = { locateFile: (f: string) => `/${f}` };

export function SuccessBurst(p: ComponentProps<typeof BurstT>) {
  return <WithSkiaWeb opts={opts} getComponent={(() => import('./burst').then((m) => ({ default: m.SuccessBurst }))) as never} componentProps={p} fallback={null} />;
}
export function HoldRing(p: ComponentProps<typeof RingT>) {
  return <WithSkiaWeb opts={opts} getComponent={(() => import('./hold-ring').then((m) => ({ default: m.HoldRing }))) as never} componentProps={p} fallback={null} />;
}
