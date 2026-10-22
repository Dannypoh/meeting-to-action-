# Meeting-to-Action Assistant

A dependency-free Node.js prototype for turning university group meetings into reviewed minutes and trackable actions.

## Run it

```bash
npm start
```

Open <http://localhost:3000>. The app starts with fictional sample data so the input, review, approval, dashboard, progress-update, and email-preview flows can be tried immediately.

To use another port: `PORT=4173 npm start`.

## Test it

```bash
npm test
```

## Architecture

- `server.js` — Node HTTP server, JSON API, and static-file delivery
- `public/` — plain HTML, CSS, and browser JavaScript
- `data/store.json` — file-backed persistent prototype data
- `test/server.test.js` — API workflow tests using Node's built-in test runner

AI extraction and email delivery are demonstration-only in this stage. Generated results and email previews are labelled accordingly in the interface.
