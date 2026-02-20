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
WEB_HOSTING_MODE="staticwebapp"
WEB_APP_SERVICE_NAME=""
WEB_URL=""
WEB_HOSTING_REQUEST="auto"

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
  --web-hosting <mode>         Web hosting mode: auto, staticwebapp, appservice (default: auto)
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
    --web-hosting)
      WEB_HOSTING_REQUEST="$2"
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

case "$WEB_HOSTING_REQUEST" in
  auto|staticwebapp|appservice)
    ;;
  *)
    echo "Invalid --web-hosting value: $WEB_HOSTING_REQUEST (use auto, staticwebapp, or appservice)" >&2
    exit 1
    ;;
esac

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

extract_error_summary() {
  local error_file="$1"
  local summary

  summary="$(
    (
      grep -E '^\([^)]+\)|^Code:|^Message:|^ERROR:' "$error_file" 2>/dev/null || true
    ) | head -n 3 | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/[[:space:]]$//'
  )"

  if [[ -z "$summary" ]]; then
    summary="$(tail -n 5 "$error_file" 2>/dev/null | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/[[:space:]]$//')"
  fi

  printf '%s' "$summary"
}

create_web_on_appservice() {
  WEB_APP_SERVICE_NAME="$STATIC_WEB_APP_NAME"
  WEB_HOSTING_MODE="appservice"

  if run_az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_SERVICE_NAME" >/dev/null 2>&1; then
    echo "Using existing Web App (fallback mode): ${WEB_APP_SERVICE_NAME}"
  else
    echo "Creating Web App fallback on App Service: ${WEB_APP_SERVICE_NAME}"
    build_runtime_candidates

    local fallback_created="false"
    local fallback_error_file
    fallback_error_file="$(mktemp)"

    for candidate_runtime in "${RUNTIME_CANDIDATES[@]}"; do
      echo "Trying Web App runtime: ${candidate_runtime}"
      if run_az webapp create \
        --resource-group "$RESOURCE_GROUP" \
        --plan "$APP_SERVICE_PLAN" \
        --name "$WEB_APP_SERVICE_NAME" \
        --runtime "$candidate_runtime" \
        --https-only true \
        --output none >"$fallback_error_file" 2>&1; then
        fallback_created="true"
        echo "Web App fallback created with runtime: ${candidate_runtime}"
        break
      else
        err_summary="$(extract_error_summary "$fallback_error_file")"
        if [[ -n "$err_summary" ]]; then
          echo "Runtime ${candidate_runtime} rejected: ${err_summary}"
        fi
      fi
    done

    if [[ "$fallback_created" != "true" ]]; then
      echo "Failed to create Web App fallback with available Node runtimes." >&2
      cat "$fallback_error_file" >&2 || true
      rm -f "$fallback_error_file"
      exit 1
    fi
    rm -f "$fallback_error_file"
  fi

  if ! run_az webapp config set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_SERVICE_NAME" \
    --startup-file "pm2 serve /home/site/wwwroot --no-daemon --spa" \
    --output none >/dev/null 2>&1; then
    echo "Warning: could not set startup command automatically. Set it manually to: pm2 serve /home/site/wwwroot --no-daemon --spa"
  fi

  run_az webapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_SERVICE_NAME" \
    --https-only true \
    --output none >/dev/null 2>&1 || true

  local web_host
  web_host="$(run_az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_SERVICE_NAME" --query defaultHostName -o tsv)"
  WEB_URL="https://${web_host}"
  echo "Web UI fallback URL: ${WEB_URL}"
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
      err_summary="$(extract_error_summary "$PLAN_LAST_ERROR_FILE")"
      if [[ -n "$err_summary" ]]; then
        echo "Region ${candidate_region} rejected: ${err_summary}"
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
      err_summary="$(extract_error_summary "$WEBAPP_LAST_ERROR_FILE")"
      if [[ -n "$err_summary" ]]; then
        echo "Runtime ${candidate_runtime} rejected: ${err_summary}"
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

if [[ "$WEB_HOSTING_REQUEST" == "appservice" ]]; then
  echo "Web hosting mode forced to appservice"
  create_web_on_appservice
else
  if run_az staticwebapp show --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" >/dev/null 2>&1; then
    echo "Using existing Static Web App: ${STATIC_WEB_APP_NAME}"
    WEB_HOSTING_MODE="staticwebapp"
    WEB_HOST="$(run_az staticwebapp show --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query defaultHostname -o tsv)"
    WEB_URL="https://${WEB_HOST}"
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
        WEB_HOSTING_MODE="staticwebapp"
        echo "Static Web App created in region: ${STATIC_LOCATION}"
        break
      else
        err_summary="$(extract_error_summary "$SWA_LAST_ERROR_FILE")"
        if [[ -n "$err_summary" ]]; then
          echo "Region ${candidate_region} rejected: ${err_summary}"
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
        WEB_HOSTING_MODE="staticwebapp"
        echo "Static Web App created with Azure default location"
      fi
    fi

    if [[ "$SWA_CREATED" == "true" ]]; then
      WEB_HOST="$(run_az staticwebapp show --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query defaultHostname -o tsv)"
      WEB_URL="https://${WEB_HOST}"
    fi

    if [[ "$SWA_CREATED" != "true" ]]; then
      if [[ "$WEB_HOSTING_REQUEST" == "auto" ]]; then
        echo "Static Web App provisioning failed due subscription policy. Falling back to App Service hosting for web UI."
        create_web_on_appservice
      else
        echo "Failed to create Static Web App in all candidate regions." >&2
        cat "$SWA_LAST_ERROR_FILE" >&2 || true
        rm -f "$SWA_LAST_ERROR_FILE"
        exit 1
      fi
    fi
    rm -f "$SWA_LAST_ERROR_FILE"
  fi
