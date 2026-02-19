import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

function createCheck({ id, title, status, severity, message, details, suggestion }) {
  return {
    id,
    title,
    status,
    severity,
    message,
    details: details || {},
    suggestion: suggestion || '',
  };
}

function summarize(checks) {
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) {
    summary[check.status] += 1;
  }

  let status = 'pass';
  if (summary.fail > 0) {
    status = 'fail';
  } else if (summary.warn > 0) {
    status = 'warn';
  }

  return { status, summary };
}

function parseBoolean(value) {
  return value === 'true' || value === '1';
}

function parseConnectionStringEndpoint(connectionString) {
  if (!connectionString) {
    return null;
  }

  const segments = connectionString.split(';').map((segment) => segment.trim());
  for (const segment of segments) {
    if (segment.toLowerCase().startsWith('endpoint=')) {
      return segment.slice('endpoint='.length).trim();
    }
  }

  return null;
}

function inferRegionFromEndpoint(endpoint) {
  if (!endpoint) {
    return null;
  }

  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    const parts = hostname.split('.');

    // Example: <resource>.<region>.models.ai.azure.com
    if (parts.length >= 3 && parts[2] === 'models') {
      return parts[1];
    }

    // Example: <region>.api.cognitive.microsoft.com
    if (parts.length >= 4 && parts[1] === 'api' && parts[2] === 'cognitive') {
      return parts[0];
    }
  } catch {
    return null;
  }

  return null;
}

function checkFoundryAuth(env) {
  const hasConnectionString = Boolean(env.AZURE_AI_PROJECT_CONNECTION_STRING);
  const hasLegacyTriplet =
    Boolean(env.AZURE_SUBSCRIPTION_ID) &&
    Boolean(env.AZURE_RESOURCE_GROUP) &&
    Boolean(env.AZURE_AI_PROJECT_NAME);

  if (!hasConnectionString && !hasLegacyTriplet) {
    return createCheck({
      id: 'foundry-auth',
      title: 'Foundry credentials',
      status: 'fail',
      severity: 'high',
      message: 'Missing Azure AI Foundry credentials.',
      suggestion:
        'Set AZURE_AI_PROJECT_CONNECTION_STRING, or set AZURE_SUBSCRIPTION_ID + AZURE_RESOURCE_GROUP + AZURE_AI_PROJECT_NAME.',
    });
  }

  if (!env.AZURE_AI_MODEL_DEPLOYMENT) {
    return createCheck({
      id: 'foundry-auth',
      title: 'Foundry credentials',
      status: 'warn',
      severity: 'medium',
      message: 'Missing AZURE_AI_MODEL_DEPLOYMENT.',
      suggestion: 'Set AZURE_AI_MODEL_DEPLOYMENT to the deployment name used by your agent.',
    });
  }

  return createCheck({
    id: 'foundry-auth',
    title: 'Foundry credentials',
    status: 'pass',
    severity: 'low',
    message: 'Foundry credentials and model deployment are configured.',
  });
}

function checkNetworkReadiness(env, endpoint) {
  const requirePrivateNetwork = parseBoolean(env.FANGIO_REQUIRE_PRIVATE_NETWORK || 'false');

  if (!endpoint) {
    return createCheck({
      id: 'network-mode',
      title: 'Network mode',
      status: 'warn',
      severity: 'medium',
      message: 'Could not determine Foundry endpoint from environment.',
      suggestion:
        'Set AZURE_AI_PROJECT_CONNECTION_STRING with Endpoint=... or AZURE_AI_PROJECT_ENDPOINT.',
    });
  }

  let isPrivateLink = false;
  try {
    isPrivateLink = new URL(endpoint).hostname.toLowerCase().includes('privatelink');
  } catch {
    return createCheck({
      id: 'network-mode',
      title: 'Network mode',
      status: 'warn',
      severity: 'medium',
      message: `Endpoint "${endpoint}" is not a valid URL.`,
      suggestion: 'Use a valid https endpoint in your Foundry connection settings.',
    });
  }

  if (requirePrivateNetwork && !isPrivateLink) {
    return createCheck({
      id: 'network-mode',
      title: 'Network mode',
      status: 'fail',
      severity: 'high',
      message: 'Private networking is required, but endpoint is public.',
      details: { endpoint },
      suggestion:
        'Use a private endpoint / privatelink DNS and set FANGIO_REQUIRE_PRIVATE_NETWORK=true in protected environments.',
    });
  }

  if (!requirePrivateNetwork && !isPrivateLink) {
    return createCheck({
      id: 'network-mode',
      title: 'Network mode',
      status: 'warn',
      severity: 'low',
      message: 'Endpoint appears public; private networking is not enforced.',
      details: { endpoint },
      suggestion: 'Consider enabling private networking for enterprise deployments.',
    });
  }

  return createCheck({
    id: 'network-mode',
    title: 'Network mode',
    status: 'pass',
    severity: 'low',
    message: 'Endpoint matches private networking expectations.',
    details: { endpoint },
  });
}

