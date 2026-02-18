import { FastifyInstance } from 'fastify';

export async function statusRoute(fastify: FastifyInstance) {
  fastify.get('/api/status', async () => {
    const hasApiKey = !!(process.env.LLM_API_KEY || process.env.GITHUB_TOKEN);
    const provider = process.env.LLM_BASE_URL || 'https://models.github.ai/inference';
    const model = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
    const isGitHubModels = provider.includes('models.github.ai');

    return {
      mode: hasApiKey ? 'live' : 'demo',
      provider: hasApiKey
        ? isGitHubModels
          ? 'GitHub Models'
          : 'Custom OpenAI-compatible'
        : 'Demo Mode (no API key)',
      model: hasApiKey ? model : 'N/A (canned plans)',
    };
  });
}