fi

API_HOST="$(run_az webapp show --resource-group "$RESOURCE_GROUP" --name "$API_APP_NAME" --query defaultHostName -o tsv)"
API_URL="https://${API_HOST}"

if [[ -z "$WEB_URL" ]]; then
  echo "Failed to determine web URL for hosting mode: ${WEB_HOSTING_MODE}" >&2
  exit 1
fi

echo "Configuring API app settings"
run_az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$API_APP_NAME" \
  --settings NODE_ENV=production CORS_ORIGINS="$WEB_URL" \
  --output none

PUBLISH_PROFILE_FILE="$(mktemp)"
WEB_PUBLISH_PROFILE_FILE=""
cleanup() {
  rm -f "$PUBLISH_PROFILE_FILE"
  if [[ -n "$WEB_PUBLISH_PROFILE_FILE" ]]; then
    rm -f "$WEB_PUBLISH_PROFILE_FILE"
  fi
}
trap cleanup EXIT

run_az webapp deployment list-publishing-profiles \
  --resource-group "$RESOURCE_GROUP" \
  --name "$API_APP_NAME" \
  --xml >"$PUBLISH_PROFILE_FILE"

SWA_TOKEN=""
if [[ "$WEB_HOSTING_MODE" == "staticwebapp" ]]; then
  SWA_TOKEN="$(run_az staticwebapp secrets list --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query properties.apiKey -o tsv || true)"
  if [[ -z "$SWA_TOKEN" ]]; then
    SWA_TOKEN="$(run_az staticwebapp secrets list --resource-group "$RESOURCE_GROUP" --name "$STATIC_WEB_APP_NAME" --query apiKey -o tsv || true)"
  fi

  if [[ -z "$SWA_TOKEN" ]]; then
    echo "Could not retrieve Static Web Apps deployment token." >&2
    exit 1
  fi
else
  WEB_PUBLISH_PROFILE_FILE="$(mktemp)"
  run_az webapp deployment list-publishing-profiles \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_SERVICE_NAME" \
    --xml >"$WEB_PUBLISH_PROFILE_FILE"
fi

if [[ "$SET_GITHUB_SECRETS" == "true" ]]; then
  echo "Setting GitHub Actions secrets in current repository"
  gh secret set AZURE_API_APP_NAME --body "$API_APP_NAME"
  gh secret set AZURE_API_PUBLISH_PROFILE <"$PUBLISH_PROFILE_FILE"
  gh secret set VITE_API_URL --body "$API_URL"

  if [[ "$WEB_HOSTING_MODE" == "staticwebapp" ]]; then
    gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body "$SWA_TOKEN"
  else
    gh secret set AZURE_WEB_APP_NAME --body "$WEB_APP_SERVICE_NAME"
    gh secret set AZURE_WEB_PUBLISH_PROFILE <"$WEB_PUBLISH_PROFILE_FILE"
  fi
fi

echo
echo "Azure setup complete."
echo
echo "API URL:"
echo "  $API_URL"
echo
echo "Web URL:"
echo "  $WEB_URL"
echo
echo "Web hosting mode:"
echo "  $WEB_HOSTING_MODE"
echo
echo "GitHub workflow secrets:"
echo "  AZURE_API_APP_NAME=$API_APP_NAME"
echo "  AZURE_API_PUBLISH_PROFILE=<xml from az webapp deployment list-publishing-profiles --xml>"
echo "  VITE_API_URL=$API_URL"
echo "  API_RUNTIME_USED=${API_RUNTIME:-auto}"
if [[ "$WEB_HOSTING_MODE" == "staticwebapp" ]]; then
  echo "  AZURE_STATIC_WEB_APPS_API_TOKEN=<token from az staticwebapp secrets list>"
else
  echo "  AZURE_WEB_APP_NAME=$WEB_APP_SERVICE_NAME"
  echo "  AZURE_WEB_PUBLISH_PROFILE=<xml from az webapp deployment list-publishing-profiles for web app>"
fi
echo
echo "If you did not use --set-github-secrets, run:"
echo "  gh secret set AZURE_API_APP_NAME --body \"$API_APP_NAME\""
echo "  az webapp deployment list-publishing-profiles --resource-group \"$RESOURCE_GROUP\" --name \"$API_APP_NAME\" --xml | gh secret set AZURE_API_PUBLISH_PROFILE"
echo "  gh secret set VITE_API_URL --body \"$API_URL\""
if [[ "$WEB_HOSTING_MODE" == "staticwebapp" ]]; then
  echo "  gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body \"\$(az staticwebapp secrets list --resource-group \"$RESOURCE_GROUP\" --name \"$STATIC_WEB_APP_NAME\" --query properties.apiKey -o tsv)\""
else
  echo "  gh secret set AZURE_WEB_APP_NAME --body \"$WEB_APP_SERVICE_NAME\""
  echo "  az webapp deployment list-publishing-profiles --resource-group \"$RESOURCE_GROUP\" --name \"$WEB_APP_SERVICE_NAME\" --xml | gh secret set AZURE_WEB_PUBLISH_PROFILE"
fi
echo
echo "Then trigger:"
echo "  - .github/workflows/deploy-api-appservice.yml"
if [[ "$WEB_HOSTING_MODE" == "staticwebapp" ]]; then
  echo "  - .github/workflows/deploy-web-static.yml"
else
  echo "  - .github/workflows/deploy-web-appservice.yml"
fi
echo
