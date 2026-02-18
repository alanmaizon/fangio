import { z } from 'zod';
import { execa } from 'execa';
import type { RiskLevel } from '@fangio/schema';

// Git tools
export const gitStatusArgsSchema = z.object({});
export const gitStatusTool = {
  name: 'git.status',
  description: 'Get the status of the Git repository',
  risk: 'low' as RiskLevel,
  argsSchema: gitStatusArgsSchema,
  execute: async (args: z.infer<typeof gitStatusArgsSchema>) => {
    const result = await execa('git', ['status', '--porcelain']);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
