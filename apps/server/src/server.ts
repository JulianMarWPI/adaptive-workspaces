// Local-only Fastify server: session log sink, LLM proposer, prompted path.

import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { GeneralizedPattern, LogEvent } from '@aw/core';
import { config } from './config.ts';
import { checkOllama } from './ollama.ts';
import { propose } from './propose.ts';
import { promptToTool } from './promptTool.ts';

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function buildServer() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ });

  app.get('/health', async () => {
    const ollama = await checkOllama();
    return { ok: true, ollama, model: config.ollamaModel, minerK: config.minerK };
  });

  /** Append a batch of log events to data/sessions/<pid>/<session>.jsonl. */
  app.post('/log', async (req, reply) => {
    const body = req.body as { pid?: string; session?: string; events?: LogEvent[] };
    if (!body?.pid || !body?.session || !Array.isArray(body.events)) {
      return reply.code(400).send({ error: 'expected { pid, session, events[] }' });
    }
    if (!SAFE_ID.test(body.pid) || !SAFE_ID.test(body.session)) {
      return reply.code(400).send({ error: 'pid/session must be alphanumeric' });
    }
    const dir = path.join(config.dataDir, body.pid);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${body.session}.jsonl`);
    const lines = body.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(file, lines, 'utf8');
    return { ok: true, written: body.events.length };
  });

  /** Export: return the stored JSONL for a session (setup screen button). */
  app.get('/export/:pid/:session', async (req, reply) => {
    const { pid, session } = req.params as { pid: string; session: string };
    if (!SAFE_ID.test(pid) || !SAFE_ID.test(session)) return reply.code(400).send({ error: 'bad id' });
    const file = path.join(config.dataDir, pid, `${session}.jsonl`);
    if (!fs.existsSync(file)) return reply.code(404).send({ error: 'no such session' });
    reply.header('content-type', 'application/x-ndjson');
    reply.header('content-disposition', `attachment; filename="${pid}_${session}.jsonl"`);
    return fs.createReadStream(file);
  });

  app.get('/sessions', async () => {
    const out: { pid: string; session: string; bytes: number }[] = [];
    if (fs.existsSync(config.dataDir)) {
      for (const pid of fs.readdirSync(config.dataDir)) {
        const dir = path.join(config.dataDir, pid);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.jsonl'))
            out.push({ pid, session: f.replace(/\.jsonl$/, ''), bytes: fs.statSync(path.join(dir, f)).size });
        }
      }
    }
    return out;
  });

  /** Mined pattern -> proposal card content. */
  app.post('/propose', async (req, reply) => {
    const body = req.body as { pattern?: GeneralizedPattern; occurrenceCount?: number };
    if (!body?.pattern?.steps?.length) {
      return reply.code(400).send({ error: 'expected { pattern, occurrenceCount }' });
    }
    return propose(body.pattern, body.occurrenceCount ?? body.pattern.support);
  });

  /** User request -> validated tool (prompted condition only). */
  app.post('/prompt', async (req, reply) => {
    const body = req.body as { request?: string; headers?: string[] };
    if (typeof body?.request !== 'string' || !Array.isArray(body?.headers)) {
      return reply.code(400).send({ error: 'expected { request, headers[] }' });
    }
    return promptToTool(body.request, body.headers);
  });

  return app;
}
