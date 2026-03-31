- notifications even in browser and pwa downloadable 
- message reactions
- refresh button should do exactly the same thing that refreshing the page does to get back the online users and messages, instead of just refreshing the online users list.
- edit + delete messages for registered users, and auto delete after 7 days for all messages, including guest users.
- push notifications for new messages, even when the user is not actively using the app. This can be achieved using the Web Push API NotificationsAPI and a service worker to handle incoming push notifications.
- end to end encryption for private messages to enhance security and privacy for users. This can be implemented using libraries like OpenPGP.js or the Web Crypto API.
- use cloudinary for image
- view once , screenshot prevention for view once messages, send by camera
- multiple chat rooms
- keyboard shortcuts  (esc to end chat window )
- omegle, chatromm tlk.io feature
- whatsapp like layout chat

## Current ChatNexus Features

- Guest login (lets a user enter chat quickly with a temporary profile).
- Registered member accounts (supports persistent users with saved identity and account-backed access).
- Login, register, logout, and token refresh (covers the full session lifecycle for authenticated users).
- Private 1-to-1 chat (supports direct real-time conversations between two users).
- Global chat room (provides a shared public space where all active users can talk).
- Real-time messaging with Socket.IO (delivers chat updates instantly without page refreshes).
- Online and offline presence (shows which users are currently active in the app).
- Typing indicators (shows when the other user is actively composing a message).
- Message history loading (lets users reopen chats and fetch earlier conversation data).
- File attachments (supports sending uploaded files and media in direct messages).
- Inline attachment previews (renders sent files/media inside the conversation stream).
- Emoji picker (allows quick emoji insertion while composing messages).
- GIF picker (allows animated GIF sending directly from the chat composer).
- Mobile-responsive chat dashboard (adapts the sidebar and chat layout for smaller screens).
- Theme support (stores and re-applies the user’s preferred visual mode).
- Username update for registered users (lets members rename themselves from settings).
- Help center page and support form (gives users a place to submit support and account issues).
- FAQ, features, about, privacy, and terms pages (documents the product, support info, and legal details).
- PWA/service worker registration (makes the app installable and improves app-like usage).

## Added / Improved Features

- Friend request system (friendships now use a request flow instead of instant auto-accept).
- Friend request cards in the DM timeline (the receiver can accept or reject directly inside chat).
- Friend status sync for both users (pending and accepted states update for sender and receiver together).
- Offline friends in the sidebar (friends remain visible even when they are not online).
- Offline friend message delivery (messages sent to offline friends are available when they return).
- Sidebar refresh button (lets users manually refresh stale presence or sidebar state).
- Sidebar filters for registered users (supports filtering the list by friend, male, and female).
- Sidebar ordering by unread, friends, and guests (surfaces the most relevant users first).
- Binary unread badge behavior (shows a simple unread indicator and clears it when the chat is opened).
- Theme toggle moved into settings modal (keeps appearance controls inside the user settings flow).
- Clear chat action (removes a direct conversation for both participants).
- Clear attachments action (removes shared attachments and their files for both participants).
- In-app confirmation dialogs (replaced browser alert or confirm popups for destructive actions).
- Shorter toast duration (feedback messages disappear faster and feel less intrusive).
- Better live presence handling (reduced false offline states caused by reconnects, token changes, or multi-tab usage).
- Friend-aware sidebar feed (combines live online users with offline friends in one list).
- Friend-only long-term retention (friend conversations are kept longer than ephemeral non-friend chats).
- Ephemeral non-friend cleanup (temporary conversations are cleared on logout or after the inactivity window).
- Real backend rate limiting usage (API and socket messaging now use the limiter instead of leaving it unused).
- Actual conversation stats route support (sidebar preview or unread data now has a proper backend path instead of a partial stub).
