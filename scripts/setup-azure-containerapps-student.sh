#!/usr/bin/env bash

set -euo pipefail

RESOURCE_GROUP="fangio-rg"
LOCATION="eastus"
CONTAINER_APP_NAME="fangio-api-$(date +%s)"
CONTAINER_ENV_NAME="fangio-ca-env"
ACR_NAME="fangioacr$(date +%s)"
CORS_ORIGIN=""
SUBSCRIPTION=""
SET_GITHUB_SECRETS="false"
CREATE_GITHUB_CREDENTIALS="false"

usage() {
  cat <<'USAGE'
Usage: scripts/setup-azure-containerapps-student.sh [options]

Options:
  --resource-group <name>          Azure resource group (default: fangio-rg)
  --location <region>              Azure region (default: eastus)
  --api-app-name <name>            Container App name (global unique within env)
  --container-env-name <name>      Container Apps environment name (default: fangio-ca-env)
  --acr-name <name>                Azure Container Registry name (global unique, lowercase)
  --cors-origin <url>              Allowed web origin for CORS (required)
  --subscription <id-or-name>      Azure subscription id or name
  --set-github-secrets             Push required GitHub Actions secrets via gh CLI
  --create-github-credentials      Create service principal JSON and set AZURE_CREDENTIALS
  --help                           Show this help

Examples:
  scripts/setup-azure-containerapps-student.sh --cors-origin https://fangio-web-demo.azurewebsites.net
  scripts/setup-azure-containerapps-student.sh --api-app-name fangio-api-demo --acr-name fangioacrdemo --cors-origin https://fangio-web-demo.azurewebsites.net --set-github-secrets
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
    --api-app-name)
      CONTAINER_APP_NAME="$2"
      shift 2
      ;;
    --container-env-name)
      CONTAINER_ENV_NAME="$2"
      shift 2
      ;;
    --acr-name)
      ACR_NAME="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
      shift 2
      ;;
    --cors-origin)
      CORS_ORIGIN="$2"
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
    --create-github-credentials)
      CREATE_GITHUB_CREDENTIALS="true"
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

if [[ -z "$CORS_ORIGIN" ]]; then
  echo "Missing required option: --cors-origin <url>" >&2
  exit 1
fi

if [[ ! "$ACR_NAME" =~ ^[a-z0-9]{5,50}$ ]]; then
  echo "Invalid --acr-name: must be 5-50 chars, lowercase letters and digits only" >&2
  exit 1
fi

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

require_cmd az

if ! run_az account show >/dev/null 2>&1; then
  echo "Azure CLI is not authenticated. Run: az login" >&2
  exit 1
fi

if [[ "$SET_GITHUB_SECRETS" == "true" || "$CREATE_GITHUB_CREDENTIALS" == "true" ]]; then
  require_cmd gh
  if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
    exit 1
  fi
fi

echo "Creating resource group: ${RESOURCE_GROUP}"
run_az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "Ensuring Azure CLI can auto-install required extensions"
run_az config set extension.use_dynamic_install=yes_without_prompt >/dev/null

if run_az acr show --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" >/dev/null 2>&1; then
  echo "Using existing ACR: ${ACR_NAME}"
else
  echo "Creating ACR: ${ACR_NAME}"
  run_az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --location "$LOCATION" \
    --admin-enabled false \
    --output none
fi

ACR_LOGIN_SERVER="$(run_az acr show --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --query loginServer -o tsv)"
ACR_ID="$(run_az acr show --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --query id -o tsv)"

if run_az containerapp env show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_ENV_NAME" >/dev/null 2>&1; then
  echo "Using existing Container Apps environment: ${CONTAINER_ENV_NAME}"
else
  echo "Creating Container Apps environment: ${CONTAINER_ENV_NAME}"
  run_az containerapp env create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_ENV_NAME" \
    --location "$LOCATION" \
    --output none
fi

if run_az containerapp show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_APP_NAME" >/dev/null 2>&1; then
  echo "Using existing Container App: ${CONTAINER_APP_NAME}"
  run_az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_APP_NAME" \
    --set-env-vars \
      NODE_ENV=production \
      FANGIO_DATA_DIR=/tmp/fangio \
      CORS_ORIGINS="$CORS_ORIGIN" \
    --output none
else
  echo "Creating Container App: ${CONTAINER_APP_NAME}"
  run_az containerapp create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_APP_NAME" \
    --environment "$CONTAINER_ENV_NAME" \
    --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
    --target-port 3001 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 1 \
    --env-vars \
      NODE_ENV=production \
      FANGIO_DATA_DIR=/tmp/fangio \
      CORS_ORIGINS="$CORS_ORIGIN" \
    --output none
