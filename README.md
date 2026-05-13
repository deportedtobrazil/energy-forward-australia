# energy-forward-australia

## Run locally

This project includes a small Node.js server for static file serving.

```bash
node server.js
```

Then open `http://localhost:3000`.

## Petition signatures

- Petition submissions are sent from `index.html` to the Google Apps Script web app endpoint.
- The admin signature list in `admin.html` reads from the same endpoint.
- Signatures are names-only (`fullName`).
