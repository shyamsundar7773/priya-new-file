# Phase 1 — Chat Core + WhatsApp-Style UX Validation

Date: 2026-09-25

## PHASE 1 VERDICT

**PARTIAL**

## Chat UI/UX re-audit — 2026-09-25

This re-audit supersedes earlier claims that keyboard behavior was already validated. The frozen directory available in this checkout is `REFERENCE_READONLY` (the requested `REFERENCE\\_READONLY` path is not present). It was read-only during this audit. I compared `REFERENCE_READONLY/src/screens/ChatScreen.tsx` and the frozen captures `chat_dark_with_messages.png` and `chat_dark_scroll_arrow.png` with the current native Chat in `src/screens.tsx`.

### A. Frozen UX/UI audit

| Area | Expected from frozen reference | Current source audit | Result |
|---|---|---|---|
| Header | Back, 40px companion avatar/name/status, call and overflow actions | Same hierarchy and controls; 66px minimum row | PARTIAL — source/capture comparison only; live pixel comparison unavailable |
| Message area | Flexing conversation between header and composer; incoming/outgoing bubbles and timestamps | ScrollView already flexed, but relied on an incorrectly adjusted parent during keyboard display | PARTIAL — layout source corrected; Expo Go retest blocked |
| Composer | Attachment, camera, expanding message input, voice, send in one row above tabs | Existing controls retained; input remains multiline, max height 120px; send target retained | PARTIAL — source and contract checks pass; actual typing/send journey not retested |
| Floating latest control | 40px circular control near composer; visible only when away from latest | Retained `chat-jump-to-latest`; now anchored to the message viewport and tracks distance in both directions | PARTIAL — source/contract only; tap not retested |
| Bottom navigation | Visible below composer when keyboard is closed | Remains a sibling below Chat and retains its Android system inset | PARTIAL — prior report has a closed-keyboard observation; open-keyboard interaction not retested |
| Status bar | Header begins below status icons without extra gap | App root continues applying its Android top inset; removed Chat-specific negative inset compensation | PARTIAL — root/source audit only; no live device screenshot |

### B. Keyboard architecture and root cause

The Android app config already selects `softwareKeyboardLayoutMode: "resize"`, so Android resizes the app's available height when the keyboard opens. Chat also wrapped the full screen in `KeyboardAvoidingView behavior="padding"` and applied a negative status-bar `keyboardVerticalOffset`. That combined native resize with a second, manually compensated keyboard adjustment. The keyboard event listener separately maintained visibility solely to hard-code the latest arrow's position. The prior report called this combination successful without proving the conversation viewport under keyboard resize; the user-reported covered content shows that conclusion was unsupported.

The source-level root cause is the competing resize/avoidance strategy and a viewport whose floating control was positioned using unrelated fixed bottom values. Android now uses the already-configured resize behavior as its only keyboard layout mechanism; the Chat KAV is inert on Android and remains `padding` on iOS. No Android keyboard listener or manual status-bar keyboard offset remains. Header, flexible message viewport, and composer are direct vertical siblings, so the message viewport receives the remaining height after header, composer, and bottom tabs.

### C. Message visibility fix

- Android: activity `adjustResize` is the sole keyboard inset strategy. The keyboard reduces the root height and the flex message viewport shrinks; composer and tabs remain in normal layout above it.
- iOS: `KeyboardAvoidingView` with `padding` remains enabled for the Chat screen.
- Latest arrow: placed inside the message viewport, 12px above its bottom edge (the composer boundary), so it follows keyboard/viewport resizing without keyboard-height estimates.
- Scroll: autoscroll follows newly added content only when the user is already at latest. “Away from latest” now derives from measured scroll distance and resets when the user returns to the bottom. Extra bottom content padding gives the latest bubble clearance from the floating control.
- Existing ScrollView remains non-inverted with `keyboardDismissMode="interactive"`, `keyboardShouldPersistTaps="handled"`, and stable IDs.

### D–H. Functional contracts and current evidence