fi

echo "Assigning system identity to Container App"
run_az containerapp identity assign \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_APP_NAME" \
  --system-assigned \
  --output none

PRINCIPAL_ID="$(run_az containerapp show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_APP_NAME" --query identity.principalId -o tsv)"
if [[ -z "$PRINCIPAL_ID" ]]; then
  echo "Failed to resolve container app principal id" >&2
  exit 1
fi

EXISTING_ACR_PULL="$(run_az role assignment list --assignee "$PRINCIPAL_ID" --scope "$ACR_ID" --query "[?roleDefinitionName=='AcrPull'] | length(@)" -o tsv)"
if [[ "$EXISTING_ACR_PULL" == "0" ]]; then
  echo "Granting AcrPull role to Container App identity"
  run_az role assignment create \
    --assignee-object-id "$PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role AcrPull \
    --scope "$ACR_ID" \
    --output none
else
  echo "AcrPull role already assigned"
fi

echo "Configuring Container App registry access"
run_az containerapp registry set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_APP_NAME" \
  --server "$ACR_LOGIN_SERVER" \
  --identity system \
  --output none

FQDN="$(run_az containerapp show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)"
API_URL="https://${FQDN}"

if [[ "$SET_GITHUB_SECRETS" == "true" ]]; then
  echo "Setting GitHub Actions secrets in current repository"
  gh secret set AZURE_RESOURCE_GROUP --body "$RESOURCE_GROUP"
  gh secret set AZURE_CONTAINER_REGISTRY_NAME --body "$ACR_NAME"
  gh secret set AZURE_CONTAINER_REGISTRY_LOGIN_SERVER --body "$ACR_LOGIN_SERVER"
  gh secret set AZURE_API_CONTAINER_APP_NAME --body "$CONTAINER_APP_NAME"
  gh secret set VITE_API_URL --body "$API_URL"

  if [[ "$CREATE_GITHUB_CREDENTIALS" == "true" ]]; then
    SCOPE="$(run_az group show --name "$RESOURCE_GROUP" --query id -o tsv)"
    SP_NAME="fangio-gh-${RESOURCE_GROUP}-$(date +%s)"
    echo "Creating service principal for GitHub Actions: ${SP_NAME}"
    AZURE_CREDENTIALS_JSON="$(run_az ad sp create-for-rbac \
      --name "$SP_NAME" \
      --role Contributor \
      --scopes "$SCOPE" \
      --sdk-auth)"
    gh secret set AZURE_CREDENTIALS --body "$AZURE_CREDENTIALS_JSON"
  fi
fi

echo
echo "Azure Container Apps setup complete."
echo
echo "API URL:"
echo "  ${API_URL}"
echo
echo "Container App:"
echo "  ${CONTAINER_APP_NAME}"
echo
echo "Container Apps Environment:"
echo "  ${CONTAINER_ENV_NAME}"
echo
echo "Container Registry:"
echo "  ${ACR_NAME} (${ACR_LOGIN_SERVER})"
echo
echo "CORS_ORIGINS:"
echo "  ${CORS_ORIGIN}"
echo
echo "GitHub workflow secrets needed:"
echo "  AZURE_CREDENTIALS=<service principal json>"
echo "  AZURE_RESOURCE_GROUP=${RESOURCE_GROUP}"
echo "  AZURE_CONTAINER_REGISTRY_NAME=${ACR_NAME}"
echo "  AZURE_CONTAINER_REGISTRY_LOGIN_SERVER=${ACR_LOGIN_SERVER}"
echo "  AZURE_API_CONTAINER_APP_NAME=${CONTAINER_APP_NAME}"
echo "  VITE_API_URL=${API_URL}"
echo
if [[ "$SET_GITHUB_SECRETS" != "true" ]]; then
  echo "To set secrets automatically:"
  echo "  pnpm azure:setup:ca -- --resource-group \"$RESOURCE_GROUP\" --location \"$LOCATION\" --api-app-name \"$CONTAINER_APP_NAME\" --container-env-name \"$CONTAINER_ENV_NAME\" --acr-name \"$ACR_NAME\" --cors-origin \"$CORS_ORIGIN\" --set-github-secrets --create-github-credentials"
  echo
fi
echo "Then trigger:"
echo "  - .github/workflows/deploy-api-containerapps.yml"
