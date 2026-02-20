#!/usr/bin/env bash

set -euo pipefail

RESOURCE_GROUP="fangio-rg"
LOCATION="eastus"
STATIC_LOCATION="centralus"
APP_SERVICE_PLAN="fangio-plan"
APP_SERVICE_SKU="B1"
API_APP_NAME="fangio-api-$(date +%s)"
STATIC_WEB_APP_NAME="fangio-web-$(date +%s)"
SUBSCRIPTION=""
SET_GITHUB_SECRETS="false"
LOCATION_PROVIDED="false"
STATIC_LOCATION_PROVIDED="false"

usage() {
  cat <<'USAGE'
Usage: scripts/setup-azure-student.sh [options]

Options:
  --resource-group <name>      Azure resource group (default: fangio-rg)
  --location <region>          Azure region for API resources (default: eastus)
  --static-location <region>   Azure region for Static Web App (default: centralus)
  --plan-name <name>           App Service plan name (default: fangio-plan)
  --plan-sku <sku>             App Service plan sku (default: B1)
  --api-app-name <name>        App Service app name (global unique)
  --web-app-name <name>        Static Web App name (global unique)
  --subscription <id-or-name>  Azure subscription id or name
  --set-github-secrets         Push required GitHub Actions secrets via gh CLI
  --help                       Show this help

Examples:
  scripts/setup-azure-student.sh
  scripts/setup-azure-student.sh --resource-group fangio-rg --api-app-name fangio-api-demo --web-app-name fangio-web-demo
  scripts/setup-azure-student.sh --set-github-secrets
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
      LOCATION_PROVIDED="true"
      shift 2
      ;;
    --static-location)
      STATIC_LOCATION="$2"
      STATIC_LOCATION_PROVIDED="true"
      shift 2
      ;;
    --plan-name)
      APP_SERVICE_PLAN="$2"
      shift 2
      ;;
    --plan-sku)
      APP_SERVICE_SKU="$2"
      shift 2
      ;;
    --api-app-name)
      API_APP_NAME="$2"
      shift 2
      ;;
    --web-app-name)
      STATIC_WEB_APP_NAME="$2"
      shift 2
      ;;
    --subscription)
      SUBSCRIPTION="$2"
      shift 2
      ;;
    --set-github-secrets)
      SET_GITHUB_SECRETS="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run_az() {
  if [[ -n "$SUBSCRIPTION" ]]; then
    az "$@" --subscription "$SUBSCRIPTION"
  else
    az "$@"
  fi
}

add_unique_candidate() {
  local value="$1"
  local array_name="$2"

  if [[ -z "$value" ]]; then
    return
  fi

  local existing_values=()
  eval "existing_values=(\"\${${array_name}[@]}\")"

  local existing
  for existing in "${existing_values[@]}"; do
    if [[ "$existing" == "$value" ]]; then
      return
    fi
  done

  eval "${array_name}+=(\"\$value\")"
}

build_appservice_region_candidates() {
  APP_SERVICE_REGION_CANDIDATES=()
  add_unique_candidate "$LOCATION" APP_SERVICE_REGION_CANDIDATES

  while IFS= read -r region; do
    add_unique_candidate "$region" APP_SERVICE_REGION_CANDIDATES
  done < <(
    run_az appservice list-locations \
      --sku "$APP_SERVICE_SKU" \
      --linux-workers-enabled \
      --query "[].name" \
      -o tsv 2>/dev/null || true
  )

  # Common safe fallbacks for constrained subscriptions.
  add_unique_candidate "eastus2" APP_SERVICE_REGION_CANDIDATES
  add_unique_candidate "centralus" APP_SERVICE_REGION_CANDIDATES
  add_unique_candidate "westus2" APP_SERVICE_REGION_CANDIDATES
  add_unique_candidate "westus3" APP_SERVICE_REGION_CANDIDATES
}

build_static_region_candidates() {
  STATIC_REGION_CANDIDATES=()
  add_unique_candidate "$STATIC_LOCATION" STATIC_REGION_CANDIDATES
  add_unique_candidate "$LOCATION" STATIC_REGION_CANDIDATES

  # Common Static Web Apps regions.
  add_unique_candidate "centralus" STATIC_REGION_CANDIDATES
  add_unique_candidate "eastus2" STATIC_REGION_CANDIDATES
  add_unique_candidate "westus2" STATIC_REGION_CANDIDATES
  add_unique_candidate "westeurope" STATIC_REGION_CANDIDATES
  add_unique_candidate "northeurope" STATIC_REGION_CANDIDATES

  while IFS= read -r region; do
    add_unique_candidate "$region" STATIC_REGION_CANDIDATES
  done < <(
    run_az account list-locations --query "[].name" -o tsv 2>/dev/null || true
  )
}