function checkRegionReadiness(env, endpoint, config) {
  const region = inferRegionFromEndpoint(endpoint);
  const riskyRegions =
    config?.regionRiskDenylist ||
    env.FANGIO_FOUNDRY_REGION_RISK_DENYLIST?.split(',').map((v) => v.trim().toLowerCase()) ||
    [];

  if (!region) {
    return createCheck({
      id: 'region-readiness',
      title: 'Region readiness',
      status: 'warn',
      severity: 'low',
      message: 'Could not infer Azure region from endpoint.',
      suggestion: 'Add regionRiskDenylist in config to enforce region policy checks.',
    });
  }

  if (riskyRegions.includes(region.toLowerCase())) {
    return createCheck({
      id: 'region-readiness',
      title: 'Region readiness',
      status: 'warn',
      severity: 'medium',
      message: `Region "${region}" is in the configured risk denylist.`,
      details: { region, riskyRegions },
      suggestion: 'Use a different region or document a mitigation for this known regional risk.',
    });
  }

  return createCheck({
    id: 'region-readiness',
    title: 'Region readiness',
    status: 'pass',
    severity: 'low',
    message: `Region "${region}" is not flagged.`,
    details: { region },
  });
}

function normalizeMcpServers(config) {
  if (!config) {
    return [];
  }

  if (Array.isArray(config.mcp)) {
    return config.mcp;
  }

  if (config.mcp && typeof config.mcp === 'object') {
    return Object.entries(config.mcp).map(([name, value]) => ({ name, ...(value || {}) }));
  }

  return [];
}

function checkMcpSchema(config) {
  if (!config) {
    return createCheck({
      id: 'mcp-schema',
      title: 'MCP schema stability',
      status: 'warn',
      severity: 'medium',
      message: 'No Foundry doctor config found; MCP checks are limited.',
      suggestion: 'Create foundry.doctor.json with an mcp section.',
    });
  }

  if (Object.prototype.hasOwnProperty.call(config, 'custom_MCP')) {
    return createCheck({
      id: 'mcp-schema',
      title: 'MCP schema stability',
      status: 'fail',
      severity: 'high',
      message: 'Found legacy "custom_MCP" key; schema drift risk detected.',
      suggestion: 'Rename custom_MCP to mcp and validate each server config.',
    });
  }

  const servers = normalizeMcpServers(config);
  if (servers.length === 0) {
    return createCheck({
      id: 'mcp-schema',
      title: 'MCP schema stability',
      status: 'warn',
      severity: 'medium',
      message: 'No MCP servers configured in doctor config.',
      suggestion: 'Define mcp servers to validate schema and transport expectations.',
    });
  }

  const invalid = servers.filter(
    (server) =>
      !server ||
      typeof server !== 'object' ||
      !server.name ||
      (!server.url && !server.command)
  );

  if (invalid.length > 0) {
    return createCheck({
      id: 'mcp-schema',
      title: 'MCP schema stability',
      status: 'fail',
      severity: 'medium',
      message: 'One or more MCP server entries are invalid.',
      details: { invalidCount: invalid.length },
      suggestion: 'Each MCP server must include name and either url or command.',
    });
  }

  return createCheck({
    id: 'mcp-schema',
    title: 'MCP schema stability',
    status: 'pass',
    severity: 'low',
    message: 'MCP schema looks consistent.',
    details: { serverCount: servers.length },
  });
}

function normalizeTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }
  return [...new Set(tools.filter((tool) => typeof tool === 'string'))].sort();
}

function checkChannelParity(config) {
  if (!config || !config.channels || typeof config.channels !== 'object') {
    return createCheck({
      id: 'channel-parity',
      title: 'Channel parity',
      status: 'warn',
      severity: 'medium',
      message: 'No channel matrix found; cannot verify cross-channel parity.',
      suggestion:
        'Add channels in foundry.doctor.json (for example: playground, activity_protocol, copilot_studio) with tool lists.',
    });
  }

  const enabledChannels = Object.entries(config.channels)
    .filter(([, value]) => value && value.enabled !== false)
    .map(([name, value]) => ({ name, tools: normalizeTools(value.tools) }));

  if (enabledChannels.length < 2) {
    return createCheck({
      id: 'channel-parity',
      title: 'Channel parity',
      status: 'warn',
      severity: 'low',
      message: 'Need at least two enabled channels to run parity checks.',
      suggestion: 'Enable at least two channels to detect adoption gaps across surfaces.',
    });
  }

  const baselineName = config.channelBaseline || 'playground';
  const baseline =
    enabledChannels.find((channel) => channel.name === baselineName) || enabledChannels[0];

  const mismatches = [];
  for (const channel of enabledChannels) {
    if (channel.name === baseline.name) {
      continue;
    }
    if (JSON.stringify(channel.tools) !== JSON.stringify(baseline.tools)) {
      mismatches.push({
        channel: channel.name,
        baseline: baseline.name,
        baselineTools: baseline.tools,
        channelTools: channel.tools,
      });
    }
  }

  if (mismatches.length > 0) {
    return createCheck({
      id: 'channel-parity',
      title: 'Channel parity',
      status: 'fail',
      severity: 'high',
      message: 'Tooling differs across channels; adoption vulnerability likely.',
      details: { mismatches },
      suggestion:
        'Align tool catalogs across channels or explicitly document channel-specific behavior and tests.',
    });
  }

  return createCheck({
    id: 'channel-parity',
    title: 'Channel parity',
    status: 'pass',
    severity: 'low',
    message: `Tool parity is consistent across ${enabledChannels.length} channels.`,
  });
}

