/**
 * US-904 阶段 D：Electron 原生存储 provider 的 E2E 探针（AC#46～53）。
 *
 * 这是**骨架**，不是可运行的探针：阶段 A 那份 `devtools-mv3-probe.mjs` 已经证明了
 * 「真实 Electron 主进程 + 真实 unpacked 扩展 + 真实 DevTools 面板 + 四段中继」的驱动方式
 * （openDevTools / activatePanel / readMainTabs / relayScript）。本文件要做的不是重写那套驱动，
 * 而是在它之上**把 v2 数据面的 REQUEST 发出去、把 provider 应答读回来**，逐条验证阶段 D。
 *
 * ⚠️ 待联网验证：真实 DevTools 驱动（CDP + sendInputEvent + shadow DOM）必须在真机上边跑边修。
 * 本文件只立结构、钉住「往哪发、回来看什么」，`TODO(stage-d)` 是还需真机校准的帧格式与 DOM 探测。
 *
 * 与 AC#45 的分工：AC#45（dev/prod 扩展加载隔离）由 `devtools-extension-loading.spec.ts` 覆盖——
 * 那套走打包产物 + `_electron.launch`。本探针复用阶段 A 的独立 Electron 脚本形态，
 * 只验 provider 语义，不重复验「扩展能不能加载」。
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { app, BrowserWindow, session } = createRequire(import.meta.url)('electron');

// 阶段 A 同款的位置参数解析：剥掉 Chromium 开关，避免 argv 错位。
const positional = process.argv.slice(1).filter(arg => !arg.startsWith('--'));
const EXTENSION_DIST = positional[1];
const OUTPUT_PATH = positional[2];

if (!EXTENSION_DIST || !OUTPUT_PATH) {
  process.stderr.write('用法：<electron> devtools-stage-d-probe.mjs <扩展 dist 目录> <结果 JSON 路径>\n');
  process.exit(2);
}

const findings = [];
const record = (step, ok, detail) => findings.push({ step, ok, detail });

const finish = code => {
  writeFileSync(OUTPUT_PATH, JSON.stringify(findings, null, 2));
  app.exit(code);
};

app.on('window-all-closed', () => {
  // 空实现：退出统一由 finish() 负责（阶段 A 同款理由）。
});

/**
 * 打开 DevTools 并等扩展的 `devtools.html` 加载。必须 `mode: 'bottom'`（dock）：
 * detach / undocked 下扩展面板根本不注册。阶段 A 的 `openDevTools` 直接可用，不要重写。
 */
// TODO(stage-d): 复用 devtools-mv3-probe.mjs 的 openDevTools / readMainTabs / selectRxdbTab / activatePanel。

app.whenReady().then(async () => {
  try {
    const ses = session.defaultSession;
    const extension = await ses.extensions.loadExtension(EXTENSION_DIST);
    record('AC45.extensionLoaded', true, { id: extension.id, name: extension.name });

    const win = new BrowserWindow({ width: 1500, height: 950, show: true });
    // TODO(stage-d): 页面 fixture 要用真实 RxDB + US-207 desktop SQLite + US-504 native files 初始化，
    // 不是阶段 A 的空握手页——否则 database/files provider 无从谈起。
    await win.loadURL('app://-/index.html');

    // TODO(stage-d): 打开 DevTools、选中 RxDB 面板、等 panel.html 挂载。

    // ---------- AC#46：database provider ----------
    // 在面板里发 database.query（真实四段中继），回读实体数据；逐类派发事件、切 branch。
    // 断言数据 / 全部 RXDB_EVENT_TYPES / branch 与主窗口 RxDB 一致，且不创建 OPFS/IDB fallback。

    // ---------- AC#47：native files provider ----------
    // 发 files.list / download / upload / create-directory / delete，
    // 断言只操作插件专用根、字节一致、流式无半写文件。

    // ---------- AC#48：诊断快照 ----------
    // 读完整 snapshot：1001+ 记录、两类缺失、在途上传排除、busy/too-large/expired。

    // ---------- AC#49：settings ----------
    // settings.export 恒回 export_unsupported；未声明清理回 provider_unsupported。

    // ---------- AC#50：安全边界 ----------
    // 伪造 none/readonly/full + mutation 组合、越界路径，断言 connector/preload/host 各层拒绝。

    // ---------- AC#51：session 清理 ----------
    // session A 有订阅/在途，关闭后开 B，断言 A 资源释放、B 拒绝旧身份。

    // ---------- AC#52：重启保真 ----------
    // 关掉 app 再起，断言同一实体/文件一致，证据经过真实 renderer/preload/main/host。

    // ---------- AC#53：conformance ----------
    // Electron 薄 driver 跑阶段 B 的共享断言，不复制 UI/wire/fixture/错误码。

    record('skeleton', false, { detail: 'TODO(stage-d): v2 数据面驱动未实装，本探针是骨架' });
    finish(1);
  } catch (error) {
    record('fatal', false, { error: String(error), stack: error?.stack });
    finish(1);
  }
});
