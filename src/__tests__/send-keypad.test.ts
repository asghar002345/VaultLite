/** Regression: Maestro run 6 (Pixel) — system keyboard from the recipient field stayed open over the
 * keypad amount field and hid the Review button. The amount input must dismiss it on focus. */
import { Keyboard } from 'react-native';

import { keypadInputProps } from '@/lib/keypad-input';

describe('keypadInputProps', () => {
  it('never opens the system keyboard and dismisses an already-open one on focus', () => {
    const dismiss = jest.fn();
    const p = keypadInputProps(dismiss);
    expect(p.showSoftInputOnFocus).toBe(false);
    p.onFocus();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('defaults to Keyboard.dismiss', () => {
    const spy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    keypadInputProps().onFocus();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
