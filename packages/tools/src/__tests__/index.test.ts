import { describe, it, expect } from 'vitest';
import { TOOL_CATALOG, getToolMeta, executeTool } from '../index.js';

describe('TOOL_CATALOG', () => {
  it('contains all expected tools', () => {
    const expectedTools = [
      'docker.ps',
      'docker.stats',
      'docker.logs',
      'docker.restart',
      'git.status',
      'filesystem.search',
      'http.probe',
    ];
    for (const tool of expectedTools) {
      expect(TOOL_CATALOG[tool]).toBeDefined();
    }
  });

  it('each tool has required properties', () => {
    for (const [name, tool] of Object.entries(TOOL_CATALOG)) {
      expect(tool.name).toBe(name);
      expect(tool.description).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(tool.risk);
      expect(tool.argsSchema).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('classifies docker.restart as medium risk', () => {
    expect(TOOL_CATALOG['docker.restart'].risk).toBe('medium');
  });

  it('classifies docker.ps as low risk', () => {
    expect(TOOL_CATALOG['docker.ps'].risk).toBe('low');
  });
});

describe('getToolMeta', () => {
  it('returns metadata for all tools', () => {
    const meta = getToolMeta();
    expect(meta.length).toBe(Object.keys(TOOL_CATALOG).length);
    for (const tool of meta) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(tool.risk);
    }
  });
});

describe('executeTool', () => {
  it('throws for unknown tool', async () => {
    await expect(executeTool('unknown.tool', {})).rejects.toThrow(
      'Tool "unknown.tool" not found in catalog'
    );
  });
});
