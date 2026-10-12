# Privacy and data handling

MIDI Journey 2 sends your written message, the currently selected MIDI clip's basic metadata/notes, and bounded recent conversation context to Pollinations when you press Send. It does not send audio or your entire Live Set. Pollinations and its model providers process the request under their own policies.

## Login

The shared `@pollinations/sdk` owns OAuth/PKCE, account state, and browser-local session storage. The chat toolbar displays profile and balance through SDK hooks with profile/usage permissions.

Inside Live, login opens the system browser for passkeys and provider sign-in. After normal Pollinations authorization, a capability-protected, ten-minute loopback handoff supplies the resulting session to the SDK in Live. The transport's temporary token is cleared after acknowledgement, cancellation, expiry, or server shutdown. User tokens are not placed in URLs, process arguments, Max dictionaries, Live Sets, the AMXD, or Git.

The embedded browser and system browser keep separate SDK sessions. Signing out in one does not automatically sign out the other. Closing the editor keeps the local session for reopening; it does not revoke access. Account revocation is available through Pollinations.

The publishable app key identifies this app; it is not a personal account token. Normal builds reuse the existing approved key and never create, rotate, or revoke one.

## Conversation and copies

The current chat stays in memory only, bounded to 30 exchanges. It is not saved in browser storage, the device, or the Live Set. Loading the device or reloading its editor page starts with no draft, exchanges, MIDI results or creative context. Hiding/showing the same loaded editor keeps its conversation. Startup does not read or migrate saved conversations, change SDK login or theme preferences, send a request, or create a clip.

**Trash** cancels active generation and clears the app's conversation, draft and creative context. It does not remove clips or sign out.

Disconnecting cancels active generation but retains the conversation, generated MIDI and draft in memory. Send and Trash are disabled until you reconnect. Reconnecting does not send the draft automatically.

There is no response-copy control or visible technical-details panel. Original provider messages are retained only in bounded local call diagnostics: messages larger than 512,000 characters are not retained, and credential-like text is redacted. They are not automatically sent to Max logs.

Prompt Copy/Paste uses native Command-key shortcuts and the embedded browser’s right-click menu, with a 12,000-character prompt limit. There is no custom OS clipboard transport or clipboard polling. Clipboard text and provider response bodies are not printed in app logs.

The welcome bubble is local UI, not an API response. Recognized exact transpositions of a single selected clip run locally without sending that request to Pollinations. Other messages make one agent request per Send, with no automatic request retries or model fallback. Internal agent tools are controlled by Pollinations; a single request can still include paid tool calls. The app never retries Live writes automatically. A timeout after a Live write requires checking the clip before trying again.

## Local connector

The server binds only to loopback and checks Host, method and authentication capability for the browser handoff. It serves bundled assets and a minimal read-only connection/destination status. There is no HTTP endpoint for creating clips or reading the clipboard. Actual MIDI changes require the embedded Max message bridge and validated data.

UI test fixtures use fake accounts and responses and are not bundled. The device and chat follow Ableton Live’s theme. Avoid putting confidential information in musical prompts even though credential-like values are redacted.