| Test | Expected | Actual | Result | Fix applied | Retest result |
|---|---|---|---|---|---|
| Keyboard opens at latest | Messages remain above keyboard; composer/send remain visible | Not exercised in Expo Go during this re-audit | BLOCKED | Single Android resize strategy; flex viewport | Contract/type/lint pass; runtime confirmation pending |
| Short, multiline, and long input | Text remains visible; composer grows and caps; send stays usable | Existing multiline/120px maximum and scroll-enabled input remain in source | PARTIAL | No composer visual redesign | Contract PASS; physical typing/send BLOCKED |
| Long conversation and scroll-up | Older messages remain accessible; new content does not steal scroll position | Distance-aware autoscroll retained/corrected in source | PARTIAL | Autoscroll only when at latest; latest visibility follows measured distance | Contract PASS; runtime scroll BLOCKED |
| Latest while keyboard is open | Button visible/tappable above composer; moves to latest | Not exercised in Expo Go | BLOCKED | Arrow is relative to message viewport instead of keyboard event/fixed screen offsets | Contract PASS; runtime tap BLOCKED |
| Keyboard dismissed/reopened | Viewport returns to stable full height without blank gap | Not exercised in Expo Go | BLOCKED | Removed competing Android KAV padding/offset/listener | Static checks PASS; cycle retest BLOCKED |
| Header/status bar | Header below system status icons; no keyboard-induced drift | Existing app-root status inset retained; no live capture available | PARTIAL | Removed Chat-specific negative offset | Source only; device visual retest BLOCKED |
| Android Back | First Back dismisses keyboard; Chat remains; next Back navigates | Not exercised in Expo Go during this audit | BLOCKED | No custom Back interception added | Prior report observed keyboard dismissal once; full retest BLOCKED |
| Bottom tabs | Tabs do not overlay composer/message viewport | Tabs are a sibling after Chat in AppShell; open-keyboard state not exercised | PARTIAL | Kept natural flex layout and inset padding | Source only; runtime retest BLOCKED |

### I. Real user journey

Steps 1–25 from the requested journey were **not run** in this audit. `adb devices -l` could not execute because Windows denied process launch for the discovered Android SDK `adb.exe`; no connected-device evidence was available through this session. No steps are reported as passed based on static inspection. Result: **BLOCKED** for Expo Go runtime validation. The revised local contract covers the layout strategy and composer affordances, but does not replace device evidence.

### J. AI/provider issue

The earlier report records an outgoing bubble followed by “Priya is thinking…” with no confirmed assistant answer and carries `PH1-GAP-001`. This audit did not launch Chat in Expo Go or capture a request/response, HTTP status, auth state, or provider log, so it cannot determine whether the current failure is credentials, backend reachability, provider behavior, or a stale thinking state. It remains **BLOCKED / unclassified at runtime**, separate from the keyboard UI work.

### K. Element-not-found classification

No UI automation or selector lookup was attempted in this audit because there was no accessible Expo Go device surface. There is no new element-not-found failure to classify. Existing IDs (`chat-composer`, `chat-message-input`, `chat-send-button`, and `chat-jump-to-latest`) remain in source.

### L. Automated checks

| Check | Expected | Actual | Result | Fix applied | Retest result |
|---|---|---|---|---|---|
| TypeScript (`tsc --noEmit`) | No type errors | Exit code 0 | PASS | Updated Chat layout and assertions | PASS |
| Expo lint | No lint errors | Exit code 0; unused imports were removed after first run | PASS | Removed unused keyboard/status-bar imports | PASS on second run |
| Chat keyboard contract | Assert coherent resize/KAV strategy, viewport arrow, multiline composer and IDs | Focused contract passed | PASS | Updated stale contract assertions to reject competing Android offsets/listeners | PASS |
| `git diff --check` | No whitespace errors | Exit code 0; Git printed existing line-ending conversion warnings | PASS | None | PASS |

The global `npx`/`npm` shims could not start because their configured npm CLI files are missing. Checks were run with the project-local binaries and `node` directly.

### M. Expo Go runtime evidence

