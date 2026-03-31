import {
  buildDungeonPrompt, buildModulePrompt, buildAssistantPrompt,
  type LLMDungeonResponse, type LLMModuleResponse, type LLMActionResponse,
} from './levelPrompt';
import { buildLevelContext } from './levelContext';
import { parseActionResponse } from './actionExecutor';

const API_PATH = '/api/anthropic/v1/messages';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callLLM(apiKey: string, system: string, userMessage: string, maxTokens = 1024): Promise<string> {
  const resp = await fetch(API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json = await resp.json();
  return json.content?.[0]?.text ?? '';
}

async function callLLMWithHistory(
  apiKey: string,
  system: string,
  messages: ChatMessage[],
  maxTokens = 4096,
): Promise<string> {
  const resp = await fetch(API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json = await resp.json();
  return json.content?.[0]?.text ?? '';
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in AI response');
  return JSON.parse(match[0]) as T;
}

export async function requestLevelAction(
  apiKey: string,
  chatHistory: ChatMessage[],
): Promise<LLMActionResponse> {
  const context = buildLevelContext();
  const system = buildAssistantPrompt(context);
  const rawText = await callLLMWithHistory(apiKey, system, chatHistory);
  return parseActionResponse(rawText);
}

export async function requestDungeonDesign(
  apiKey: string,
  userMessage: string,
): Promise<LLMDungeonResponse> {
  const text = await callLLM(apiKey, buildDungeonPrompt(), userMessage);
  const parsed = extractJson<LLMDungeonResponse>(text);
  if (!parsed.config || !Array.isArray(parsed.rooms)) {
    throw new Error('Invalid dungeon response format');
  }
  return parsed;
}

export async function requestModuleDesign(
  apiKey: string,
  userMessage: string,
): Promise<LLMModuleResponse> {
  const text = await callLLM(apiKey, buildModulePrompt(), userMessage);
  const parsed = extractJson<LLMModuleResponse>(text);
  if (!parsed.module) {
    throw new Error('Invalid module response format');
  }
  return parsed;
}
