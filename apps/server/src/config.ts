// Config from .env at the repo root (hand-rolled parser; no extra dep).
// Everything is local-only: the server binds 127.0.0.1 and only ever talks
// to Ollama on localhost.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../../..');

function loadDotEnv(): Record<string, string> {
  const file = path.join(REPO_ROOT, '.env');
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };

export const config = {
  port: Number(env.PORT ?? 8787),
  ollamaUrl: env.OLLAMA_URL ?? 'http://localhost:11434',
  ollamaModel: env.OLLAMA_MODEL ?? 'qwen3:8b',
  /** Miner support threshold K (research variable; the setup screen can
   * override it per session). */
  minerK: Number(env.MINER_K ?? 3),
  dataDir: path.join(REPO_ROOT, 'data', 'sessions'),
};

if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(config.ollamaUrl + '/')) {
  throw new Error(`OLLAMA_URL must be localhost, got ${config.ollamaUrl}`);
}
