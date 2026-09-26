const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
const screenSource = fs.readFileSync(path.join(projectRoot, 'src/screens.tsx'), 'utf8');

assert.equal(appConfig.expo.android.softwareKeyboardLayoutMode, 'resize', 'Android keyboard layout should resize and avoid covering the composer.');
assert.match(screenSource, /behavior="padding"[\s\S]*?enabled/m, 'Chat should use padding-based avoidance to keep the composer above the keyboard on Android and iOS.');
assert.match(screenSource, /Keyboard\.addListener\('keyboardDidShow'[\s\S]*?Keyboard\.addListener\('keyboardDidHide'/m, 'Android keyboard height must not be counted as a bottom system inset.');
assert.match(screenSource, /if \(Platform\.OS !== 'android' \|\| keyboardVisible\) return 0/m, 'Bottom tabs should retain only the system inset while the keyboard is closed.');
assert.match(screenSource, /keyboardVerticalOffset=\{Platform\.OS === 'android' \? StatusBar\.currentHeight \?\? 0 : 0\}/m, 'Android keyboard avoidance should account for the runtime status-bar inset rather than a fixed offset.');
assert.match(screenSource, /<View style=\{\{ flex: 1, position: 'relative' \}\}>\s*<ScrollView/m, 'Message list and floating controls should share the flexing message viewport.');
assert.match(screenSource, /chat-jump-to-latest[\s\S]*?bottom: 12/m, 'Jump-to-latest should stay anchored above the composer as the viewport resizes.');
assert.match(screenSource, /paddingBottom:\s*Math\.max\(8,\s*bottomInset\s*\+\s*8\)/m, 'Bottom navigation should respect the Android system navigation inset.');
assert.match(screenSource, /wasAwayFromLatestRef\.current = awayFromLatest;\s*setShowLatest\(awayFromLatest\)/m, 'Latest-button visibility should track distance from latest in either scroll direction.');
assert.match(screenSource, /testID="chat-message-input"/m, 'Chat composer input must expose a stable test ID.');
assert.match(screenSource, /testID="chat-send-button"/m, 'Chat send action must expose a stable test ID.');
assert.match(screenSource, /testID="chat-message-input"[\s\S]*multiline[\s\S]*scrollEnabled/m, 'Chat composer must support multiline input with internal scrolling at its maximum height.');
assert.doesNotMatch(screenSource, /onFocus=\{\(\) => \{\s*requestAnimationFrame\(\(\) => scrollRef\.current\?\.scrollToEnd/m, 'Focusing the composer must not force users away from an intentionally scrolled-up position.');
assert.match(screenSource, /chatMessageInput:\s*\{[^}]*minHeight:\s*40[^}]*maxHeight:\s*120[^}]*textAlignVertical:\s*'top'/m, 'Chat composer must grow naturally and cap at a readable maximum height.');
assert.match(screenSource, /sendButton:\s*\{[^}]*width:\s*40[^}]*height:\s*40[^}]*borderRadius:\s*20/m, 'Chat send action must remain circular with a stable touch target.');
assert.match(screenSource, /keyboardDismissMode="interactive"/m, 'Chat list should dismiss the keyboard interactively when the user scrolls.');

console.log('Chat keyboard composer contract passed.');
