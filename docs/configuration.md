# Configuration

## Environment variables

See `.env.example` in the repo root. Notable additions:

### `BLOB_READ_WRITE_TOKEN`

Required for **monthly rent receipt** download and archive on [Vercel Blob](https://vercel.com/docs/storage/vercel-blob).

1. In the Vercel project, open **Storage → Blob** and create a store (or link an existing one).
2. Copy the **Read-Write** token into `BLOB_READ_WRITE_TOKEN` locally and in Vercel **Environment Variables**.
3. On the **Rent collection** page, pick a month and use **Download receipts**. The HTML file is saved privately at `rent-receipts/{YYYY-MM}.html`, and the blob URL is stored in the `settings` table under `monthlyReceiptBlob:{YYYY-MM}`.
4. Use **Refresh archive** after new payments if you want the blob copy updated without waiting for a cache miss.

Receipts download as HTML (print or “Save as PDF” in the browser). Each tenant with a rent charge for that month gets one printable receipt section.
