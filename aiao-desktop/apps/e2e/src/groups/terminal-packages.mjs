import { installPackageRegistry } from '../fixtures/package-registry.mjs';

/** 全新浏览器上下文里的首次加载与真实安装，避免 OPFS 里已有工具掩盖静态资源遗漏。 */
export const terminalPackages = {
  name: 'terminal-packages',
  description: '终端包管理器：同源 vendor 首次加载、固定版本、npm 安装依赖并由 Node 执行',
  keys: [
    'terminalPackages.vendorAssets',
    'terminalPackages.npm',
    'terminalPackages.npx',
    'terminalPackages.pnpm',
    'terminalPackages.yarn',
    'terminalPackages.corepack',
    'terminalPackages.installsDependency',
    'terminalPackages.runsDependency'
  ],
  async run(session) {
    const { context, page, origin } = session;
    const { openTerminal, runInShell, xtermText } = session.helpers;
    const assets = new Set();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === origin && /^\/vendor\/.*-pack\.bin$/.test(url.pathname) && response.ok() &&
        !response.headers()['content-type']?.includes('text/html')) assets.add(url.pathname);
    });
    await installPackageRegistry(context);
    await session.openDesktop();
    await openTerminal();
    let sequence = 0;
    const run = async command => {
      const id = ++sequence;
      const done = new RegExp(`AIAO_PM_DONE_${id}[\\s\\S]*\\$\\s*$`);
      const finished = await runInShell(`echo AIAO_PM_BEGIN_'${id}'; ${command}; echo AIAO_PM_DONE_'${id}'`, done);
      const text = await xtermText();
      const output = text.split(`AIAO_PM_BEGIN_${id}`).at(-1).split(`AIAO_PM_DONE_${id}`)[0];
      if (!finished || /Error:/.test(output)) console.error(`${command}: ${text}`);
      return { finished, output };
    };
    const version = async (command, expected) => {
      const result = await run(command);
      return result.finished && expected.test(result.output) && !/Error:/.test(result.output);
    };
    const checks = {
      vendorAssets: false,
      npm: await version('npm --version', /10\.9\.2/),
      npx: await version('npx --version', /10\.9\.2/),
      pnpm: await version('pnpm --version', /11\.28\.9/),
      yarn: await version('yarn versions --json', /"yarn"\s*:\s*"1\.22\.22"/),
      corepack: await version('corepack --version', /0\.35\.0/),
      installsDependency: false,
      runsDependency: false
    };
    await run('mkdir -p /tmp/npm-smoke');
    const installed = await run('npm install aiao-terminal-smoke@1.0.0 --prefix /tmp/npm-smoke --ignore-scripts --no-audit --no-fund --package-lock=false --fetch-retries=0');
    checks.installsDependency = installed.finished && /added 1 package/.test(installed.output);
    const executed = await run('node -e "console.log(require(\'/tmp/npm-smoke/node_modules/aiao-terminal-smoke\'))"');
    checks.runsDependency = executed.finished && executed.output.includes('AIAO_TERMINAL_DEPENDENCY_OK');
    checks.vendorAssets = ['npm', 'pnpm', 'yarn', 'corepack'].every(name => assets.has(`/vendor/${name}-pack.bin`));
    if (Object.values(checks).some(passed => !passed)) console.error(await xtermText());
    return { terminalPackages: checks };
  }
};
