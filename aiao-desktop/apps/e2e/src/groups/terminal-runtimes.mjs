import { readFile } from 'node:fs/promises';

/** 真正启动解释器、编译器和数据库；浏览器禁外网，资源遗漏会直接失败。 */
export const terminalRuntimes = {
  name: 'terminal-runtimes',
  description: '终端运行时：Python / pip / 科学计算、质量工具、TypeScript、Bun 与 SQLite',
  keys: [
    'terminalRuntimes.lazy',
    'terminalRuntimes.python',
    'terminalRuntimes.python3',
    'terminalRuntimes.pythonExit',
    'terminalRuntimes.pythonAsync',
    'terminalRuntimes.script',
    'terminalRuntimes.sharedDisk',
    'terminalRuntimes.pip',
    'terminalRuntimes.installedPackage',
    'terminalRuntimes.pipFreeze',
    'terminalRuntimes.numpyPandas',
    'terminalRuntimes.scipySklearn',
    'terminalRuntimes.pythonLibraries',
    'terminalRuntimes.pytest',
    'terminalRuntimes.black',
    'terminalRuntimes.mypy',
    'terminalRuntimes.ruff',
    'terminalRuntimes.tsc',
    'terminalRuntimes.tsgo',
    'terminalRuntimes.bun',
    'terminalRuntimes.nodeSqlite',
    'terminalRuntimes.bunSqlite'
  ],
  async run(session) {
    const { context, page, origin } = session;
    const { openTerminal, xtermText, desktopIcon, appears } = session.helpers;
    const wheelName = 'aiao_terminal_smoke-1.0.0-py3-none-any.whl';
    await context.route(`**/vendor/__fixtures__/${wheelName}`, async route => route.fulfill({
      contentType: 'application/octet-stream',
      body: await readFile(new URL(`../fixtures/${wheelName}`, import.meta.url))
    }));
    const requested = new Set();
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname.startsWith('/vendor/')) requested.add(url.pathname);
    });
    await session.openDesktop();
    await openTerminal();
    const checks = { lazy: requested.size === 0 };
    let sequence = 0;
    const run = async (command, expected) => {
      const id = ++sequence;
      await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').focus();
      await page.keyboard.type(`echo AIAO_RT_BEGIN_'${id}'; ${command}; echo AIAO_RT_DONE_'${id}'`);
      await page.keyboard.press('Enter');
      const finished = await page.waitForFunction(
        source => new RegExp(source).test(document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? ''),
        `AIAO_RT_DONE_${id}[\\s\\S]*\\$\\s*$`,
        { timeout: 120_000 }
      ).then(() => true, () => false);
      const text = await xtermText();
      const output = text.split(`AIAO_RT_BEGIN_${id}`).at(-1).split(`AIAO_RT_DONE_${id}`)[0];
      const passed = finished && expected.test(output) && !/Traceback|Error:|not available|could not load/.test(output);
      if (!passed) console.error(`${command}: ${text}`);
      return passed;
    };
    checks.python = await run('python -c "import sys; print(\'PYTHON_OK\', sys.version_info.major, sys.version_info.minor)"', /PYTHON_OK 3 14/);
    checks.python3 = await run('python3 -c "print(\'PYTHON3_OK\', sum(range(10)))"', /PYTHON3_OK 45/);
    checks.pythonExit = await run('python -c "raise SystemExit(7)" && echo BAD_EXIT || echo PYTHON_EXIT_OK', /PYTHON_EXIT_OK/);
    checks.pythonAsync = await run('python -c "from __future__ import annotations; import asyncio; await asyncio.sleep(0); print(\'PYTHON_ASYNC_OK\')"', /PYTHON_ASYNC_OK/);
    await run('echo \'print("PYTHON_SCRIPT_OK", 6 * 7)\' > /tmp/runtime-smoke.py', /[\s\S]*/);
    checks.script = await run('python /tmp/runtime-smoke.py', /PYTHON_SCRIPT_OK 42/);
    checks.sharedDisk = await run('python -c "from pathlib import Path; p = Path(\'Desktop/python-note.txt\'); p.write_text(\'AIAO_PYTHON_DISK_OK\'); print(p.read_text())"', /AIAO_PYTHON_DISK_OK/) &&
      await appears(desktopIcon('python-note.txt'));
    await run('mkdir -p /tmp/python-smoke && cd /tmp/python-smoke', /[\s\S]*/);
    checks.pip = await run(`pip install ${origin}/vendor/__fixtures__/${wheelName}`, /Stored in \.venv\/ \([1-9]\d* files/);
    checks.installedPackage = await run('python -c "import aiao_terminal_smoke; print(aiao_terminal_smoke.message)"', /AIAO_PYTHON_PACKAGE_OK/);
    checks.pipFreeze = await run('pip freeze', /aiao[-_]terminal[-_]smoke==1\.0\.0/);
    checks.numpyPandas = await run('python -c "import numpy as np; import pandas as pd; print(\'DATA_OK\', int(pd.Series(np.arange(5)).sum()))"', /DATA_OK 10/);
    checks.scipySklearn = await run('python -c "from scipy.linalg import det; from sklearn.linear_model import LinearRegression; print(\'SCIENCE_OK\', int(det([[1, 0], [0, 2]])), round(float(LinearRegression().fit([[0], [1]], [0, 2]).predict([[2]])[0])))"', /SCIENCE_OK 2 4/);
    checks.pythonLibraries = await run('python -c "import fastapi, flask, httpx, requests, sqlalchemy, openpyxl; from zoneinfo import ZoneInfo; from rich.markdown import Markdown; print(\'LIBRARIES_OK\', ZoneInfo(\'Asia/Shanghai\').key)"', /LIBRARIES_OK Asia\/Shanghai/);
    await run('echo \'def test_answer(): assert 2 + 2 == 4\' > test_runtime.py', /[\s\S]*/);
    checks.pytest = await run('pytest test_runtime.py -q', /1 passed/);
    checks.black = await run('black --version', /black.*26\.5\.1/);
    checks.mypy = await run('mypy --version', /mypy 1\.19\.1/);
    await run('echo \'answer = 42\' > /tmp/ruff_smoke.py', /[\s\S]*/);
    checks.ruff = await run('ruff check /tmp/ruff_smoke.py && ruff format --check /tmp/ruff_smoke.py', /All checks passed[\s\S]*1 file left unchanged/);
    await run('echo \'const value: number = 42; console.log("TYPESCRIPT_OK", value);\' > /tmp/runtime-smoke.ts', /[\s\S]*/);
    checks.tsc = await run('tsc /tmp/runtime-smoke.ts --outDir /tmp/ts-output --ignoreConfig && node /tmp/ts-output/runtime-smoke.js', /TYPESCRIPT_OK 42/);
    checks.tsgo = await run('tsgo --version', /Version 7\./);
    checks.bun = await run('bun -e "console.log(\'BUN_OK\', 6 * 7)"', /BUN_OK 42/);
    checks.nodeSqlite = await run('node -e "const {DatabaseSync} = require(\'node:sqlite\'); const db = new DatabaseSync(\'/tmp/node-smoke.sqlite\'); db.exec(\'CREATE TABLE data (value INTEGER); INSERT INTO data VALUES (42)\'); db.close(); const reopened = new DatabaseSync(\'/tmp/node-smoke.sqlite\'); console.log(\'NODE_SQLITE_OK\', reopened.prepare(\'SELECT value FROM data\').get().value); reopened.close();"', /NODE_SQLITE_OK 42/);
    await run('echo \'import { Database } from "bun:sqlite"; const db = new Database(":memory:"); console.log("BUN_SQLITE_OK", db.query("SELECT 42 AS value").get().value); db.close();\' > /tmp/bun-sqlite.mjs', /[\s\S]*/);
    checks.bunSqlite = await run('bun /tmp/bun-sqlite.mjs', /BUN_SQLITE_OK 42/);
    return { terminalRuntimes: checks };
  }
};
