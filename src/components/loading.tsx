import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Spinner, T } from '@/components/ui';
import { alpha, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic, useMotion } from '@/motion';

/**
 * Loading kit — the one way screens show progress:
 * - content: <LoadingState>/<Skeleton> (states.tsx) only when nothing is cached;
 * - submits: <Button loading> (inline spinner, disabled, single-flight);
 * - pull-to-refresh: usePullRefresh() → only user-initiated pulls spin;
 * - cached data refreshing in the background: <RefreshHint>;
 * - in-place content swaps (chart ranges): <LoadingOverlay>.
 * Reduced motion: spinners become a static clock glyph.
 */
export { Spinner };

/** Quiet "Updating…" line for cached data that is refreshing in the background. Renders nothing when idle. */
export function RefreshHint({ active, label = 'Updating…', testID = 'refresh-hint' }: { active: boolean; label?: string; testID?: string }) {
  const m = useMotion();
  if (!active) return null;
  return (
    <Animated.View entering={m.fade()} testID={testID} accessibilityLiveRegion="polite" style={s.hint}>
      <Spinner />
      <T variant="footnote">{label}</T>
    </Animated.View>
  );
}

/** Dims content in place and shows a centered spinner while its replacement loads (e.g. chart range switch). */
export function LoadingOverlay({ active, children, label = 'Loading', testID = 'loading-overlay' }: { active: boolean; children: ReactNode; label?: string; testID?: string }) {
  const t = useTheme();
  const m = useMotion();
  return (
    <View accessibilityState={{ busy: active }}>
      <View style={{ opacity: active ? 0.35 : 1 }}>{children}</View>
      {active ? (
        <Animated.View entering={m.fade()} testID={testID} accessibilityLabel={label} style={[StyleSheet.absoluteFill, s.overlay]}>
          <View style={[s.pill, { backgroundColor: alpha(t.surfaceRaised, 0.92), borderColor: t.border }]}>
            <Spinner />
            <T variant="footnote">{label}</T>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Pull-to-refresh that spins only for the user's pull (not for polling/background refetches).
 * `refetch` may return a promise; the indicator stays until it settles.
 */
export function usePullRefresh(refetch: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  const onRefresh = useCallback(() => {
    haptic.light();
    setRefreshing(true);
    Promise.resolve()
      .then(() => ref.current())
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);
  return { refreshing, onRefresh };
}

/** Themed RefreshControl bound to usePullRefresh. */
export function useRefreshControl(refetch: () => unknown) {
  const t = useTheme();
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const control = useMemo(() => <RefreshControl tintColor={t.primary} colors={[t.primary]} progressBackgroundColor={t.surfaceRaised} refreshing={refreshing} onRefresh={onRefresh} />, [t, refreshing, onRefresh]);
  return { refreshing, onRefresh, control };
}

const s = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  overlay: { alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, borderWidth: 1 },
});
