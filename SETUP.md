# Parcel Tracker - Setup Guide

Complete setup instructions for self-hosted package tracking from iCloud Mail to Parcel.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before starting, you'll need:

1. **iCloud Mail account** with 2-factor authentication enabled
2. **Parcel Premium account** (required for API access)
3. **Docker & Docker Compose** installed on your machine
4. **macOS, Linux, or Windows** with WSL2

## Quick Start

For the impatient:

```bash
# 1. Clone the repo
git clone https://github.com/steveafrost/parcel-tracker.git
cd parcel-tracker

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your credentials (see below)
nano .env

# 4. Start with Docker
docker-compose up -d

# 5. Open dashboard
open http://localhost:9001
```

## Detailed Setup

### Step 1: Get iCloud App-Specific Password

Since you have 2FA enabled on your Apple ID, you need an app-specific password:

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. Go to **Sign-In and Security** → **App-Specific Passwords**
4. Click **Generate an app-specific password**
5. Name it "Parcel Tracker" and copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

**Important**: This password is shown only once. Save it in your `.env` file immediately.

### Step 2: Get Parcel API Key

1. Sign in to [web.parcelapp.net](https://web.parcelapp.net) with your Parcel account
2. Go to **Account** → **API** (requires Parcel Premium subscription)
3. Generate a new API key
4. Copy the key (starts with something like `parcel_...`)

### Step 3: Configure Environment Variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# iCloud Mail Configuration
IMAP_USER=your.email@icloud.com
IMAP_PASS=abcd-efgh-ijkl-mnop  # Your app-specific password from Step 1

# Parcel API Configuration  
PARCEL_API_KEY=parcel_live_xxxxx  # Your API key from Step 2

# Optional: Adjust polling interval (default: 3600 seconds = 1 hour)
# POLL_INTERVAL=1800  # Check every 30 minutes instead
```

### Step 4: Deploy with Docker

Build and start the container:

```bash
docker-compose up -d --build
```

Check the logs to ensure it's working:

```bash
docker logs -f parcel-tracker
```

You should see:
```
Starting scheduler with cron: */30 * * * *
Server running on port 3000
Polling folder: INBOX
...
```

### Step 5: Access the Dashboard

Open your browser to:

```
http://localhost:9001
```

The dashboard shows:
- System status
- Emails scanned count
- Packages found count
- API quota usage (20/day limit)
- Confidence indicators for each package

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMAP_USER` | Yes | - | Your iCloud email address |
| `IMAP_PASS` | Yes | - | App-specific password from Apple ID |
| `PARCEL_API_KEY` | Yes | - | API key from Parcel web app |
| `IMAP_HOST` | No | `imap.mail.me.com` | IMAP server (don't change for iCloud) |
| `IMAP_PORT` | No | `993` | IMAP port |
| `POLL_INTERVAL` | No | `3600` | Seconds between email checks |

### Polling Behavior

By default, the tracker:
- Polls **INBOX** folder continuously
- Polls **Archive** folder from March 15, 2026 forward
- Checks every 30-60 minutes (configurable)
- Skips emails already processed (tracked by Message-ID)

### Confidence Levels

Each package shows a confidence indicator:

- **🟢 High** (90-99%): UPS, Amazon Logistics, USPS - very specific formats
- **🟡 Medium** (70-85%): FedEx with tracking context
- **🔴 Low** (40-60%): Short digit sequences - **review these manually**

Low confidence packages are highlighted with red borders and warning banners.

## Docker Deployment

### Standard Deployment

```bash
# Start
docker-compose up -d

# View logs
docker logs -f parcel-tracker

# Stop
docker-compose down

# Restart
docker-compose restart
```

### Data Persistence

Your data is stored in a SQLite database at `./data/tracker.db` on your host machine. This persists across container restarts.

To reset all data:

```bash
docker-compose down
rm -rf data/
docker-compose up -d
```

### Port Configuration

The service runs on port **9001** by default (mapped to container port 3000). To change:

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Change to your preferred port
```

Then access at `http://localhost:8080`

## Troubleshooting

### "Failed to submit to Parcel" errors

The Parcel API has a **20 requests per day** limit. If you hit this:
- Wait until tomorrow (resets daily)
- Check your Parcel app - packages may already be there
- Lower your polling frequency: `POLL_INTERVAL=7200` (2 hours)

### "Cannot connect to IMAP" errors

1. Verify your app-specific password is correct
2. Check your Apple ID allows IMAP access
3. Ensure 2FA is enabled (required for app-specific passwords)

### "No packages found"

1. Check the dashboard stats - are emails being scanned?
2. Look for shipping emails in your INBOX from supported carriers
3. Verify shipping emails aren't being filtered to another folder
4. Check the logs: `docker logs parcel-tracker | grep -i "found"

### Dashboard not loading

1. Check container is running: `docker ps | grep parcel`
2. Check logs for errors: `docker logs parcel-tracker`
3. Verify port 9001 isn't in use: `lsof -i :9001`

### Wrong tracking numbers extracted

If the tracker picks up order numbers instead of tracking numbers:
1. Look for the **confidence indicator** on the package card
2. **Low confidence** packages (red) should be manually verified
3. The system now filters out common order number patterns

### Reset everything and start fresh

```bash
docker-compose down
rm -rf data/
docker-compose up -d --build
```

This wipes the database and rescans all emails.

## API Reference

If you want to build on top of this:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health check |
| `GET /stats` | Email/package counts |
| `GET /packages` | List all tracked packages |
| `GET /packages/:id` | Get specific package |
| `DELETE /packages/:id` | Remove package from tracker |

## Next Steps

- 📧 Check your Archive folder for old shipping emails
- ⚠️ Review any **Low Confidence** packages in the dashboard
- 🔔 Watch your API quota (20/day) - shown in dashboard
- 🐛 Report issues at: https://github.com/steveafrost/parcel-tracker/issues

## Support

- **Parcel API docs**: https://parcel.app/help/api-add-delivery.html
- **GitHub Issues**: https://github.com/steveafrost/parcel-tracker/issues
- **Apple ID help**: https://support.apple.com/en-us/HT204397