require_cmd az

if ! run_az account show >/dev/null 2>&1; then
  echo "Azure CLI is not authenticated. Run: az login" >&2
  exit 1
fi

if [[ "$SET_GITHUB_SECRETS" == "true" ]]; then
  require_cmd gh
  if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
    exit 1
  fi
fi

echo "Creating resource group: ${RESOURCE_GROUP}"
run_az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

if run_az appservice plan show --resource-group "$RESOURCE_GROUP" --name "$APP_SERVICE_PLAN" >/dev/null 2>&1; then
  echo "Using existing App Service plan: ${APP_SERVICE_PLAN}"
else
  echo "Creating App Service plan: ${APP_SERVICE_PLAN}"
  run_az appservice plan create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_SERVICE_PLAN" \
    --is-linux \
    --location "$LOCATION" \
    --sku "$APP_SERVICE_SKU" \
    --output none
fi

if run_az webapp show --resource-group "$RESOURCE_GROUP" --name "$API_APP_NAME" >/dev/null 2>&1; then
  echo "Using existing API app: ${API_APP_NAME}"
  run_az webapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$API_APP_NAME" \
    --https-only true \
    --output none
else
  echo "Creating API app: ${API_APP_NAME}"
  run_az webapp create \
    --resource-group "$RESOURCE_GROUP" \
    --plan "$APP_SERVICE_PLAN" \
    --name "$API_APP_NAME" \
    --runtime "node:20LTS" \
    --https-only true \
    --output none
fi

if run_az staticwebapp show --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" >/dev/null 2>&1; then
  echo "Using existing Static Web App: ${STATIC_WEB_APP_NAME}"
else
  echo "Creating Static Web App: ${STATIC_WEB_APP_NAME}"
  run_az staticwebapp create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$STATIC_WEB_APP_NAME" \
    --location "$STATIC_LOCATION" \
    --sku Free \
    --output none
fi

API_HOST="$(run_az webapp show --resource-group "$RESOURCE_GROUP" --name "$API_APP_NAME" --query defaultHostName -o tsv)"
WEB_HOST="$(run_az staticwebapp show --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query defaultHostname -o tsv)"
API_URL="https://${API_HOST}"
WEB_URL="https://${WEB_HOST}"

echo "Configuring API app settings"
run_az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$API_APP_NAME" \
  --settings NODE_ENV=production CORS_ORIGINS="$WEB_URL" \
  --output none

PUBLISH_PROFILE_FILE="$(mktemp)"
cleanup() {
  rm -f "$PUBLISH_PROFILE_FILE"
}
trap cleanup EXIT

run_az webapp deployment list-publishing-profiles \
  --resource-group "$RESOURCE_GROUP" \
  --name "$API_APP_NAME" \
  --xml >"$PUBLISH_PROFILE_FILE"

SWA_TOKEN="$(run_az staticwebapp secrets list --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query properties.apiKey -o tsv || true)"
if [[ -z "$SWA_TOKEN" ]]; then
  SWA_TOKEN="$(run_az staticwebapp secrets list --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query apiKey -o tsv || true)"
fi

if [[ -z "$SWA_TOKEN" ]]; then
  echo "Could not retrieve Static Web Apps deployment token." >&2
  exit 1
fi

if [[ "$SET_GITHUB_SECRETS" == "true" ]]; then
  echo "Setting GitHub Actions secrets in current repository"
  gh secret set AZURE_API_APP_NAME --body "$API_APP_NAME"
  gh secret set AZURE_API_PUBLISH_PROFILE <"$PUBLISH_PROFILE_FILE"
  gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body "$SWA_TOKEN"
  gh secret set VITE_API_URL --body "$API_URL"
fi

cat <<EOF

Azure setup complete.

API URL:
  $API_URL

Web URL:
  $WEB_URL

GitHub workflow secrets:
  AZURE_API_APP_NAME=$API_APP_NAME
  AZURE_API_PUBLISH_PROFILE=<xml from az webapp deployment list-publishing-profiles --xml>
  AZURE_STATIC_WEB_APPS_API_TOKEN=<token from az staticwebapp secrets list>
  VITE_API_URL=$API_URL

If you did not use --set-github-secrets, run:
  gh secret set AZURE_API_APP_NAME --body "$API_APP_NAME"
  az webapp deployment list-publishing-profiles --resource-group "$RESOURCE_GROUP" --name "$API_APP_NAME" --xml | gh secret set AZURE_API_PUBLISH_PROFILE
  gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body "$(az staticwebapp secrets list --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query properties.apiKey -o tsv)"
  gh secret set VITE_API_URL --body "$API_URL"

Then trigger:
  - .github/workflows/deploy-api-appservice.yml
  - .github/workflows/deploy-web-static.yml

EOF
