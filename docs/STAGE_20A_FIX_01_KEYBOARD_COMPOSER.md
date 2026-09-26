# Stage 20-A Fix 01: Android keyboard / chat composer inset

## 1. Original problem
On the real Android device, tapping the chat composer opened the keyboard and left the composer too low in the layout. The input area was partially obscured and the send action was no longer comfortably reachable.

## 2. Root cause
The root app layout was adding an Android bottom inset by measuring screen height vs. window height and applying it as a global bottom padding. That approach treated a keyboard change as a static layout inset rather than using the keyboard-aware behavior supplied by React Native.

The direct chat screen was also using `KeyboardAvoidingView` with Android behavior set to `height`, which can shrink the layout instead of offsetting it correctly when the keyboard opens. Combined, this left the composer close to the lower edge and partially covered by the soft keyboard.

## 3. Files changed
- `App.tsx`
- `src/screens.tsx`
- `package.json`
- `scripts/chat-keyboard-composer-contract-test.cjs`

## 4. Fix approach
- Removed the hard-coded Android root bottom padding hack.
- Switched the active chat composer containers to `KeyboardAvoidingView` with `behavior="padding"` so the keyboard offset is driven by the platform inset instead of a fixed manual offset.
- Kept the chat content area keyboard-aware with interactive dismiss and padded bottom spacing.
- Added stable test IDs for the message input and send action for automation and regression checks.

## 5. Android device evidence
Real-device validation was performed on the connected Motorola Android device.

After tapping the open chat and focusing the composer, the live view hierarchy showed:
- input: `chat-message-input`
- text: `Test keyboard`
- bounds: `[282,1483][881,1646]`
- send control remained visible and in the same composer area

This confirms the text entry field remained visible above the keyboard instead of being covered by it.

## 6. Keyboard-open result
The input remains visible while the keyboard is open, the latest typed text stays in view, and the composer remains aligned above the keyboard. The send control remains reachable without requiring a manual layout jump.

## 7. Keyboard-dismiss result
When the keyboard is dismissed, the composer returns to its normal anchored bottom position and the message list remains usable.

## 8. Android Back result
The default Android back behavior is preserved: a soft keyboard dismissal occurs first when the text input is focused, and the app does not immediately exit the chat flow. Once the keyboard is dismissed, normal back navigation resumes.

## 9. Automation result
A focused regression contract was added at:
- `scripts/chat-keyboard-composer-contract-test.cjs`

This asserts that:
- Android keyboard layout mode is `resize`
- chat composer uses keyboard-aware padding behavior
- the input and send control expose stable IDs
- interactive keyboard dismiss is enabled

## 10. Remaining limitations
- Native keyboard geometry is still device- and IME-dependent, so exact pixel-perfect comparisons remain manual Android checks.
- This fix is intentionally limited to the composer/keyboard contract and does not modify provider, auth, camera, or other unrelated systems.

## 11. Regression result
Passed:
- `npm run test:chat-keyboard --silent`
- `npx tsc --noEmit`
- `npx expo lint --quiet`
- `npm run test:stage17 --silent`
- `npm run test:stage18 --silent`

Physical device check:
- Real Moto Android device accepted input in the composer while the keyboard was open.
- Composer and typed text remained visible.
