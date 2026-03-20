# Parcel Tracker Design Document

## Overview
Self-hosted package tracking automation that reads iCloud Mail via IMAP, extracts tracking information, and auto-submits to Parcel API.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Container                         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  IMAP       │──▶│  Email       │──▶│  Tracking        │  │
│  │  Poller     │   │  Parser      │   │  Extractor       │  │
│  │  (hourly)   │   │              │   │                  │  │
│  └─────────────┘   └──────────────┘   └──────────────────┘  │
│                                               │              │
│                                               ▼              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SQLite Database (persistent volume)                  │   │
│  │  - tracked_packages table                             │   │
│  │  - tracking_events table                              │   │
│  │  - last_poll_timestamp                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                               │              │
│                                               ▼              │
│  ┌─────────────┐   ┌────────────────────────────────────┐   │
│  │  Parcel     │◀──│  Minimal Web API                   │   │
│  │  API        │   │  - Health/status endpoint          │   │
│  │  Client     │   │  - List tracked packages           │   │
│  └─────────────┘   └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. IMAP Poller (`src/imap/poller.ts`)
- Runs on configurable interval (default: hourly)
- Connects to imap.mail.me.com:993
- Fetches unread emails since last poll
- Tracks processed Message-IDs to avoid reprocessing

### 2. Email Parser (`src/parser/email-parser.ts`)
Filters emails by:
- Sender domain patterns (amazon.com, fedex.com, ups.com, etc.)
- Subject keywords (tracking, shipped, delivered, order)

Extracts:
- Tracking number via regex patterns
- Carrier from tracking format or sender
- Product name from email subject line

### 3. Tracking Extractor (`src/parser/tracking-patterns.ts`)
Regex patterns for carriers:
```
UPS:        1Z[A-Z0-9]{16}
FedEx:      [0-9]{12}|[0-9]{15}
USPS:      [0-9]{20,22}|[A-Z]{2}[0-9]{9}[A-Z]{2}
DHL:        [0-9]{10,11}
Amazon:     TBA[0-9]{12}|TBC[0-9]{12}|TBM[0-9]{12}
```

### 4. Parcel API Client (`src/parcel/client.ts`)
- Auto-submits tracking numbers immediately
- POST /packages with tracking_number, carrier, name (email subject)
- Stores parcel_package_id in database
- Handles rate limiting and retries

### 5. Database (`src/db/`)
SQLite with tables:
- `tracked_packages`: id, tracking_number, carrier, retailer, product_name, order_number, email_message_id, parcel_package_id, created_at
- `tracking_events`: id, package_id, status, location, timestamp, description
- `last_poll`: timestamp of last successful IMAP poll

### 6. Web API (`src/api/server.ts`)
Minimal Express endpoints:
- GET /health - service status
- GET /packages - list tracked packages
- GET /packages/:id - package details
- POST /packages - manually add tracking
- DELETE /packages/:id - remove tracking

## Environment Variables
```
IMAP_HOST=imap.mail.me.com
IMAP_PORT=993
IMAP_USER=<icloud-email>
IMAP_PASS=<app-specific-password>
PARCEL_API_KEY=<parcel-api-key>
POLL_INTERVAL=3600
LOG_LEVEL=info
```

## Docker Setup
- Node.js 20 Alpine base image
- SQLite persisted via volume mount
- Single container deployment
- Health check endpoint

## Design Decisions

1. **Auto-submit**: No review queue - packages submit immediately
2. **Email subject as product name**: Simple, no body parsing complexity
3. **No archive logic**: Parcel handles lifecycle
4. **Minimal UI**: API-first, add React/Vue later if needed
5. **SQLite**: Single file, no separate DB container needed
