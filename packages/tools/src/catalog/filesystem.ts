import { z } from 'zod';
import type { RiskLevel } from '@fangio/schema';
import { promises as fs } from 'fs';
import { resolve, sep } from 'path';
import { runCommand } from './command.js';

// Filesystem tools
export const filesystemSearchArgsSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(512)
    .refine((value) => !value.includes('\0'), { message: 'Path contains invalid null byte' })
    .refine((value) => !value.trim().startsWith('-'), {
      message: 'Path cannot start with a dash',
    }),
  pattern: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9*._?-]+$/, {
      message: 'Pattern must be a simple glob without path separators',
    }),
});

function getAllowedRoots(): string[] {
  const configured = process.env.FANGIO_ALLOWED_PATHS?.split(',')
    .map((path) => path.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured.map((path) => resolve(path));
  }

  return [process.cwd()];
}

function isPathWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function resolveAndValidateSearchPath(inputPath: string): Promise<string> {
  const resolvedPath = resolve(process.cwd(), inputPath);

  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new Error(`Search path "${inputPath}" does not exist`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`Search path "${inputPath}" must be a directory`);
  }

  const allowedRoots = getAllowedRoots();
  if (!allowedRoots.some((root) => isPathWithinRoot(resolvedPath, root))) {
    throw new Error(`Search path "${inputPath}" is outside allowed roots`);
  }

  return resolvedPath;
}

export const filesystemSearchTool = {
  name: 'filesystem.search',
  description: 'Search for files matching a pattern in a directory',
  risk: 'low' as RiskLevel,
  argsSchema: filesystemSearchArgsSchema,
  execute: async (args: z.infer<typeof filesystemSearchArgsSchema>) => {
    // Validate args
    const validated = filesystemSearchArgsSchema.parse(args);
    const searchPath = await resolveAndValidateSearchPath(validated.path);
    const result = await runCommand('find', [
      searchPath,
      '-maxdepth',
      '3',
      '-name',
      validated.pattern,
    ]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
