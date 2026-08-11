import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const artifactExtensions = new Set(['.cjs', '.html', '.js', '.map', '.mjs']);
const secretKeyPattern = /(?<![A-Za-z0-9_-])sb_secret_[A-Za-z0-9_-]+(?![A-Za-z0-9_-])/g;
const jwtPattern = /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g;

function fingerprint(credential) {
  return createHash('sha256').update(credential).digest('hex');
}

function hasForbiddenJwtRole(payloadSegment) {
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    return typeof payload === 'object' && payload !== null && Object.hasOwn(payload, 'role') && payload.role !== 'anon';
  } catch {
    return false;
  }
}

export function findForbiddenCredentials(contents) {
  const credentials = new Set();

  for (const match of contents.matchAll(secretKeyPattern)) {
    credentials.add(match[0]);
  }

  for (const match of contents.matchAll(jwtPattern)) {
    if (hasForbiddenJwtRole(match[2])) {
      credentials.add(match[0]);
    }
  }

  return [...credentials];
}

async function listArtifactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listArtifactFiles(path)));
    } else if (entry.isFile() && artifactExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

export async function scanBuildArtifacts(root) {
  const absoluteRoot = resolve(root);
  const files = await listArtifactFiles(absoluteRoot);
  const findings = [];

  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    const artifact = relative(absoluteRoot, file).split(sep).join('/');
    for (const credential of findForbiddenCredentials(contents)) {
      findings.push({ artifact, fingerprint: fingerprint(credential) });
    }
  }

  return { filesScanned: files.length, findings };
}

async function main() {
  const root = process.argv[2];
  if (!root) {
    throw new Error('Build artifact directory is required');
  }

  const result = await scanBuildArtifacts(root);
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      console.error(`${finding.artifact} sha256:${finding.fingerprint}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Credential audit passed: ${result.filesScanned} artifact files scanned`);
}

main().catch(() => {
  console.error('Credential audit could not scan build artifacts');
  process.exitCode = 1;
});
