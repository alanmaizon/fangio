import { z } from 'zod';
import { execa } from 'execa';
import type { RiskLevel } from '@fangio/schema';

// Docker tools
export const dockerPsArgsSchema = z.object({});
export const dockerPsTool = {
  name: 'docker.ps',
  description: 'List all running Docker containers',
  risk: 'low' as RiskLevel,
  argsSchema: dockerPsArgsSchema,
  execute: async (args: z.infer<typeof dockerPsArgsSchema>) => {
    const result = await execa('docker', ['ps', '--format', 'json']);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};

export const dockerStatsArgsSchema = z.object({});
export const dockerStatsTool = {
  name: 'docker.stats',
  description: 'Get resource usage statistics for all running containers',
  risk: 'low' as RiskLevel,
  argsSchema: dockerStatsArgsSchema,
  execute: async (args: z.infer<typeof dockerStatsArgsSchema>) => {
    const result = await execa('docker', ['stats', '--no-stream', '--format', 'json']);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};

export const dockerLogsArgsSchema = z.object({
  container: z.string().min(1),
});
export const dockerLogsTool = {
  name: 'docker.logs',
  description: 'Get the last 100 lines of logs from a container',
  risk: 'low' as RiskLevel,
  argsSchema: dockerLogsArgsSchema,
  execute: async (args: z.infer<typeof dockerLogsArgsSchema>) => {
    // Validate args
    const validated = dockerLogsArgsSchema.parse(args);
    const result = await execa('docker', ['logs', '--tail', '100', validated.container]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};

export const dockerRestartArgsSchema = z.object({
  container: z.string().min(1),
});
export const dockerRestartTool = {
  name: 'docker.restart',
  description: 'Restart a Docker container',
  risk: 'medium' as RiskLevel,
  argsSchema: dockerRestartArgsSchema,
  execute: async (args: z.infer<typeof dockerRestartArgsSchema>) => {
    // Validate args
    const validated = dockerRestartArgsSchema.parse(args);
    const result = await execa('docker', ['restart', validated.container]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
