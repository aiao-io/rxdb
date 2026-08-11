#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePreviewPath } from './preview-paths.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const buildDir = join(__dirname, '../build');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// 解析 _redirects 文件
function parseRedirects() {
  try {
    const redirectsPath = join(buildDir, '_redirects');
    const content = readFileSync(redirectsPath, 'utf-8');
    const rules = [];

    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const [from, to, status = '301'] = parts;
        rules.push({
          from,
          to,
          status: parseInt(status),
          pattern: from.endsWith('/*') ? from.slice(0, -2) : from
        });
      }
    });

    return rules;
  } catch {
    console.warn('⚠️  No _redirects file found');
    return [];
  }
}

// 匹配重定向规则
function matchRedirect(path, rules) {
  for (const rule of rules) {
    if (rule.from.endsWith('/*')) {
      if (path.startsWith(rule.pattern)) {
        return rule;
      }
    } else if (rule.from === path) {
      return rule;
    }
  }
  return null;
}

const redirectRules = parseRedirects();
console.log(`📋 Loaded ${redirectRules.length} redirect rules\n`);

// 创建服务器
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let requestPath;
  try {
    requestPath = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  if (requestPath !== '/' && requestPath.endsWith('/')) {
    requestPath = requestPath.slice(0, -1);
  }

  let filePath = resolvePreviewPath(buildDir, requestPath);

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  try {
    const stats = await stat(filePath);

    if (stats.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
    });
    res.end(content);
  } catch {
    // 检查重定向规则
    const redirect = matchRedirect(requestPath, redirectRules);

    if (redirect && redirect.status === 200) {
      const targetPath = resolvePreviewPath(buildDir, redirect.to);
      if (!targetPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      console.log(`🔄 ${requestPath} → ${redirect.to}`);

      try {
        const content = await readFile(targetPath);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
});

// 解析命令行参数
const args = process.argv.slice(2);
const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
const PORT = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1]) : process.env.PORT || 3000;

const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`\n✅ Server running at http://localhost:${PORT}`);
  console.log(`📂 Serving: ${buildDir}\n`);
  console.log(`Press Ctrl+C to stop\n`);
});
