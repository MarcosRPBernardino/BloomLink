# BloomLink Stock MVP

## How to run

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## SQLite database

Registered users are stored in a local SQLite database file named:

```text
bloomlink.db
```

The file is created in the project root when the server starts.

Online users and stock requests still remain in memory for this MVP. This keeps live session state simple while only making registered login users persistent.

## Reset seed users

Stop the server, delete `bloomlink.db`, then start the server again.

When the users table is empty, the server seeds the default test users again.
