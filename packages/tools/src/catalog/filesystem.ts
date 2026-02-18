import { z } from 'zod';
import { execa } from 'execa';
import type { RiskLevel } from '@fangio/schema';

// Filesystem tools
export const filesystemSearchArgsSchema = z.object({
  path: z.string().min(1),
  pattern: z.string().min(1),
});
export const filesystemSearchTool = {
  name: 'filesystem.search',
  description: 'Search for files matching a pattern in a directory',
  risk: 'low' as RiskLevel,
  argsSchema: filesystemSearchArgsSchema,
  execute: async (args: z.infer<typeof filesystemSearchArgsSchema>) => {
    // Validate args
    const validated = filesystemSearchArgsSchema.parse(args);
    const result = await execa('find', [
      validated.path,
      '-name',
      validated.pattern,
      '-maxdepth',
      '3',
    ]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
