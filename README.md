# Annapurna Yojana Client-Side PDF Helper

Production-oriented scaffold for an installable PWA that scans ID documents, runs OCR in the browser, lets the user review and correct extracted values, overlays confirmed values on the original Annapurna Yojana PDF, previews it, and downloads `annapurna_filled.pdf`.

## Privacy Model

- Document images, Aadhaar data, OCR text, and generated PDFs stay inside the browser.
- The frontend never uploads document or personal data.
- The backend skeleton is payment-ready only. It must never receive or store documents, OCR text, Aadhaar numbers, PAN numbers, addresses, or generated PDFs.
- The app shows the required privacy line: "🔒 Your documents never leave your phone".

## Project Layout

- `frontend/` - React + Vite PWA using `tesseract.js`, `pdf-lib`, and a Workbox service worker.
- `backend/` - Minimal Express skeleton for future payment integration.
- `frontend/public/forms/annapurna-form.pdf` - Original 11-page form copied from the supplied PDF.
- `frontend/public/fieldMap.json` - Placeholder coordinate map. Replace this with a calibrated map before production use.
- `FIELD_NAMES.md` - Field-name contract shared by app code, `fieldMap.json`, and any future calibration tool.

## Frontend Flow

The app follows the required order:

1. Scan: mobile camera/file input with `accept="image/*" capture="environment"` and multiple document support.
2. OCR: in-browser `tesseract.js` recognition with `eng+ben` and progress UI.
3. Review & Edit: parsed values are shown in editable inputs and are not written to the PDF until the user confirms.
4. Fill: `pdf-lib` loads the original PDF and draws text/checkbox marks over the existing pages.
5. Preview: the filled PDF is shown in an embedded PDF preview.
6. Download: the file downloads as `annapurna_filled.pdf`.

## Field Map Calibration

`frontend/public/fieldMap.json` intentionally contains only a few placeholder examples. Do not treat the sample coordinates as production-ready.

To calibrate:

1. Keep the field names exactly as listed in `FIELD_NAMES.md`.
2. Keep `fieldNameContract` in `fieldMap.json` synchronized with `FIELD_NAMES.md`.
3. Generate `{ "field": "...", "page": 1, "x": 0, "y": 0, "size": 10 }` entries for every field you want filled.
4. Use 1-based page numbers. The app converts them for `pdf-lib`.
5. Use `"type": "checkbox"` for checkbox fields. A checked value is the literal string `"X"` and is drawn with `drawText("X")`.
6. Replace only `frontend/public/fieldMap.json`; no app code changes should be needed.

The current app validates that every mapped field exists in the field-name contract.

## Future Payment Plan

Payment is deliberately not implemented yet. The frontend contains a `// FUTURE PAYWALL GATE` marker where a paid generation gate can be inserted without restructuring the flow.

Recommended future flow:

1. Browser sends no documents or personal data to the backend.
2. Backend creates a Razorpay/UPI order in `POST /create-order`.
3. Backend verifies the Razorpay HMAC signature in `POST /verify`.
4. On successful verification, backend returns a short-lived JWT that authorizes clean-PDF generation in the browser.
5. Webhook handling in `POST /webhook` validates the Razorpay webhook HMAC using `WEBHOOK_SECRET`.

## Commands

```bash
npm install
npm run dev:frontend
npm run dev:backend
npm run build
npm run verify
```

Backend health check:

```bash
curl http://localhost:8787/health
```

Expected response:

```json
{"status":"ok"}
```

Payment routes currently return HTTP 501 by design.
