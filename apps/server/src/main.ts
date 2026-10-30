import { buildServer } from './server.ts';
import { config } from './config.ts';

const app = buildServer();
app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => {
    console.log(`[aw-server] listening on http://127.0.0.1:${config.port}`);
    console.log(`[aw-server] ollama: ${config.ollamaUrl} model: ${config.ollamaModel}`);
    console.log(`[aw-server] sessions: ${config.dataDir}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
