import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, type TextStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatFixed } from '@/lib/format-fixed';
import { Durations, Easings, useMotion } from '@/motion';

export { formatFixed };

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Count-up number. Native: text is updated on the UI thread via animated `text` prop — no
 * React re-renders per frame. Web: falls back to throttled JS state. Reduced motion: no tween.
 */
export function AnimatedNumber({ value, decimals = 2, prefix = '', style, testID, accessibilityLabel }: { value: number; decimals?: number; prefix?: string; style?: TextStyle | TextStyle[]; testID?: string; accessibilityLabel?: string }) {
  const { reduced } = useMotion();
  const sv = useSharedValue(reduced ? value : 0);
  const [webText, setWebText] = useState(formatFixed(reduced ? value : 0, decimals, prefix));
  useEffect(() => {
    sv.set(reduced ? value : withTiming(value, { duration: Durations.count, easing: Easings.out }));
  }, [value, reduced, sv]);
  useAnimatedReaction(
    () => (Platform.OS === 'web' ? formatFixed(sv.get(), decimals, prefix) : null),
    (txt, prev) => {
      if (txt !== null && txt !== prev) runOnJS(setWebText)(txt);
    },
  );
  const animatedProps = useAnimatedProps(() => {
    const text = formatFixed(sv.get(), decimals, prefix);
    return { text, defaultValue: text } as never;
  });
  if (Platform.OS === 'web') {
    return (
      <Text testID={testID} accessibilityLabel={accessibilityLabel} style={style}>
        {webText}
      </Text>
    );
  }
  return (
    <AnimatedTextInput
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      editable={false}
      underlineColorAndroid="transparent"
      defaultValue={formatFixed(value, decimals, prefix)}
      animatedProps={animatedProps}
      style={StyleSheet.flatten([{ padding: 0 }, style])}
    />
  );
}
