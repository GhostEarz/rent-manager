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

## Multi-property setup

The hierarchy is **Location → House → Floor → Room**. A location is a city/area; a house is one physical
building inside it (what used to be "the property"). Every floor and room belongs to exactly one house, and
room numbers only need to be unique *within* a house (so two houses can both have a "101").

1. Go to **Properties** (admin only) and add a **Location**, then a **House** inside it.
2. Switch to that house with the selector in the sidebar — most pages (Rooms, Dashboard) scope to the
   active house. Leave it on **All houses** to see everything (useful for Analytics).
3. On **Rooms**, add floors and rooms under the selected house as before.

Existing installs are migrated automatically: the first migration run creates one Location/House named after
the old `propertyName` setting and attaches all existing floors to it, so nothing changes until you add more.

## Rental types and daily stays

Every room has a **rental type**: `MONTHLY` (the original tenant/tenancy flow) or `DAILY` (short-stay guests,
billed per night). The type and rate are both tracked in the room's rent history, so changing the rate later
never confuses a past monthly rent with a past nightly rate.

- **Monthly rooms** work exactly as before: check in a tenant on the **Tenants** page, `rent_charges` are
  generated per month, payments are recorded against charges.
- **Daily rooms** use the **Stays** page instead: check in a guest (locks in the nightly rate), record
  payments against the stay as they come in, and check out when they leave. There is no `rent_charges` row
  for a stay — the balance is always `dailyRate × nights − payments`. Nights are counted as calendar days
  between check-in and check-out, **excluding** the check-out day itself (so a guest in for 2 nights checks
  out on day 3).
- **Switching a room's type** (Rooms page → *Change rental type*) is only allowed while the room is vacant
  (no active tenancy, no active stay, not under maintenance). It asks for a new rate and an effective date,
  and inserts a new rent-history row — it never rewrites or reinterprets old history, so a room's past as a
  ₹600/month room and its later life as a ₹1500/night room both stay readable in the history list.
