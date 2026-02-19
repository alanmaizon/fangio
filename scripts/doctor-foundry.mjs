#!/usr/bin/env node

import { runFoundryDoctor, renderDoctorReport } from './doctor-foundry-lib.mjs';

function parseArgs(argv) {
  const args = { json: false, configPath: null, dataDir: null, strict: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--strict' || arg === '--fail-on-warn') {
      args.strict = true;
      continue;
    }
    if (arg === '--config' && argv[i + 1]) {
      args.configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--data-dir' && argv[i + 1]) {
      args.dataDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: pnpm doctor:foundry [--json] [--strict] [--config <path>] [--data-dir <path>]

Checks:
  - Foundry auth and model deployment config
  - Network mode expectations (public/private endpoint)
  - Region readiness against configured denylist
  - MCP schema drift and validity
  - Channel parity across configured channels
  - Trace correlation field completeness in run logs
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const result = await runFoundryDoctor({
  configPath: args.configPath || undefined,
  dataDir: args.dataDir || undefined,
});

const strictMode = args.strict || process.env.FANGIO_DOCTOR_STRICT === 'true';
if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(renderDoctorReport(result));
  if (strictMode) {
    console.log('\nStrict mode: enabled');
  }
}

const failInStrictMode = strictMode && result.summary.warn > 0;
process.exit(result.status === 'fail' || failInStrictMode ? 1 : 0);
