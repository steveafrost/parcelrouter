#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ParcelRouter"
ENV_FILE=".env"
REPO_URL="https://github.com/steveafrost/parcel-tracker.git"
INSTALL_DIR="${PARCEL_TRACKER_DIR:-parcel-tracker}"

print_step() {
  printf '\n==> %s\n' "$1"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    printf 'docker compose'
  elif has_command docker-compose; then
    printf 'docker-compose'
  else
    return 1
  fi
}

prompt_required() {
  local label="$1"
  local var_name="$2"
  local value=""

  while [ -z "$value" ]; do
    read -r -p "$label: " value
  done

  set_env "$var_name" "$value"
}

prompt_secret() {
  local label="$1"
  local var_name="$2"
  local value=""

  while [ -z "$value" ]; do
    read -r -s -p "$label: " value
    printf '\n'
  done

  set_env "$var_name" "$value"
}

prompt_optional() {
  local label="$1"
  local var_name="$2"
  local value=""

  read -r -p "$label: " value
  set_env "$var_name" "$value"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(escape_sed_replacement "$value")"

  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
  rm -f "${ENV_FILE}.bak"
}

print_step "Checking prerequisites"

if [ ! -f ".env.example" ] || [ ! -f "docker-compose.yml" ]; then
  if ! has_command git; then
    printf 'git is required for one-line installation. Install git, then run this script again.\n' >&2
    exit 1
  fi

  if [ -e "$INSTALL_DIR" ]; then
    printf '%s already exists. Set PARCEL_TRACKER_DIR to choose another install folder.\n' "$INSTALL_DIR" >&2
    exit 1
  fi

  print_step "Cloning ${APP_NAME}"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  exec bash install.sh
fi

if ! has_command docker; then
  printf 'Docker is required. Install Docker Desktop or Docker Engine, then run this script again.\n' >&2
  exit 1
fi

COMPOSE="$(compose_cmd || true)"
if [ -z "$COMPOSE" ]; then
  printf 'Docker Compose is required. Install Docker Compose, then run this script again.\n' >&2
  exit 1
fi

if ! has_command npm; then
  printf 'npm is required for the setup check. Install Node.js 20 or newer, then run this script again.\n' >&2
  exit 1
fi

printf 'Found Docker, Docker Compose, and npm.\n'

print_step "Preparing environment"

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  printf 'Created %s from .env.example.\n' "$ENV_FILE"
else
  printf 'Using existing %s.\n' "$ENV_FILE"
fi

if grep -Eq '^IMAP_USER=(your\.email@icloud\.com)?$' "$ENV_FILE" || ! grep -q '^IMAP_USER=' "$ENV_FILE"; then
  prompt_required "iCloud email address" "IMAP_USER"
fi

if grep -Eq '^IMAP_PASS=(your-app-specific-password)?$' "$ENV_FILE" || ! grep -q '^IMAP_PASS=' "$ENV_FILE"; then
  prompt_secret "Apple app-specific password" "IMAP_PASS"
fi

printf '\nOptional integrations. Press Enter to skip.\n'

if grep -Eq '^PARCEL_API_KEY=$' "$ENV_FILE"; then
  prompt_optional "Parcel API key" "PARCEL_API_KEY"
fi

if grep -Eq '^WEBHOOK_URL=$' "$ENV_FILE"; then
  prompt_optional "Webhook URL" "WEBHOOK_URL"
fi

if grep -Eq '^WEBHOOK_SECRET=$' "$ENV_FILE" && grep -Eq '^WEBHOOK_URL=.+$' "$ENV_FILE"; then
  prompt_secret "Webhook signing secret" "WEBHOOK_SECRET"
fi

print_step "Installing dependencies"
npm ci

print_step "Checking configuration"
npm run setup:check

print_step "Starting ${APP_NAME}"
$COMPOSE up -d --build

print_step "Ready"
printf '%s is starting at http://localhost:9001\n' "$APP_NAME"
printf 'Watch logs with: %s logs -f parcel-tracker\n' "$COMPOSE"
