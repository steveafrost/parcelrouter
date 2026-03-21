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

```bash
git clone https://github.com/steveafrost/parcel-tracker.git
cd parcel-tracker
cp .env.example .env
# Edit .env with your credentials, then:
docker-compose up -d
```

Open http://localhost:9001

📖 **For detailed setup instructions**, see [SETUP.md](./SETUP.md)

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
