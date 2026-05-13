# Foothill Feed — Delivery Day App

**Live data:** [Supabase Project](https://supabase.com/dashboard/project/fvwqjwbxrgfejkdzbxqi)  
**Store:** Foothill Feed · 3293 Taylor Rd, Loomis CA 95650 · (916) 652-7121

## What This App Does
React app for receiving vendor deliveries. Staff upload a PDF invoice, AI parses all line items, then staff check in each item via barcode scanner (USB, camera, or manual UPC entry).

## Features Built (May 7, 2026 version)
- **PDF manifest upload** — drag and drop, AI auto-parses
- **Auto vendor detection** — Newco, VSI, Phillips (routes to correct parser)
- **Barcode scanning** — USB plug-and-play, iPad camera, or manual UPC
- **UPC not found** — fuzzy search by product description
- **Quantity confirm modal** — invoice qty vs received qty
- **Damage flow** — count damaged bags + photo capture
- **Short shipment** — flags missing vs damaged
- **Extra quantity** — noted for inventory, not emailed to vendor
- **Price change detection** — compares to last invoice per UPC, emails jeff@foothillfeedloomis.com
- **Credit memo detection** — auto-routes to Credits tab, never processed as delivery
- **Special orders** — log customer orders, match on arrival
- **Report generation** — call list + shelf stock list + vendor exception email + price change email
- **iPad photo sharing** — QR code to add damage photos from iPad

## Vendors Configured
| Vendor | Rep Email | Order Deadline |
|--------|-----------|----------------|
| Newco | nate.burger@newcodistributors.com | Wednesday |
| VSI | orders@vsi.cc | Tuesday by 2pm |
| Phillips | orders@phillipspet.com | Thursday by 10am |

## How to Update
After any session where this app is modified:
1. Download the updated JSX from Claude outputs
2. Go to [this repo](https://github.com/foothillfeed/delivery-day)
3. Upload/replace `foothill_delivery.jsx`

At the start of a new Claude session, Claude can fetch this file directly from GitHub to work from the current version.

## API Keys (in app code)
- Anthropic API key embedded for PDF parsing
- Supabase anon key for delivery log storage
