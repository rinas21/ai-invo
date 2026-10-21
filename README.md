# Invoice to Memo Generator

A secure, temporary demo web application built with **SvelteKit + JavaScript** that converts an uploaded invoice PDF into a payment approval memo using a supplied HTML template and the Google Gemini API.

## Features

- **Password login** — single shared access password (`APP_PASSWORD`), verified server-side.
- **Secure sessions** — cryptographically secure session ID in an HTTP-only, SameSite=Lax cookie (Secure in production).
- **Invoice upload** — text-based PDF invoice upload with file type and size validation.
- **Memo generation** — invoice text + `payment_approval_template.html` sent to Google Gemini (server-side) to populate the template's placeholders. Missing/ambiguous values are flagged as `[REVIEW REQUIRED: ...]` rather than fabricated.
- **Editable preview** — rich, editable memo preview preserving the template's structure, headings, tables, and fixed wording.
- **Copy** — copy memo text to clipboard.
- **Download Word (`.docx`)** — generated with the `docx` library, reflecting the latest edits.
- **Download PDF** — generated with `pdfmake`, selectable text, correct margins and tables.
- **Logout** — invalidates the session.
- **No database** — nothing is persisted; invoice contents, generated memos, and API keys are not stored.

## Tech stack

- SvelteKit (adapter-auto), JavaScript only
- Tailwind-style utility classes via standard CSS in components
- PDF.js (`pdf-parse`) for server-side invoice text extraction
- Google Gemini SDK (`@google/generative-ai`) — model `gemini-1.5-flash`, configurable
- `docx` for Word export
- `pdfmake` for PDF export
- Vercel deployment

## Project structure

```
invoice-to-memo/
├── payment_approval_template.html   # authoritative memo template (loaded automatically)
├── .env.example                     # placeholder secrets (copy to .env locally)
├── vercel.json                      # Vercel deployment config
├── package.json
├── svelte.config.js
├── vite.config.js
├── src/
│   ├── app.html
│   ├── hooks.server.js              # session auth middleware
│   ├── lib/
│   │   ├── server/
│   │   │   ├── auth.js              # session create/validate/destroy + rate limiting
│   │   │   ├── htmlParser.js        # minimal memo HTML -> block parser
│   │   │   ├── export.js            # docx + pdf generation
│   │   │   └── payment_approval_template.html
│   ├── routes/
│   │   ├── +page.svelte             # login screen
│   │   ├── +layout.js               # prerender=false
│   │   ├── generate/
│   │   │   ├── +layout.js           # prerender=false
│   │   │   ├── +page.js             # auth guard
│   │   │   └── +page.svelte         # generator screen
│   │   └── api/
│   │       ├── auth/login/+server.js
│   │       ├── auth/logout/+server.js
│   │       ├── auth/verify/+server.js
│   │       ├── generate/+server.js  # PDF extraction + Gemini + template populate
│   │       └── export/word/+server.js
│   │       └── export/pdf/+server.js
```

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables. Copy the example file:

```bash
cp .env.example .env
```

Then edit `.env` and set:

```
APP_PASSWORD=replace_with_your_password
GEMINI_API_KEY=replace_with_your_gemini_api_key
```

> **Security:** `APP_PASSWORD` and `GEMINI_API_KEY` are read **only on the server** (`$env/static/private`). They are never exposed to the browser. `.env` is gitignored — do not commit it. Never hardcode a real API key.

3. Run the development server:

```bash
npm run dev
```

4. Open `http://localhost:5173`, enter the password, upload a text-based invoice PDF, and click **Generate Memo**.

## Verification checklist

The following were executed successfully against the local build:

- Login page loads; correct password creates a session and redirects to `/generate`.
- Incorrect password returns a generic "Invalid credentials" error and stays on login.
- `/generate` and `/api/generate`, `/api/export/*` reject unauthenticated requests (401 / redirect to login).
- `/api/auth/verify` reports authentication status without exposing secrets.
- Neither `APP_PASSWORD` nor `GEMINI_API_KEY` is sent to the client.
- Text-based invoice PDF text extraction works (`pdf-parse`).
- Template (`payment_approval_template.html`) is loaded automatically; the user does not upload it.
- Upload validation: non-PDF files, empty PDFs, missing file, and over-size files are rejected with clear errors.
- Editable preview renders the generated memo; clipboard copy works.
- Word export produces a valid `.docx` (opened/inspected).
- PDF export produces a valid, selectable-text PDF (opened/inspected).
- Production build (`npm run build`) completes without errors.

### Not executed (requires a real Gemini API key)

- End-to-end memo generation with a live Gemini key.
- Verification that missing invoice fields produce `[REVIEW REQUIRED: ...]` markers via Gemini (the code path and prompt are implemented; the actual model call needs a valid key).

## Vercel deployment

1. Push the repository to GitHub (`.env` is ignored; no secrets committed).
2. Add the `@sveltejs/adapter-vercel` adapter (already configured in `svelte.config.js`).
3. Import the GitHub project in Vercel and deploy.
4. In the Vercel project settings, add these **Environment Variables** (Production, server-side only, not exposed to the client):
   - `APP_PASSWORD`
   - `GEMINI_API_KEY`
5. Redeploy after adding the variables.

The template file `payment_approval_template.html` at the repository root is included in the deployment and read at runtime by the server. No database or persistent storage is used.

## Security notes

- This is a **temporary demo**. The Gemini API key is used server-side and never logged or returned to the client.
- Sessions are held in memory (single instance) — appropriate for a demo; not for multi-instance production.
- Login has basic fixed-window rate limiting.
- Invoice contents are treated as untrusted data and are not persisted.

## Known limitations

- Supports **text-based PDFs only**. Scanned/image PDFs without extractable text return an error explaining that OCR is required.
- Memo generation requires a valid Gemini API key; without it the generate endpoint returns an error.
- Sessions are in-memory (lost on redeploy / serverless cold start).
- No OCR, no database, no user registration.
