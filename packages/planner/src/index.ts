import { PlanSchema, type Plan } from '@fangio/schema';
import { createSystemPrompt } from './prompt.js';
import { getDemoPlan } from './demo.js';

export async function generatePlan(goal: string): Promise<Plan> {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';

  // If no API key, use demo mode
  if (!apiKey) {
    console.log('No LLM_API_KEY found, using demo mode');
    return getDemoPlan(goal);
  }

  // Try to call the LLM
  try {
    const systemPrompt = createSystemPrompt();

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: goal },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('LLM API error:', response.status, response.statusText);
      console.log('Falling back to demo mode');
      return getDemoPlan(goal);
    }

    const data = await response.json();
    const content = (data as any).choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in LLM response');
      console.log('Falling back to demo mode');
      return getDemoPlan(goal);
    }

    // Try to parse the JSON response
    let planData: any;
    try {
      // Remove markdown code blocks if present
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      planData = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', parseError);
      console.log('Falling back to demo mode');
      return getDemoPlan(goal);
    }

    // Validate with Zod schema
    try {
      const validatedPlan = PlanSchema.parse(planData);
      return validatedPlan;
    } catch (validationError) {
      console.error('LLM response failed schema validation:', validationError);
      console.log('Falling back to demo mode');
      return getDemoPlan(goal);
    }
  } catch (error) {
    console.error('Error calling LLM:', error);
    console.log('Falling back to demo mode');
    return getDemoPlan(goal);
  }
}
