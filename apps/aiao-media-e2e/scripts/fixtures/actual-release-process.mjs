import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [mode, marker] = process.argv.slice(2);
const writeMarker = text => writeFileSync(marker, text, { flag: 'wx', mode: 0o600 });
const modes = {
  'delayed-exit': () => {
    process.on('SIGTERM', () => {
      setTimeout(() => {
        writeMarker('closed');
        process.exit(0);
      }, 80);
    });
  },
  child: () => {
    process.on('SIGTERM', () => undefined);
    writeMarker(String(process.pid));
  },
  parent: () => {
    process.on('SIGTERM', () => process.exit(0));
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'child', marker], { stdio: 'inherit' });
  }
};

if (!Object.hasOwn(modes, mode) || typeof marker !== 'string' || !marker)
  throw new Error('INVALID_PROCESS_FIXTURE_ARGUMENTS');
modes[mode]();
setInterval(() => undefined, 1000);
