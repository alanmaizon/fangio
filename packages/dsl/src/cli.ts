#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { compileFangioScript } from './index.js';

function usage() {
  console.log('Usage: fangio-dsl compile <input> --out <output>');
}

function parseArgs(argv: string[]) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return { help: true as const };
  }
  if (argv[0] !== 'compile') {
    throw new Error(`Unknown command "${argv[0]}"`);
  }
  const input = argv[1];
  if (!input) {
    throw new Error('Missing input file path');
  }
  const outIndex = argv.indexOf('--out');
  if (outIndex === -1 || !argv[outIndex + 1]) {
    throw new Error('Missing required --out <output>');
  }
  return {
    help: false as const,
    command: 'compile' as const,
    input,
    output: argv[outIndex + 1],
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      usage();
      return;
    }

    const source = await readFile(args.input, 'utf8');
    const compiled = compileFangioScript(source);
    await writeFile(args.output, `${JSON.stringify(compiled, null, 2)}\n`, 'utf8');
  } catch (error) {
    usage();
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

await main();
