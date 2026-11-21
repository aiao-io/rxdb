import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = resolve(fileURLToPath(import.meta.url), '..');
const applicationRoot = resolve(scriptDirectory, '..', '..');
const repositoryRoot = resolve(applicationRoot, '..');
const defaultBundleRoot = resolve(repositoryRoot, 'dist/aiao-media/apps/admin/browser');
const adminSourceRoot = resolve(applicationRoot, 'apps/admin/src');

const forbiddenBundlePatterns = [
  { name: 'Supabase service-role key value', pattern: /\bsb_secret_[A-Za-z0-9._-]{20,}\b/ },
  { name: 'service-role key value', pattern: /\bservice_role[_-][A-Za-z0-9._-]{20,}\b/ },
  { name: 'service-role environment value', pattern: /SUPABASE_SERVICE_ROLE_KEY["']?\s*[:=]\s*["'][^"']{16,}["']/ },
  { name: 'JWT secret value', pattern: /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'common secret key prefix', pattern: /\b(?:sk_live|sk_test|sk-[A-Za-z0-9])[A-Za-z0-9_-]{16,}\b/ }
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

async function readTextFiles(directory) {
  const files = await filesUnder(directory);
  return Promise.all(files.map(async path => ({ path, text: await readFile(path, 'utf8') })));
}

export async function scanAdminSupabaseBoundary({ bundleRoot = defaultBundleRoot, sourceRoot = adminSourceRoot } = {}) {
  const sourceFiles = await readTextFiles(sourceRoot);
  const sourceCallers = sourceFiles.filter(({ text }) => /\/api\/admin\/login/.test(text));
  const bundleExists = await stat(bundleRoot)
    .then(value => value.isDirectory())
    .catch(() => false);
  const bundleFiles = bundleExists ? await readTextFiles(bundleRoot) : [];
  const bundleFindings = [];
  for (const { path, text } of bundleFiles) {
    if (/\/api\/admin\/login/.test(text)) {
      bundleFindings.push({ file: relative(repositoryRoot, path), name: 'legacy admin login caller' });
    }
    for (const forbidden of forbiddenBundlePatterns) {
      if (forbidden.pattern.test(text))
        bundleFindings.push({ file: relative(repositoryRoot, path), name: forbidden.name });
    }
  }
  return {
    bundleExists,
    sourceCallers: sourceCallers.map(({ path }) => relative(repositoryRoot, path)),
    bundleFindings
  };
}

export async function assertAdminSupabaseBoundary(options = {}) {
  const report = await scanAdminSupabaseBoundary(options);
  if (!report.bundleExists)
    throw new Error(`Admin production bundle 不存在：${options.bundleRoot ?? defaultBundleRoot}`);
  if (report.sourceCallers.length) throw new Error(`Admin 源码仍调用旧登录代理：${report.sourceCallers.join(', ')}`);
  if (report.bundleFindings.length) {
    const details = report.bundleFindings.map(finding => `${finding.file}: ${finding.name}`).join('\n');
    throw new Error(`Admin bundle 包含禁止内容：\n${details}`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const report = await assertAdminSupabaseBoundary();
  console.log(
    `Admin Supabase boundary passed: ${report.bundleFindings.length} findings, ${report.sourceCallers.length} legacy callers.`
  );
}
