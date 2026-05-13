# energy-forward-australia

## Run locally

This project now includes a small Node.js server for petition signature persistence.

```bash
node server.js
```

Then open `http://localhost:3000`.

## Petition signatures

- `POST /sign-petition` saves signatures to `data/signatures.json`
- `GET /sign-petition/signatures` returns signatures for the admin panel
- API responses are served with `Cache-Control: no-store` headers
