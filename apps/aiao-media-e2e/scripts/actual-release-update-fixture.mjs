import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  artifactPair,
  createArtifactServer,
  readReleaseArtifact,
  runActualReleaseUpdate
} from './actual-release-update.mjs';

const application = resolve(import.meta.dirname, '../../aiao-media');
const releases = artifactPair(
  await readReleaseArtifact(process.env.AIAO_MEDIA_UPDATE_A_DIR || resolve(application, 'tmp/public-release-baseline')),
  await readReleaseArtifact(process.env.AIAO_MEDIA_UPDATE_B_DIR || resolve(application, 'tmp/public-release-current'))
);
const server = await createArtifactServer(releases);
try {
  const evidence = await runActualReleaseUpdate({
    buildA: releases.a,
    buildB: releases.b,
    origin: server.origin,
    switchBuild: name => server.select(name)
  });
  const directory = resolve(import.meta.dirname, '../tmp/actual-release-update');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  await server.close();
}
