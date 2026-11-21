import { startNodeServer } from '../dist-node/server.mjs';

process.umask(0o077);
const application = await startNodeServer();
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void application.close().then(
      () => {
        process.exitCode = 0;
      },
      () => {
        process.exitCode = 1;
      }
    );
  });
