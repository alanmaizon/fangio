#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

function parseArgs(argv) {
  const args = {
    zipPath: '',
    profileEnv: 'PUBLISH_PROFILE_XML',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--zip' && argv[i + 1]) {
      args.zipPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--profile-env' && argv[i + 1]) {
      args.profileEnv = argv[i + 1];
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
  console.log(`Usage: node scripts/ci/kudu-zipdeploy.mjs --zip <path> [--profile-env PUBLISH_PROFILE_XML]

Environment:
  <profile-env> should contain Azure publish profile XML.
`);
}

function extractProfiles(xml) {
  return Array.from(
    xml.matchAll(/<publishProfile\b[\s\S]*?(?:\/>|<\/publishProfile>)/gi)
  ).map((m) => m[0]);
}

function parseAttributes(profileXml) {
  const attrs = Object.create(null);
  for (const m of profileXml.matchAll(/([A-Za-z0-9:_-]+)=("([^"]*)"|'([^']*)')/g)) {
    const rawValue = m[3] !== undefined ? m[3] : (m[4] || '');
    attrs[String(m[1]).toLowerCase()] = decodeXmlAttr(rawValue);
  }
  return attrs;
}

function decodeXmlAttr(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function chooseProfile(parsedProfiles) {
  const scored = parsedProfiles
    .map((attrs) => {
      const url = String(attrs.publishurl || '').toLowerCase();
      const method = String(attrs.publishmethod || '').toLowerCase();
      const hasCreds = Boolean(attrs.username && (attrs.userpwd || attrs.password));
      let score = 0;
      if (url.includes('scm')) score += 100;
      if (method === 'zipdeploy') score += 30;
      if (method === 'msdeploy') score += 20;
      if (hasCreds) score += 10;
      return { attrs, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.attrs || null;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.zipPath) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const profileXml = process.env[args.profileEnv] || '';
if (!profileXml.trim()) {
  throw new Error(`Missing publish profile XML in env var: ${args.profileEnv}`);
}

const profiles = extractProfiles(profileXml);
if (profiles.length === 0) {
  throw new Error('No <publishProfile> entries found in publish profile XML.');
}

const parsed = profiles.map(parseAttributes);
const picked = chooseProfile(parsed);
if (!picked) {
  throw new Error('Could not select a usable publish profile entry.');
}

const publishUrlRaw = String(picked.publishurl || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
const username = String(picked.username || '');
const password = String(picked.userpwd || picked.password || '');

if (!publishUrlRaw || !username || !password) {
  throw new Error('Publish profile entry is missing publishUrl, userName, or userPWD.');
}

const zipBuffer = await readFile(args.zipPath);
const endpoint = `https://${publishUrlRaw}/api/zipdeploy`;
const auth = Buffer.from(`${username}:${password}`).toString('base64');

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/zip',
  },
  body: zipBuffer,
});

if (!res.ok) {
  const body = await res.text();
  throw new Error(`ZipDeploy failed (${res.status}): ${body.slice(0, 500)}`);
}

console.log(`ZipDeploy succeeded: ${endpoint}`);
