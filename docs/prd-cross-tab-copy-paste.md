# Product Requirements Document (PRD): Cross-Tab Copy/Paste

## 1. Overview
The Geometry Sequencer App previously supported copying and pasting layers, groups, and keyframes using `localStorage`, but the application state did not dynamically reflect clipboard changes across multiple open tabs or windows. This feature enhancements introduces real-time, cross-tab synchronization so that users working across multiple browser windows can seamlessly copy elements in one tab and immediately paste them in another without refreshing the page.

## 2. Goals
- **Seamless UX:** Enable pasting of dynamically copied layers and keyframes across multiple browser windows.
- **Instant Synchronization:** The "Paste" buttons should immediately become active in Tab B after a copy action in Tab A.
- **Robustness:** Ensure that the feature works reliably in local development environments and production without being blocked by iframe or standard browser storage event limitations.

## 3. Scope
**In Scope:**
- Synchronizing `clipboardLayers` across tabs.
- Synchronizing `clipboardKeyframe` across tabs.
- Fixing the stale selection bug where copying a layer via the left layer stack sidebar resulted in copying an old selection.

**Out of Scope:**
- System-wide clipboard integration for pasting external data formats outside of the Geometry Sequencer application domains.

## 4. Technical Implementation Letails
- **BroadcastChannel API:** Instead of relying purely on the standard `window.addEventListener('storage')` which can be unreliable in local dev environments (e.g., Vite workflows), a `BroadcastChannel` named `geometry_clipboard_sync` was implemented.
- **State Management:** When `copySelection` or `copyKeyframe` is triggered within `useStore.ts`, the application saves the payload to `localStorage` (as a fallback/persistence layer) and then immediately publishes a message containing the copied data over the `BroadcastChannel`.
- **Event Listeners:** All active tabs listen on the `BroadcastChannel` and update their respective Zustand store via `useStore.setState()` upon receiving a `'SYNC_LAYERS'` or `'SYNC_KEYFRAME'` message.
- **Sidebar Selection Fix:** Updated `LayerStack.tsx` to ensure that clicking a layer correctly updates `selectedLayerIds` (which is read by the `copySelection` function) alongside the `activeLayerId`.
- **Selection Lifecycle:** Automatically sync `selectedLayerIds` when duplicating layers, adding new layers, or deleting layers to ensure the clipboard always copies what the user expects.

## 5. Testing & Validation
- **Cross-Tab Synchronization:** Verified by opening the app in two separate browser windows. Copying a group in one window immediately enables pasting the same group with all its keyframes intact in the second window.
- **Stale Selection Fix:** Verified that clicking differing layers in the sidebar updates the clipboard payload accurately.
- **Persistence:** Even if a tab is refreshed, `localStorage` is checked upon initial load to repopulate the clipboard.
