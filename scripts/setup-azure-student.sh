#!/usr/bin/env bash

set -euo pipefail

RESOURCE_GROUP="fangio-rg"
LOCATION="eastus"
STATIC_LOCATION="centralus"
APP_SERVICE_PLAN="fangio-plan"
APP_SERVICE_SKU="B1"
API_APP_NAME="fangio-api-$(date +%s)"
STATIC_WEB_APP_NAME="fangio-web-$(date +%s)"
API_RUNTIME=""
SUBSCRIPTION=""
SET_GITHUB_SECRETS="false"

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
  --api-runtime <value>        Linux runtime for App Service (example: NODE|20-lts)
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
      shift 2
      ;;
    --static-location)
      STATIC_LOCATION="$2"
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
    --api-runtime)
      API_RUNTIME="$2"
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

  local normalized_value
  normalized_value="$(normalize_region "$value")"
  if [[ -z "$normalized_value" ]]; then
    return
  fi

  local existing_values=()
  set +u
  eval "existing_values=(\"\${${array_name}[@]}\")"
  set -u

  if (( ${#existing_values[@]} > 0 )); then
    local existing
    for existing in "${existing_values[@]}"; do
      if [[ "$existing" == "$normalized_value" ]]; then
        return
      fi
    done
  fi

  set +u
  eval "${array_name}+=(\"\$normalized_value\")"
  set -u
}

normalize_region() {
  local value="$1"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="${value// /}"
  value="${value//-/}"
  value="${value//_/}"
  value="${value//\(/}"
  value="${value//\)/}"
  value="${value//./}"
  printf '%s' "$value"
}

add_unique_runtime_candidate() {
  local value="$1"
  local array_name="$2"

  value="$(printf '%s' "$value" | tr -d '\r' | xargs)"
  if [[ -z "$value" ]]; then
    return
  fi

  local existing_values=()
  set +u
  eval "existing_values=(\"\${${array_name}[@]}\")"
  set -u

  if (( ${#existing_values[@]} > 0 )); then
    local existing
    for existing in "${existing_values[@]}"; do
      if [[ "$existing" == "$value" ]]; then
        return
      fi
    done
  fi

  set +u
  eval "${array_name}+=(\"\$value\")"
  set -u
}

build_runtime_candidates() {
  RUNTIME_CANDIDATES=()

  if [[ -n "$API_RUNTIME" ]]; then
    add_unique_runtime_candidate "$API_RUNTIME" RUNTIME_CANDIDATES
  fi

  while IFS= read -r runtime; do
    add_unique_runtime_candidate "$runtime" RUNTIME_CANDIDATES
  done < <(
    run_az webapp list-runtimes \
      --os-type linux \
      --query "[?starts_with(@, 'NODE|') || starts_with(@, 'node|') || starts_with(@, 'NODE:') || starts_with(@, 'node:')]" \
      -o tsv 2>/dev/null || true
  )

  # Fallbacks for older/newer CLI and API versions.
  add_unique_runtime_candidate "NODE|20-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "node|20-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "NODE:20-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "node:20-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "NODE|20LTS" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "node|20LTS" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "NODE:20LTS" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "node:20LTS" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "NODE|18-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "node|18-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "NODE:18-lts" RUNTIME_CANDIDATES
  add_unique_runtime_candidate "node:18-lts" RUNTIME_CANDIDATES
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
  add_unique_candidate "uksouth" STATIC_REGION_CANDIDATES
  add_unique_candidate "australiaeast" STATIC_REGION_CANDIDATES
  add_unique_candidate "southeastasia" STATIC_REGION_CANDIDATES
  add_unique_candidate "japaneast" STATIC_REGION_CANDIDATES
  add_unique_candidate "brazilsouth" STATIC_REGION_CANDIDATES
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
  build_appservice_region_candidates

  PLAN_CREATED="false"
  PLAN_LAST_ERROR_FILE="$(mktemp)"
  for candidate_region in "${APP_SERVICE_REGION_CANDIDATES[@]}"; do
    echo "Trying App Service region: ${candidate_region}"
    if run_az appservice plan create \
      --resource-group "$RESOURCE_GROUP" \
      --name "$APP_SERVICE_PLAN" \
      --is-linux \
      --location "$candidate_region" \
      --sku "$APP_SERVICE_SKU" \
      --output none >"$PLAN_LAST_ERROR_FILE" 2>&1; then
      LOCATION="$candidate_region"
      PLAN_CREATED="true"
      echo "App Service plan created in region: ${LOCATION}"
      break
    else
      err_line="$(tail -n 1 "$PLAN_LAST_ERROR_FILE" 2>/dev/null || true)"
      if [[ -n "$err_line" ]]; then
        echo "Region ${candidate_region} rejected: ${err_line}"
      fi
    fi
  done

  if [[ "$PLAN_CREATED" != "true" ]]; then
    echo "Failed to create App Service plan in all candidate regions." >&2
    cat "$PLAN_LAST_ERROR_FILE" >&2 || true
    rm -f "$PLAN_LAST_ERROR_FILE"
    exit 1
  fi
  rm -f "$PLAN_LAST_ERROR_FILE"
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
  build_runtime_candidates

  WEBAPP_CREATED="false"
  WEBAPP_LAST_ERROR_FILE="$(mktemp)"
  for candidate_runtime in "${RUNTIME_CANDIDATES[@]}"; do
    echo "Trying Linux runtime: ${candidate_runtime}"
    if run_az webapp create \
      --resource-group "$RESOURCE_GROUP" \
      --plan "$APP_SERVICE_PLAN" \
      --name "$API_APP_NAME" \
      --runtime "$candidate_runtime" \
      --https-only true \
      --output none >"$WEBAPP_LAST_ERROR_FILE" 2>&1; then
      API_RUNTIME="$candidate_runtime"
      WEBAPP_CREATED="true"
      echo "API app created with runtime: ${API_RUNTIME}"
      break
    else
      err_line="$(tail -n 1 "$WEBAPP_LAST_ERROR_FILE" 2>/dev/null || true)"
      if [[ -n "$err_line" ]]; then
        echo "Runtime ${candidate_runtime} rejected: ${err_line}"
      fi
    fi
  done

  if [[ "$WEBAPP_CREATED" != "true" ]]; then
    echo "Failed to create API app with available Node runtimes." >&2
    cat "$WEBAPP_LAST_ERROR_FILE" >&2 || true
    rm -f "$WEBAPP_LAST_ERROR_FILE"
    exit 1
  fi
  rm -f "$WEBAPP_LAST_ERROR_FILE"
fi

if run_az staticwebapp show --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" >/dev/null 2>&1; then
  echo "Using existing Static Web App: ${STATIC_WEB_APP_NAME}"
else
  echo "Creating Static Web App: ${STATIC_WEB_APP_NAME}"
  build_static_region_candidates

  SWA_CREATED="false"
  SWA_LAST_ERROR_FILE="$(mktemp)"
  for candidate_region in "${STATIC_REGION_CANDIDATES[@]}"; do
    echo "Trying Static Web App region: ${candidate_region}"
    if run_az staticwebapp create \
      --resource-group "$RESOURCE_GROUP" \
      --name "$STATIC_WEB_APP_NAME" \
      --location "$candidate_region" \
      --sku Free \
      --output none >"$SWA_LAST_ERROR_FILE" 2>&1; then
      STATIC_LOCATION="$candidate_region"
      SWA_CREATED="true"
      echo "Static Web App created in region: ${STATIC_LOCATION}"
      break
    else
      err_line="$(tail -n 1 "$SWA_LAST_ERROR_FILE" 2>/dev/null || true)"
      if [[ -n "$err_line" ]]; then
        echo "Region ${candidate_region} rejected: ${err_line}"
      fi
    fi
  done

  if [[ "$SWA_CREATED" != "true" ]]; then
    echo "Trying Static Web App create with Azure default location"
    if run_az staticwebapp create \
      --resource-group "$RESOURCE_GROUP" \
      --name "$STATIC_WEB_APP_NAME" \
      --sku Free \
      --output none >"$SWA_LAST_ERROR_FILE" 2>&1; then
      SWA_CREATED="true"
      STATIC_LOCATION="azure-default"
      echo "Static Web App created with Azure default location"
    fi
  fi

  if [[ "$SWA_CREATED" != "true" ]]; then
    echo "Failed to create Static Web App in all candidate regions." >&2
    cat "$SWA_LAST_ERROR_FILE" >&2 || true
    rm -f "$SWA_LAST_ERROR_FILE"
    exit 1
  fi
  rm -f "$SWA_LAST_ERROR_FILE"
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
  API_RUNTIME_USED=${API_RUNTIME:-auto}

If you did not use --set-github-secrets, run:
  gh secret set AZURE_API_APP_NAME --body "$API_APP_NAME"
  az webapp deployment list-publishing-profiles --resource-group "$RESOURCE_GROUP" --name "$API_APP_NAME" --xml | gh secret set AZURE_API_PUBLISH_PROFILE
  gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body "$(az staticwebapp secrets list --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query properties.apiKey -o tsv)"
  gh secret set VITE_API_URL --body "$API_URL"

Then trigger:
  - .github/workflows/deploy-api-appservice.yml
  - .github/workflows/deploy-web-static.yml

EOF
