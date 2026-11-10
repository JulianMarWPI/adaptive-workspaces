// Minimal Ollama chat client. Temperature 0, JSON-schema-constrained output
// via Ollama's `format` parameter. The fetch function is injectable so unit
// tests can mock every failure mode without a network.

import { config } from './config.ts';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GenerateOptions {
  system: string;
  user: string;
  /** JSON schema passed as Ollama's `format` parameter. */
  schema: Record<string, unknown>;
  fetchFn?: FetchLike;
  model?: string;
  timeoutMs?: number;
}

export class OllamaError extends Error {}

/** Models where we must send think:false (Ollama rejects the flag on
 * models that do not support thinking, so it is gated by name). */
const THINKING_MODELS = /qwen3|deepseek-r1|gpt-oss|magistral/i;

/** One chat call; returns the raw response text (expected to be JSON). */
export async function ollamaGenerate(opts: GenerateOptions): Promise<string> {
  const fetchFn = opts.fetchFn ?? (fetch as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetchFn(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model ?? config.ollamaModel,
        stream: false,
        // Keep the model resident between calls so a mid-session proposal
        // never pays the cold-load cost (default Ollama unload is 5 min).
        keep_alive: '1h',
        format: opts.schema,
        // Reasoning models (qwen3 etc.) otherwise spend 10-30 s "thinking"
        // before the JSON; our outputs are small labeling tasks.
        ...(THINKING_MODELS.test(opts.model ?? config.ollamaModel) ? { think: false } : {}),
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
    });
    if (!res.ok) throw new OllamaError(`Ollama HTTP ${res.status}`);
    const body = (await res.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (typeof content !== 'string' || content.trim() === '')
      throw new OllamaError('Ollama returned no content');
    return content;
  } catch (err) {
    if (err instanceof OllamaError) throw err;
    throw new OllamaError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Load the model into memory (and compile the JSON-schema grammar) so the
 * first real proposal of a session is fast instead of a 6-30 s cold start.
 * Fire-and-forget on server boot; errors are swallowed (Ollama may be off). */
export async function warmOllama(fetchFn: FetchLike = fetch as FetchLike): Promise<boolean> {
  try {
    await ollamaGenerate({
      system: 'Respond with JSON only.',
      user: 'Warm up. Reply {"label":"ok"}.',
      schema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
      fetchFn,
      timeoutMs: 60_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Health check for the setup screen. */
export async function checkOllama(fetchFn: FetchLike = fetch as FetchLike): Promise<{
  reachable: boolean;
  modelAvailable: boolean;
  models: string[];
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetchFn(`${config.ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    } as RequestInit);
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, modelAvailable: false, models: [] };
    const body = (await res.json()) as { models?: { name: string }[] };
    const models = (body.models ?? []).map((m) => m.name);
    return {
      reachable: true,
      modelAvailable: models.some((m) => m === config.ollamaModel || m.startsWith(config.ollamaModel)),
      models,
    };
  } catch {
    return { reachable: false, modelAvailable: false, models: [] };
  }
}
