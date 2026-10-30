import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.ts';
import { buildServer } from '../src/server.ts';

const PID = 'PTEST';

afterAll(() => {
  fs.rmSync(path.join(config.dataDir, PID), { recursive: true, force: true });
});

describe('POST /log', () => {
  it('appends events as JSONL under data/sessions/<pid>/<session>.jsonl', async () => {
    const app = buildServer();
    const events = [
      { t: 1, wall: 'w', pid: PID, session: 's1', cond: 'proactive', block: 1, kind: 'session', event: 'start' },
      { t: 2, wall: 'w', pid: PID, session: 's1', cond: 'proactive', block: 1, kind: 'command', cmd: 'freezeRows', args: { count: 1 } },
    ];
    const res = await app.inject({ method: 'POST', url: '/log', payload: { pid: PID, session: 's1', events } });
    expect(res.statusCode).toBe(200);
    const res2 = await app.inject({ method: 'POST', url: '/log', payload: { pid: PID, session: 's1', events: [events[0]] } });
    expect(res2.statusCode).toBe(200);

    const file = path.join(config.dataDir, PID, 's1.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines.length).toBe(3); // appended, not overwritten
    expect(JSON.parse(lines[1]).cmd).toBe('freezeRows');
    await app.close();
  });

  it('rejects path-traversal ids', async () => {
    const app = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/log',
      payload: { pid: '../evil', session: 's1', events: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /export', () => {
  it('returns the stored JSONL', async () => {
    const app = buildServer();
    await app.inject({
      method: 'POST',
      url: '/log',
      payload: { pid: PID, session: 's2', events: [{ t: 1, kind: 'session', event: 'start' }] },
    });
    const res = await app.inject({ method: 'GET', url: `/export/${PID}/s2` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"start"');
    const missing = await app.inject({ method: 'GET', url: `/export/${PID}/nope` });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /propose and /prompt input validation', () => {
  it('rejects malformed bodies', async () => {
    const app = buildServer();
    const r1 = await app.inject({ method: 'POST', url: '/propose', payload: {} });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({ method: 'POST', url: '/prompt', payload: { request: 5 } });
    expect(r2.statusCode).toBe(400);
    await app.close();
  });
});
