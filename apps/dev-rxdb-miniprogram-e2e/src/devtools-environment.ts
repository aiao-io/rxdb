import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 微信开发者工具 CLI 在各平台的安装位置。 */
const CLI_BY_PLATFORM: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  win32: 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'
};

/** CLI 在服务端口关闭时回吐的特征串（中英两种 locale 都可能出现）。 */
const SERVICE_PORT_CLOSED_MARKERS = ['服务端口已关闭', 'service port disabled'];

const ENABLE_SERVICE_PORT_HINT = [
  '微信开发者工具的服务端口是关的，自动化无法接入。',
  '请打开开发者工具 → 设置 → 安全设置 → 把「服务端口」开启，然后重跑。',
  '这个开关只能在 GUI 里点：CLI 的 y 确认是弹在工具窗口里的对话框，管道和 pty 都喂不进去。'
].join('\n  ');

/** 解析后的开发者工具接入参数。 */
export interface DevtoolsEnvironment {
  /** 开发者工具 CLI 的绝对路径。 */
  readonly cliPath: string;
  /** 小程序项目根目录（含 project.config.json，其 miniprogramRoot 指向 dist/）。 */
  readonly projectPath: string;
  /**
   * 已在自动化模式下运行的工具实例的 WebSocket 端点。
   *
   * 有值就走 `connect()` 复用实例，省掉每个文件一次冷启动；没有就 `launch()` 自己拉起。
   */
  readonly wsEndpoint?: string;
}

function resolveCliPath(): string {
  const override = process.env['WECHAT_DEVTOOLS_CLI'];
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`WECHAT_DEVTOOLS_CLI 指向的文件不存在: ${override}`);
    }
    return override;
  }

  const fromPlatform = CLI_BY_PLATFORM[process.platform];
  if (!fromPlatform) {
    throw new Error(
      [
        `微信开发者工具没有 ${process.platform} 版本，本套件在这个平台上不可能通过。`,
        '它依赖 GUI 版开发者工具，只有 macOS 与 Windows 有——这也是它的 target 叫',
        '`e2e-devtools` 而不是 `e2e` 的原因：Linux CI 矩阵不会碰它。',
        '要在 Linux 上验证适配器逻辑，跑 `nx test rxdb-adapter-miniprogram`。'
      ].join('\n  ')
    );
  }
  if (!existsSync(fromPlatform)) {
    throw new Error(
      `没找到微信开发者工具 CLI: ${fromPlatform}\n  装好开发者工具，或用 WECHAT_DEVTOOLS_CLI 指向实际路径。`
    );
  }
  return fromPlatform;
}

function resolveProjectPath(): string {
  const projectPath = join(process.cwd(), '..', 'dev-rxdb-miniprogram');
  if (!existsSync(join(projectPath, 'project.config.json'))) {
    throw new Error(`没找到小程序项目配置: ${join(projectPath, 'project.config.json')}`);
  }
  if (!existsSync(join(projectPath, 'dist', 'app.json'))) {
    throw new Error(
      [
        `小程序产物缺失: ${join(projectPath, 'dist', 'app.json')}`,
        '先跑 `pnpm nx build dev-rxdb-miniprogram`（e2e-devtools target 已声明这条依赖，',
        '手工单跑 playwright 时才会撞到）。'
      ].join('\n  ')
    );
  }
  return projectPath;
}

function describeCliFailure(error: unknown): string {
  if (typeof error === 'object' && error && 'stdout' in error) {
    const shell = error as { readonly stdout?: string; readonly stderr?: string };
    return `${shell.stdout ?? ''}\n${shell.stderr ?? ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * 在把请求交给 automator 之前，先确认服务端口是开的。
 *
 * 不做这一步的话，端口关闭的表现是 automator 连接超时——一条既不说明原因、
 * 也不告诉人该点哪里的报错。这里把它翻译成可执行的指令。
 */
async function assertServicePortOpen(cliPath: string): Promise<void> {
  const output = await execFileAsync(cliPath, ['islogin'], { timeout: 60_000 }).then(
    result => `${result.stdout}\n${result.stderr}`,
    describeCliFailure
  );
  const closed = SERVICE_PORT_CLOSED_MARKERS.some(marker => output.toLowerCase().includes(marker.toLowerCase()));
  if (closed) throw new Error(ENABLE_SERVICE_PORT_HINT);
}

/**
 * 解析并校验开发者工具接入环境。
 *
 * 任何一项不满足都**抛错而不是 skip**：这个 target 不在 CI 自动矩阵里，
 * 跑它一定是人主动敲的命令，那就该看到确切的失败原因，而不是一个什么都没验证的绿。
 */
export async function resolveDevtoolsEnvironment(): Promise<DevtoolsEnvironment> {
  const cliPath = resolveCliPath();
  const projectPath = resolveProjectPath();
  const wsEndpoint = process.env['WECHAT_DEVTOOLS_WS_ENDPOINT'];
  if (!wsEndpoint) await assertServicePortOpen(cliPath);
  return { cliPath, projectPath, wsEndpoint };
}
