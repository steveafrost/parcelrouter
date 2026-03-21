# Parcel Tracker

A self-hosted package tracking service that automatically reads shipping emails from iCloud Mail and submits tracking numbers to [Parcel](https://parcel.app/).

## Features

- 📧 **IMAP Email Monitoring** - Connects to iCloud Mail via IMAP
- 🔍 **Smart Tracking Extraction** - Automatically detects tracking numbers from UPS, FedEx, USPS, Amazon, DHL, and more
- 📦 **Auto-Submit to Parcel** - Automatically adds tracking to your Parcel account
- 🐳 **Docker Support** - Easy deployment with Docker Compose
- 🔄 **Scheduled Polling** - Checks for new emails on a configurable interval
- 🌐 **REST API** - Simple HTTP API for viewing tracked packages

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd parcel-tracker
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` with your credentials:

```bash
# iCloud Mail (generate app-specific password at appleid.apple.com)
IMAP_USER=your.email@icloud.com
IMAP_PASS=xxxx-xxxx-xxxx-xxxx

# Parcel API (get from https://parcel.app/account/api)
PARCEL_API_KEY=your_api_key_here
```

### 3. Run with Docker

```bash
docker-compose up -d
```

The service will:
- Start the API server on port 9001
- Run an initial poll for emails
- Continue polling every hour (configurable)

### 4. Verify it's Working

```bash
# Check health
curl http://localhost:9001/health

# List tracked packages
curl http://localhost:9001/packages
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/packages` | GET | List all tracked packages |
| `/packages/:id` | GET | Get specific package details |

## Supported Carriers

- UPS
- FedEx
- USPS
- Amazon Logistics
- DHL
- OnTrac
- LaserShip

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   IMAP      │────▶│   Email      │────▶│   Tracking     │
│   Poller    │     │   Parser     │     │   Extractor    │
└─────────────┘     └──────────────┘     └────────────────┘
                                                  │
                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   Parcel    │◀────│   SQLite     │◀────│   Package      │
│   API       │     │   Database   │     │   Repository   │
└─────────────┘     └──────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Express    │
                    │   API Server │
                    └──────────────┘
```

## License

MIT
