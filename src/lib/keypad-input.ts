import { Keyboard } from 'react-native';

/**
 * Props for a TextInput driven by the in-app Keypad. `showSoftInputOnFocus={false}` only stops the system
 * keyboard from OPENING on focus; it does not close one already open from a previous field (e.g. the
 * recipient input), which then covers the keypad and the Review button. Dismiss it on focus.
 */
export function keypadInputProps(dismiss: () => void = () => Keyboard.dismiss()) {
  return { showSoftInputOnFocus: false, onFocus: () => dismiss() } as const;
}
