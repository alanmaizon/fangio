import type { RiskLevel } from '@fangio/schema';
import {
  dockerPsTool,
  dockerStatsTool,
  dockerLogsTool,
  dockerRestartTool,
} from './catalog/docker.js';
import { gitStatusTool } from './catalog/git.js';
import { filesystemSearchTool } from './catalog/filesystem.js';
import { httpProbeTool } from './catalog/http.js';

// Tool definition interface
export interface ToolDefinition {
  name: string;
  description: string;
  risk: RiskLevel;
  argsSchema: any;
  execute: (args: any) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

// Tool catalog
export const TOOL_CATALOG: Record<string, ToolDefinition> = {
  'docker.ps': dockerPsTool,
  'docker.stats': dockerStatsTool,
  'docker.logs': dockerLogsTool,
  'docker.restart': dockerRestartTool,
  'git.status': gitStatusTool,
  'filesystem.search': filesystemSearchTool,
  'http.probe': httpProbeTool,
};

// Execute a tool by name
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const tool = TOOL_CATALOG[name];
  if (!tool) {
    throw new Error(`Tool "${name}" not found in catalog`);
  }

  // Validate args with the tool's schema
  const validatedArgs = tool.argsSchema.parse(args);

  // Execute the tool
  try {
    return await tool.execute(validatedArgs);
  } catch (error: any) {
    // Handle execa errors
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.exitCode || 1,
    };
  }
}

// Get tool metadata for LLM prompt
export function getToolMeta(): Array<{
  name: string;
  description: string;
  risk: RiskLevel;
  args: Record<string, string>;
}> {
  return Object.values(TOOL_CATALOG).map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    args: getArgsDescription(tool.argsSchema),
  }));
}

// Helper to extract args description from Zod schema
function getArgsDescription(schema: any): Record<string, string> {
  if (!schema || !schema._def || !schema._def.shape) {
    return {};
  }

  const shape = schema._def.shape();
  const args: Record<string, string> = {};

  for (const [key, value] of Object.entries(shape)) {
    const fieldSchema = value as any;
    if (fieldSchema._def) {
      args[key] = fieldSchema._def.typeName || 'unknown';
    }
  }

  return args;
}
