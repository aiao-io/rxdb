import { once } from 'node:events';
import { checkAttemptHistory, failureCode, withAcceptanceRunLock } from '../provider-acceptance.mjs';

const [directory, release, manifestSha256] = process.argv.slice(2);
const settings = {
  origin: 'https://media.aiao.io',
  baseUrl: 'https://provider.example.test/v1',
  model: 'fixture-image',
  release,
  manifestSha256,
  selection: { modes: ['direct'], aspects: ['square'] }
};
try {
  await withAcceptanceRunLock(directory, async () => {
    await checkAttemptHistory(settings, directory);
    process.send({ phase: 'sent' });
    await once(process, 'message');
  });
} catch (error) {
  process.send({ phase: 'blocked', code: failureCode(error) });
}
process.disconnect();