async function checkTraceCompleteness(dataDir, config) {
  const requiredFields = Array.isArray(config?.expectedTraceFields)
    ? config.expectedTraceFields
    : ['traceId', 'channel', 'responseId'];

  const runsDir = join(dataDir, 'runs');
  let files = [];
  try {
    files = (await fs.readdir(runsDir)).filter((file) => file.endsWith('.json'));
  } catch {
    return createCheck({
      id: 'trace-completeness',
      title: 'Trace completeness',
      status: 'warn',
      severity: 'low',
      message: `No run files found at ${runsDir}; skipping trace completeness checks.`,
      suggestion: 'Execute at least one run, then re-run doctor to validate trace fields.',
    });
  }

  if (files.length === 0) {
    return createCheck({
      id: 'trace-completeness',
      title: 'Trace completeness',
      status: 'warn',
      severity: 'low',
      message: 'Run directory is empty; skipping trace completeness checks.',
      suggestion: 'Generate a run and audit whether trace fields are emitted consistently.',
    });
  }

  const maxFiles = Number.parseInt(process.env.FANGIO_DOCTOR_MAX_RUN_FILES || '20', 10);
  const selectedFiles = files.slice(0, Number.isFinite(maxFiles) ? maxFiles : 20);

  let totalEvents = 0;
  const missingByField = Object.fromEntries(requiredFields.map((field) => [field, 0]));

  for (const file of selectedFiles) {
    let runEvents = [];
    try {
      runEvents = JSON.parse(await fs.readFile(join(runsDir, file), 'utf-8'));
      if (!Array.isArray(runEvents)) {
        continue;
      }
    } catch {
      continue;
    }

    for (const event of runEvents) {
      totalEvents += 1;
      const data = event?.data || {};
      for (const field of requiredFields) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) {
          missingByField[field] += 1;
        }
      }
    }
  }

  const missingFields = Object.entries(missingByField).filter(([, missing]) => missing > 0);
  if (missingFields.length > 0) {
    return createCheck({
      id: 'trace-completeness',
      title: 'Trace completeness',
      status: 'fail',
      severity: 'medium',
      message: 'Run events are missing one or more correlation fields.',
      details: { requiredFields, missingByField, inspectedEvents: totalEvents },
      suggestion: 'Emit trace fields on every event to support cross-channel replay/debugging.',
    });
  }

  return createCheck({
    id: 'trace-completeness',
    title: 'Trace completeness',
    status: 'pass',
    severity: 'low',
    message: 'All required trace fields are present in inspected events.',
    details: { requiredFields, inspectedEvents: totalEvents },
  });
}

async function loadConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return { config: JSON.parse(raw), error: null };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { config: null, error: null };
    }
    return { config: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runFoundryDoctor(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const configPath = resolve(cwd, options.configPath || 'foundry.doctor.json');
  const dataDir = resolve(cwd, options.dataDir || env.FANGIO_DATA_DIR || '.fangio');

  const { config, error: configError } = await loadConfig(configPath);

  const checks = [];
  checks.push(checkFoundryAuth(env));

  const endpoint =
    env.AZURE_AI_PROJECT_ENDPOINT ||
    parseConnectionStringEndpoint(env.AZURE_AI_PROJECT_CONNECTION_STRING || '');
  checks.push(checkNetworkReadiness(env, endpoint));
  checks.push(checkRegionReadiness(env, endpoint, config));
  checks.push(checkMcpSchema(config));
  checks.push(checkChannelParity(config));
  checks.push(await checkTraceCompleteness(dataDir, config));

  if (configError) {
    checks.push(
      createCheck({
        id: 'config-load',
        title: 'Doctor config parsing',
        status: 'fail',
        severity: 'medium',
        message: `Failed to parse config at ${configPath}.`,
        details: { error: configError },
        suggestion: 'Fix JSON syntax in foundry.doctor.json.',
      })
    );
  }

  const { status, summary } = summarize(checks);

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary,
    metadata: {
      configPath,
      dataDir,
      hasConfig: Boolean(config),
    },
    checks,
  };
}

export function renderDoctorReport(result) {
  const lines = [];
  lines.push('Fangio Foundry Doctor');
  lines.push(`Status: ${result.status.toUpperCase()}`);
  lines.push('');

  for (const check of result.checks) {
    lines.push(
      `[${check.status.toUpperCase()}][${check.severity}] ${check.id}: ${check.message}`
    );
    if (check.suggestion) {
      lines.push(`  Suggestion: ${check.suggestion}`);
    }
  }

  lines.push('');
  lines.push(
    `Summary: pass=${result.summary.pass} warn=${result.summary.warn} fail=${result.summary.fail}`
  );

  return lines.join('\n');
}
