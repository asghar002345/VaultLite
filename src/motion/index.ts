import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  useReducedMotion,
  ZoomIn,
} from 'react-native-reanimated';

import { Durations, Springs, staggerDelay } from './tokens';

export { Durations, MAX_STAGGER, STAGGER_MS, Springs, staggerDelay } from './tokens';

export const Easings = { out: Easing.bezier(0.2, 0.8, 0.2, 1), inOut: Easing.inOut(Easing.quad) } as const;

/** Haptics vocabulary — no-ops on web. */
const on = Platform.OS !== 'web';
export const haptic = {
  selection: (): void => {
    if (on) void Haptics.selectionAsync();
  },
  light: (): void => {
    if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  medium: (): void => {
    if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  success: (): void => {
    if (on) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  warning: (): void => {
    if (on) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
  error: (): void => {
    if (on) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};

/**
 * Central motion hook. `reduced` reflects the OS reduce-motion setting; every preset
 * degrades to a short fade (or nothing) when it is on.
 */
export function useMotion() {
  const reduced = useReducedMotion();
  return {
    reduced,
    /** List/stagger entrance. */
    enter: (i = 0) =>
      reduced ? FadeIn.duration(Durations.fast) : FadeInDown.delay(staggerDelay(i)).springify().damping(Springs.gentle.damping).stiffness(Springs.gentle.stiffness),
    /** Hero/orb pop for "shared-element-like" headers. */
    pop: () => (reduced ? FadeIn.duration(Durations.fast) : ZoomIn.springify().damping(Springs.snappy.damping).stiffness(Springs.snappy.stiffness)),
    sheet: () => (reduced ? FadeIn.duration(Durations.fast) : SlideInDown.springify().damping(Springs.gentle.damping).stiffness(Springs.gentle.stiffness)),
    fade: () => FadeIn.duration(reduced ? 0 : Durations.base).reduceMotion(ReduceMotion.Never),
    exit: () => FadeOut.duration(Durations.fast),
  };
}
