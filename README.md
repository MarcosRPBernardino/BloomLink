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
```

Do not commit `.env`.

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
