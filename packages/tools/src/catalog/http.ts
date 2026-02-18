import { z } from 'zod';
import { execa } from 'execa';
import type { RiskLevel } from '@fangio/schema';

// HTTP tools
export const httpProbeArgsSchema = z.object({
  url: z.string().url(),
});
export const httpProbeTool = {
  name: 'http.probe',
  description: 'Probe an HTTP endpoint and return status code and response time',
  risk: 'low' as RiskLevel,
  argsSchema: httpProbeArgsSchema,
  execute: async (args: z.infer<typeof httpProbeArgsSchema>) => {
    // Validate args
    const validated = httpProbeArgsSchema.parse(args);
    const result = await execa('curl', [
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code} %{time_total}',
      validated.url,
    ]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
