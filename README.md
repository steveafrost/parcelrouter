# ParcelRouter

ParcelRouter is a local-first package tracking and delivery event router for your inbox.

It reads shipping emails from your mailbox, extracts tracking numbers, stores package metadata locally, and can sync deliveries to Parcel or your own automations. The goal is not to be another shopping app. The goal is to give you a private package event router you control.

## Who It Is For

- Self-hosting users who want package tracking without handing order emails to another cloud service.
- Home automation users who want package events in webhooks, Home Assistant, reminders, or chat.
- Heavy online shoppers who want a searchable delivery history.
- Developers who want a local delivery-event API.

## What It Does Today

- Monitors iCloud Mail over IMAP.
- Polls INBOX and Archive folders on a schedule.
- Extracts tracking numbers for UPS, FedEx, USPS, Amazon Logistics, DHL, OnTrac, and LaserShip.
- Generates cleaner package titles from sender, subject, retailer, and tracking context.
- Scores detections with high, medium, or low confidence.
- Sends medium and low confidence detections to a review queue before they become deliveries.
- Stores packages and polling state in SQLite.
- Shows a local dashboard.
- Exposes a small REST API.
- Optionally syncs detected packages to the Parcel app through the Parcel API.
- Optionally emits package and review events to a webhook endpoint.
- Runs with Docker Compose.

## How People Start Using It

### 1. Clone The App

```bash
git clone https://github.com/steveafrost/parcel-tracker.git
cd parcel-tracker
```

### 2. Create A Local Environment File

Fast path:

```bash
curl -fsSL https://raw.githubusercontent.com/steveafrost/parcel-tracker/main/install.sh | bash
```

If you already cloned the repo:

```bash
./install.sh
```

Or configure it manually:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
IMAP_HOST=imap.mail.me.com
IMAP_PORT=993
IMAP_USER=your.email@icloud.com
IMAP_PASS=your-apple-app-specific-password
PARCEL_API_KEY=
WEBHOOK_URL=
WEBHOOK_SECRET=
POLL_INTERVAL=3600
```

You need:

- An iCloud app-specific password.
- Optionally, a Parcel Premium API key if you want Parcel sync.
- Optionally, a webhook endpoint if you want delivery events in Home Assistant, n8n, Zapier, ntfy bridges, or your own tools.

See [SETUP.md](./SETUP.md) for the full setup guide.

### 3. Start It

Check your configuration before starting the app:

```bash
npm ci
npm run setup:check
```

```bash
docker-compose up -d --build
```

Open:

```text
http://localhost:9001
```

### 4. Review Packages

The dashboard shows:

- Service health.
- Emails scanned.
- Packages found.
- Parcel sync mode: local-only or enabled.
- Recent deliveries.
- Review queue for uncertain detections.
- Confidence indicators for each detection.

Medium and low-confidence detections wait in the review queue before they become deliveries.

## API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Health check |
| `/stats` | GET | Email and package counts |
| `/packages` | GET | List tracked packages |
| `/packages/:id` | GET | Get one package |
| `/packages/:id` | DELETE | Remove a package from the local tracker |
| `/review` | GET | List pending review items |
| `/review/:id/approve` | POST | Approve a review item and create a package |
| `/review/:id/ignore` | POST | Ignore a review item |

## Webhooks

Set `WEBHOOK_URL` to receive package and review events:

```bash
WEBHOOK_URL=https://example.com/parcel-tracker-webhook
WEBHOOK_SECRET=choose-a-long-random-secret
WEBHOOK_TIMEOUT_MS=5000
```

Each event is sent as JSON:

```json
{
  "event": "package.created",
  "timestamp": "2026-05-19T12:00:00.000Z",
  "data": {
    "package": {
      "trackingNumber": "1Z999AA10123456784",
      "carrier": "UPS"
    }
  }
}
```

Supported events:

- `package.created`
- `package.deleted`
- `review.created`
- `review.approved`
- `review.ignored`
- `parcel.synced`
- `parcel.sync_failed`

When `WEBHOOK_SECRET` is set, requests include `X-Parcel-Tracker-Signature` with a `sha256=` HMAC of the JSON body.

## Development

```bash
npm ci
npm run setup:check
npm test
npm run build
npm run dev
```

Integration tests are skipped by default unless credentials are present.

```bash
SKIP_IMAP_TESTS=true SKIP_PARCEL_TESTS=true npm test -- --runInBand
```

## Marketing Site

The crawlable static marketing page lives in [site/index.html](./site/index.html) and is published at [parcelrouter.com](https://parcelrouter.com). It is intentionally plain static HTML/CSS so it can be hosted anywhere and indexed easily.

## Product Direction

See [docs/product-strategy.md](./docs/product-strategy.md) for the product positioning, competitive map, and roadmap.

The short version:

> Your private package event router. Automatically find packages from your email, review uncertain matches, and sync delivery events to the tools you already use.

## Architecture

```text
IMAP mailbox
  -> Email poller
  -> Parser and tracking extractor
  -> High confidence packages or review queue
  -> SQLite database
  -> Local dashboard and REST API
  -> Optional Parcel sync / webhooks and automations
```

## License

MIT