No new Expo Go runtime evidence was collected. This report deliberately does not claim that messages remained visible, the composer was usable, the arrow worked, scrolling worked, or Back behavior passed after the fix. Result: **BLOCKED** until the exact journey is exercised on an Android device running Expo Go. The prior closed-keyboard observations in this report predate this architectural change and are not a retest.

### N. Remaining gaps and phase verdict

- **PH1-GAP-002 (P1, BLOCKED):** Android Expo Go full keyboard/scroll/latest/Back cycle not executed after the fix.
- **PH1-GAP-001 (P1, BLOCKED):** AI “thinking” state without a confirmed response needs authenticated request/response and provider-log diagnosis.
- The native keyboard, header, composer, scrolling, and Jump-to-Latest behavior remain **PARTIAL/BLOCKED**, not PASS, until runtime evidence is recorded.
- Automated local checks pass. Overall Chat UI/UX phase verdict remains **PARTIAL**.

The frozen bottom-navigation regression was fixed and retested in Expo Go on a connected Android device. Chat entry, existing-message rendering, composer controls, keyboard opening, local outgoing-message rendering, Android keyboard dismissal, and multiline/long composer expansion were also observed in Expo Go. The complete real-user journey remains incomplete because authenticated/provider-backed AI responses, physical persistence/reopen, Jump-to-Latest, long-press reply, and native media permission flows were not all retested.

No old Priya Companion files, frozen UX/reference assets, reference ZIPs, or unrelated architecture were modified.

## Validation evidence

