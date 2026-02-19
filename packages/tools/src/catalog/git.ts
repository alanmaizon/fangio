import { z } from 'zod';
import type { RiskLevel } from '@fangio/schema';
import { runCommand } from './command.js';

// Git tools
export const gitStatusArgsSchema = z.object({});
export const gitStatusTool = {
  name: 'git.status',
  description: 'Get the status of the Git repository',
  risk: 'low' as RiskLevel,
  argsSchema: gitStatusArgsSchema,
  execute: async (_args: z.infer<typeof gitStatusArgsSchema>) => {
    const result = await runCommand('git', ['status', '--porcelain']);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
