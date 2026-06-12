# BloomLink

BloomLink is a real-time operational communication app for event teams. It helps staff request stock quickly, routes requests to the right roles, and keeps managers aware of active work during busy live-service environments.

The project is designed for mobile-first use by event staff, kitchen teams, stock runners, and managers who need fast coordination without relying on informal chat threads or manual follow-ups.

## Features

- Real-time stock requests with live status updates
- Role-based request routing for managers, KP, and stock runners
- Manager and admin controls for users, shifts, and requests
- Web push notifications for eligible stock request recipients
- Active shift tracking separate from socket connection state
- Mobile-first interface optimized for operational use
- PWA support with manifest and service worker
- SQLite persistence for registered users
- Manual SQLite database backups

## Tech Stack

- Node.js
- Express
- Socket.IO
- SQLite
- HTML
- CSS
- Vanilla JavaScript
- Web Push API
- Service Workers

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

## Production Start

Install dependencies and start the server:

```bash
npm install
npm start
```

The server uses:

```js
process.env.PORT || 3000
```

This allows local development to use port `3000`, while deployment platforms can provide their own `PORT` value.

## Environment Variables

Copy `.env.example` to `.env` for local configuration:

```text
PORT=3000
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@bloomlink.live
```

Generate VAPID keys for Web Push:

```bash
npm run vapid:generate
```

Add the generated keys to `.env` locally or to the production environment variables on the server.

## SQLite Database

Registered users are stored in:

```text
bloomlink.db
```

The database file is created in the project root when the server starts. User accounts are persisted in SQLite, while active shift sessions and stock requests are kept in memory.

To reset the local database, stop the server, delete `bloomlink.db`, and start the server again.

## Database Backups

Create a timestamped SQLite backup:

```bash
npm run backup
```

This creates a backup file inside the `backups` directory:

```text
backups/bloomlink-YYYY-MM-DD-HHMM.db
```

On Linux-based environments, a shell script version is also available:

```bash
npm run backup:sh
```

The `backups/` directory is ignored by Git.

## Same-Origin Socket.IO

The frontend connects to the backend using:

```js
window.location.origin
```

This keeps the frontend and Socket.IO server on the same origin and avoids hardcoded `localhost` URLs. The app can run locally, behind a tunnel, or on a hosted server using the same code path.

## Deployment

BloomLink runs as a single Express server that serves both the backend API/socket layer and the static frontend.

The deployment model is intentionally simple:

- one Node.js process
- one SQLite database file
- same-origin Socket.IO connection
- environment-based port configuration

This structure can be deployed to a local machine, a VPS, or Node-friendly hosting platforms such as Render or Railway.

## PWA and Web Push

BloomLink includes PWA and Web Push support through:

- `public/manifest.json`
- `public/service-worker.js`
- the in-app `Enable Push Notifications` control

Push notifications are sent for stock requests only to eligible active-shift users. In-app alerts remain available when the app is open.

To enable push notifications:

1. Log in.
2. Start shift.
3. Open Operations.
4. Tap `Enable Push Notifications`.
5. Allow browser notifications.

Android browsers generally support web push after permission is granted.

On iPhone/iOS, web push support is most reliable when BloomLink is installed to the Home Screen and opened from the installed app icon.
