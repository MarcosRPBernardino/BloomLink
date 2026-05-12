# BloomLink Stock MVP

BloomLink is a single Express + Socket.IO app. The backend serves the plain HTML/CSS/JS frontend and handles the real-time stock request flow from the same origin.

## Local development

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Production start

```bash
npm install
npm start
```

The server uses:

```js
process.env.PORT || 3000
```

This lets local development use port `3000`, while hosting platforms can provide their own `PORT`.

## Environment variables

Copy `.env.example` to `.env` for local overrides:

```text
PORT=3000
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@bloomlink.live
```

Do not commit `.env`.

Generate VAPID keys with:

```bash
npm run vapid:generate
```

Put the generated public/private keys into `.env` or the production environment.

## SQLite database

Registered users are stored in:

```text
bloomlink.db
```

The file is created in the project root when the server starts. Online users and stock requests still remain in memory for this MVP.

To reset seed users, stop the server, delete `bloomlink.db`, and start the server again.

## Same-origin Socket.IO

The frontend connects with:

```js
window.location.origin
```

That means the browser connects back to the same host and port that served the page. There is no hardcoded `localhost`, so the same app can later run behind a local network address, a tunnel URL, or a simple hosting URL.

## Deployment preparation

This structure is ready for:

- a local laptop running the Express server
- a tunnel service pointing to the local server
- platforms like Render or Railway that provide `PORT`

No cloud-specific configuration is included yet.

## PWA and Web Push

The app includes:

- `public/manifest.json`
- `public/service-worker.js`
- an in-app `Enable Push Notifications` button

Push notifications are used only for Stock Requests and only for users who are eligible to receive `stock:alert`.

To enable push on a device:

1. Log in.
2. Start shift.
3. Open Operations.
4. Tap `Enable Push Notifications`.
5. Allow browser notifications.

Android browsers usually support web push directly after permission is granted.

On iPhone/iOS, web push support is most reliable after installing the PWA to the Home Screen, then opening BloomLink from that installed icon and enabling notifications there.
