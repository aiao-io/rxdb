#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const localBin = join(cwd, 'node_modules', '.bin');
const env = { ...process.env, PATH: `${localBin}:${process.env.PATH}` };

const apiDocsDir = join(cwd, 'docs/api');
if (!existsSync(apiDocsDir)) {
  execSync('typedoc --options typedoc.config.cjs', { stdio: 'inherit', env });
  execSync('node scripts/flatten-api-docs.mjs', { stdio: 'inherit', env });
}

execSync('docusaurus start', { stdio: 'inherit', env });
