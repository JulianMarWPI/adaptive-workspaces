import { buildServer } from './server.ts';
import { config } from './config.ts';
import { warmOllama } from './ollama.ts';

const app = buildServer();
app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => {
    console.log(`[aw-server] listening on http://127.0.0.1:${config.port}`);
    console.log(`[aw-server] ollama: ${config.ollamaUrl} model: ${config.ollamaModel}`);
    console.log(`[aw-server] sessions: ${config.dataDir}`);
    // Pre-load the model so the first proposal of a demo/session is fast.
    console.log('[aw-server] warming Ollama…');
    warmOllama().then((ok) =>
      console.log(ok ? '[aw-server] ollama warm, model resident' : '[aw-server] ollama warmup skipped (not reachable)'),
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
