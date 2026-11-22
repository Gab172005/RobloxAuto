import { createRoForgeRuntime } from './app.js';
import { SERVER_HOST, SERVER_PORT } from './config.js';

const runtime = createRoForgeRuntime();
const integrity = runtime.registry.verifyIntegrity();

if (!integrity.ok) {
  console.warn('[RoForge] Registry integrity warnings:', integrity.errors);
}

runtime.server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(
    `[RoForge Studio] Server listening on http://${SERVER_HOST}:${SERVER_PORT} (WS: ws://${SERVER_HOST}:${SERVER_PORT}/ws)`
  );
  console.log(
    `[RoForge Studio] Loaded ${integrity.agentCount} specialist agents & ${integrity.playbookCount} Roblox Playbook chapters.`
  );
});

const shutdown = () => {
  console.log('\n[RoForge Studio] Shutting down cleanly...');
  runtime.gemini.cancelAll();
  runtime.bridge.stopRojoServe();
  runtime.server.close(() => {
    runtime.db.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