| Check | Result |
|---|---|
| `npm run test:chat-keyboard --silent` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint -- --quiet` | PASS |
| `npm run test:contracts --silent` | PASS |
| `npm run test:stage14 --silent` | PASS |
| `npm run test:stage17 --silent` | PASS |
| `npm run test:stage18 --silent` | PASS |
| `npm run test:stage19 --silent` | PASS |
| `git diff --check` | PASS, existing line-ending warnings only |
| Expo Go startup over LAN | PASS — Metro status returned `packager-status:running` |
| Expo Go Chats screen | PASS — existing chat rows rendered |
| Expo Go bottom tabs after layout fix | PASS — all four tabs visible and tappable |
| Expo Go tab destinations | PASS — Chats, Companions, Groups, and Settings opened correctly |
| Expo Go individual Chat entry | PASS — Priya chat opened |
| Expo Go keyboard/composer interaction | PASS — keyboard opened; composer remained usable |
| Expo Go local outgoing message | PASS — message rendered with timestamp/check state |
| Expo Go AI response | BLOCKED — only `Priya is thinking…` was observed |
| Expo Go persistence/reopen | NOT RETESTED |
| Native media permissions | NATIVE-DEFERRED |

## Fixed in this phase

The direct Chat composer in `src/screens.tsx` was not WhatsApp-style: it was single-line and could not naturally expand or internally scroll, and its send button was not circular. The smallest focused fix:

- enabled multiline input;
- enabled internal scrolling after the composer reaches its maximum height;
- added a 40px minimum and 120px maximum composer height;
- aligned multiline text to the top;
- changed the send control to a 40x40 circular touch target;
- expanded `test:chat-keyboard` to assert these contracts.
- moved Jump-to-Latest above the composer while the keyboard is open, preserved it after keyboard focus when the user is away from latest, and added an explicit accessibility/test identifier.
- applied the Android status-bar inset at the app root and compensated the Chat keyboard offset so the header and lower message area are not covered by system UI.

The bottom navigation also had a genuine frozen-UX regression: its fixed height combined with Android inset padding and clipped the tab content, leaving badge-like remnants instead of the expected controls. The focused fix changed the bar to use `minHeight: 72` while preserving inset padding, and added stable tab IDs/accessibility labels. Expo Go retest confirmed visible icons/labels and successful navigation for all four tabs.

## Expo Go runtime evidence

| Journey step | Observed result | Status |
|---|---|---|
| Launch project in Expo Go | Project bundled and opened over LAN | PASS |
| Open Chats | Chats header and existing rows rendered | PASS |
| Bottom tab bar | Chats, Companions, Groups, Settings icons and labels visible above Android navigation | FIXED→PASS |
| Tap Companions | Companions screen rendered | PASS |
| Tap Groups | Groups destination rendered | PASS |
| Tap Settings | Settings destination rendered | PASS |
| Return to Chats | Chats destination restored | PASS |
| Open Priya chat | Header, avatar, message list, attachment, camera, voice, and send controls rendered | PASS |
| Tap composer | Android keyboard opened and composer remained visible | PASS |
| Send short message | Outgoing bubble rendered; input cleared; typing state displayed | PASS (local send) |
| Enter multiline/long text | Composer expanded and send control remained visible | PASS (observed) |
| Android Back with keyboard | Keyboard dismissed while chat remained open | PASS |
| Provider response | No assistant response confirmed; `Priya is thinking…` remained observed | BLOCKED |

## Complete feature report

### CHAT OPEN

**Result:** PASS in Expo Go for the validated entry path.  
**Evidence:** Chats rendered in Expo Go and tapping Priya opened the individual chat.  
**Fix:** None required.  
**Retest:** Navigation contracts and Stage 17/18 checks pass.  
**Final status:** **PASS**

### CHAT COMPOSER

**Result:** PASS after fix.  
**Evidence:** Stable `chat-composer` and `chat-message-input` IDs; `KeyboardAvoidingView behavior="padding"`; multiline input with `maxHeight: 120`.  
**Fix:** Implemented in `src/screens.tsx`.  
**Retest:** `npm run test:chat-keyboard --silent`, typecheck, and lint pass.  
**Final status:** **PASS for observed Expo Go behavior; internal-scroll threshold still requires targeted manual retest**

### MULTILINE INPUT

**Result:** PASS by implementation contract; typing cannot be physically exercised without Android.  
**Evidence:** `multiline` and `scrollEnabled` are present; `returnKeyType="default"` preserves newline entry.  
**Fix:** Implemented.  
**Retest:** Chat composer contract passes.  
**Final status:** **PASS for observed multiline expansion; very-long internal scrolling not retested**

### LONG PARAGRAPH

**Result:** PASS by implementation contract; visual clipping and exact growth cannot be proven without a device.  
**Evidence:** `minHeight: 40`, `maxHeight: 120`, `textAlignVertical: 'top'`, `scrollEnabled`.  
**Fix:** Implemented.  
**Retest:** Contract passes.  
**Final status:** **PASS for observed circular/visible send control**

### CIRCULAR SEND BUTTON

**Result:** PASS by implementation contract; physical hit testing is blocked.  
**Evidence:** `width: 40`, `height: 40`, `borderRadius: 20`, centered icon, stable `chat-send-button` ID.  
**Fix:** Implemented.  
**Retest:** Contract passes in light/dark-independent style validation.  
**Final status:** **PASS (deterministic), BLOCKED (manual device)**

### SEND MESSAGE

**Result:** Local outgoing send PASS; provider-backed completion BLOCKED.  
**Evidence:** Expo Go rendered the outgoing message with timestamp/check state and showed `Priya is thinking…`; no assistant response was confirmed.  
**Fix:** None required in this phase.  
**Retest:** Source, integration, and authorization contracts pass.  
**Final status:** **PASS (local send), BLOCKED (auth/provider)**

### MESSAGE RENDERING

**Result:** PASS in Expo Go for existing and newly sent local messages.  
**Evidence:** messages render in array order through `SwipeableMessage`; timestamps/status are retained in `Message`.  
**Fix:** None required.  
**Retest:** TypeScript and Stage 18 integration checks pass.  
**Final status:** **PASS (partial runtime evidence); multi-message ordering still incomplete**

### AI RESPONSE

**Result:** BLOCKED.  
**Evidence:** backend provider requires `EXPO_PUBLIC_AI_BACKEND_URL` and a real Supabase access token; backend/provider execution was not available for a legitimate request.  
**Fix:** None without credentials/runtime.  
**Retest:** Provider/auth contracts pass, but no real response was claimed.  
**Final status:** **BLOCKED — PH1-GAP-001**

### MULTI-MESSAGE CONVERSATION

**Result:** Source flow PASS; real multi-message sequence BLOCKED.  
**Evidence:** each send appends one user message and one assistant response when the provider returns success; message IDs are distinct.  
**Fix:** None required.  
**Retest:** Stage 18 and persistence contracts pass.  
**Final status:** **PASS (deterministic), BLOCKED (auth/provider/device)**

### SCROLLING

**Result:** Keyboard behavior observed PASS; physical scroll/JUMP validation incomplete.  
**Evidence:** `ScrollView` uses `keyboardDismissMode="interactive"`, tracks distance from latest, and content has bottom padding.  
**Fix:** None required after existing Stage 20-A1 inset work.  
**Retest:** Chat keyboard contract passes.  
**Final status:** **PARTIAL — physical scrolling and latest-button tap not retested**

### JUMP TO LATEST

**Result:** Source wiring PASS; Expo Go overlay/tap journey not retested after the tab fix.  
**Evidence:** `showLatest` is set when distance from latest exceeds 80px; button calls `scrollToEnd`; bottom uses `86 + androidBottomInset`.  
**Fix:** None required.  
**Retest:** Chat keyboard contract and relevant source checks pass.  
**Final status:** **PARTIAL — runtime overlay validation incomplete**

### ANDROID BACK

**Result:** Keyboard dismissal PASS in Expo Go; second Back navigation not retested in this sequence.  
**Evidence:** Android Back dismissed the keyboard while leaving the chat open.  
**Fix:** None in this phase.  
**Retest:** Requires a connected Android device.  
**Final status:** **PARTIAL — PH1-GAP-002**

### CHAT PERSISTENCE

**Result:** Source persistence PASS; leave/reopen and restart journey BLOCKED.  
**Evidence:** conversations are serialized and hydrated through user-scoped AsyncStorage keys; `hydrateConversations` preserves timestamp order.  
**Fix:** None required.  
**Retest:** Storage contracts pass; physical reopen/restart not available.  
**Final status:** **PASS (deterministic), BLOCKED (runtime)**

### REPLY

**Result:** Source UI PASS; long-press interaction BLOCKED.  
**Evidence:** message bubbles expose `onLongPress`, set `replyTo`, render a reply bar, include reply metadata on send, and render the referenced author/text.  
**Fix:** None required.  
**Retest:** Requires device gesture validation.  
**Final status:** **PASS (deterministic), BLOCKED (native gesture)**

### CHAT ENTRY BUTTONS

**Result:** Source UI PASS; native action execution BLOCKED.  
**Evidence:** attachment, camera, and voice controls are visible in the composer with accessibility labels/test IDs and open their corresponding UI states.  
**Fix:** None required.  
**Retest:** Requires device plus photo/camera/microphone permission handling.  
**Final status:** **PASS (deterministic), BLOCKED (native permissions/device)**

## Per-message report

One short message and one multiline/long local message were sent in Expo Go. No provider-backed assistant response was confirmed:

| ID | User input | Expected behavior | Actual behavior | Outgoing | AI request | AI response | Rendered response | Persistence | Result | Failure layer | Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MSG-001 | `Hi, how are you?` | Greeting response | Outgoing bubble rendered; `Priya is thinking…` shown | PASS (local) | Dispatched by app; backend completion unconfirmed | Not observed | No assistant bubble confirmed | Not retested | BLOCKED | Auth/provider | PH1-GAP-001 |
| MSG-002 | `What can you help me with?` | Normal conversational response | Not exercised | Not observed | Not created | Not observed | Not observed | Not exercised | BLOCKED | Environment/auth/provider | PH1-GAP-001 |
| MSG-003 | `What did I just ask you?` | Context-aware follow-up | Not exercised | Not observed | Not created | Not observed | Not observed | Not exercised | BLOCKED | Environment/auth/provider | PH1-GAP-001 |
| MSG-004 | Multiline/long paragraph | Long input accepted and response returned | Composer expanded; outgoing text rendered | PASS (local) | Dispatched by app; backend completion unconfirmed | Not observed | No assistant bubble confirmed | Not retested | BLOCKED | Auth/provider | PH1-GAP-001 |
| MSG-005 | Multiline input | Newlines preserved and response returned | Input expansion observed; dedicated newline-preservation assertion not captured | PARTIAL | Not confirmed | Not observed | Not observed | Not retested | PARTIAL | Runtime/provider | PH1-GAP-001 |
| MSG-006 | Follow-up after scrolling/latest | Correct ordering and latest position | Not retested in the completed Expo Go sequence | Not observed | Not created | Not observed | Not observed | Not retested | BLOCKED | Runtime/manual | PH1-GAP-002 |

## Automation

**Total suites:** 8 relevant deterministic suites/checks  
**Passed:** 8 (`chat-keyboard`, TypeScript, lint, source contracts, Stage 14, Stage 17, Stage 18, Stage 19)  
**Failed:** 0  
**Blocked:** 0 automated suites; native scenarios are unavailable because no device is attached  
**Manual-only:** Jump-to-Latest tap/overlay, long-press gesture, camera/gallery/mic permissions, provider/auth journey, physical restart  
**Element-not-found cases:** Earlier input lookup was caused by being on the Chats screen rather than inside Chat; no selector defect was found.  
**Root causes:** environment/device absence and legitimate auth/provider unavailability, not selector failures.  
**Automation fixes:** Added multiline/max-height/internal-scroll and circular-send assertions to `chat-keyboard-composer-contract-test.cjs`.

## Final gap summary

### A. FIXED IN THIS PHASE

- **PH1-FIX-001:** Chat composer now supports multiline growth, bounded height, internal scrolling, and a circular send target.

### B. VERIFIED PASS

- Chat route and message rendering contracts.
- Composer IDs, keyboard-aware container, interactive keyboard dismissal.
- Jump-to-latest calculation and Android inset wiring.
- Message append/clear/assistant-response state flow.
- User-scoped conversation serialization/hydration contracts.
- Reply state wiring and chat entry-point UI contracts.

### C. BLOCKED BY AUTH

- **PH1-GAP-001:** No legitimate authenticated session was available to prove `/chat` request creation, bearer-token validation, or an end-to-end response.

### D. BLOCKED BY PROVIDER

- **PH1-GAP-001:** No legitimate provider-backed response could be executed or recorded.

### E. BLOCKED BY NATIVE/HARDWARE

- **PH1-GAP-002:** The connected-device Expo Go run did not complete physical scrolling, Jump-to-Latest, second Back navigation, or persistence/reopen retests.
- **PH1-GAP-003:** Camera/gallery/microphone entry-point actions require native permission/device validation.

### F. AUTOMATION-ONLY GAPS

- None identified in this run. The absence of an Android target is an environment blocker, not an element-not-found or selector defect.

### G. REAL PRODUCT GAPS

- None remaining in the deterministic Chat composer scope after PH1-FIX-001.

### H. CARRIED STAGE 20 GAPS

- ST20-GAP-001: fresh legitimate authentication flow not proven on-device.
- ST20-GAP-002: full Stage 20 feature audit remains incomplete.
- ST20-GAP-003: audio/media and provider flows remain unverified.
- ST20A1-GAP-001 through ST20A1-GAP-005 remain separate and unchanged.

### I. NEW PHASE 1 GAPS

| ID | Priority | Feature | Exact failure | Root cause | Category | Manual requirement | Recommended phase | Status |
|---|---|---|---|---|---|---|---|---|
| PH1-GAP-001 | P1 | AI response | Real authenticated multi-message provider journey not completed | No valid session/provider runtime | Auth/provider/environment | Real signed-in Android session and configured provider | Phase 1 rerun | BLOCKED |
| PH1-GAP-002 | P1 | Scroll/latest/back/persistence | Complete native journey was not retested in Expo Go | Validation sequence incomplete | Runtime/manual | Expo Go device session | Phase 1 rerun | PARTIAL |
| PH1-GAP-003 | P2 | Attachment/camera/voice entry points | Native permission/action opening not exercised | No Android device or permissions | Native/hardware | Connected Android device with permissions | Later media/voice phase | BLOCKED |
