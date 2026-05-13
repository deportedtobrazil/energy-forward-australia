# Energy Forward Australia

A simple static site with a lightweight Node.js server and a petition signature flow backed by a Google Apps Script web app.

## Run locally

This project includes a small Node.js server for static file serving.

1. Start the server:

   ```bash
   node server.js
   ```

2. Open the site in your browser:

   - http://localhost:3000

## Petition signatures

The site collects petition signatures and displays them in an admin view.

- **Submission:** `index.html` sends petition submissions to a **Google Apps Script web app endpoint**.
- **Admin list:** `admin.html` fetches and displays signatures from the **same endpoint**.
- **Data collected:** signatures are **name-only** (`fullName`).

## Project notes

- This repository is intentionally minimal: static HTML + a tiny Node server for local development.
- If you change the Apps Script endpoint URL, update it wherever it is referenced in the frontend pages.
