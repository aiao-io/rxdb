# @aiao/orbit

Orbit 是仓内独立维护的 Web 应用隔离运行内核。名称取自“轨道”：桌面承载多个独立运行的应用。代码、协议、构建和 Angular / React / Vue 适配均由本仓维护，当前包为 private。

设计灵感与起始基线来自 [Wujie](https://github.com/Tencent/wujie)，固定参考提交为 `c45932998c0602f34454df8d3e29f4d33a38446a`。本实现按桌面需求重构职责与协议，不依赖上游 npm 包，也不承诺上游 API 兼容；后续以 Orbit 的契约独立演进。

每个应用使用独立的原生 iframe 文档；Web Component 只承载窗口视口。应用必须接入协作 SDK，并在框架实际完成渲染后报告就绪。来源、上游许可、保留/删除清单和兼容边界见 [UPSTREAM.md](UPSTREAM.md)。

## 宿主

```ts
import { createOrbit } from '@aiao/orbit';

const runtime = createOrbit({
  allowedOrigins: ['https://apps.example.com'],
  onError: error => console.error(error)
});
const instance = runtime.createApp({
  appId: 'editor',
  instanceId: 'editor-window-1',
  version: '2026.11.1',
  url: 'https://apps.example.com/editor/',
  props: { theme: 'dark' }
});
instance.onRequest('file:read', async payload => readAuthorizedFile(payload));
await instance.mount(document.getElementById('window-content')!);
instance.hide();
instance.show();
instance.focus();
await instance.request('document:save', { fileId: 'notes' }, { timeout: 5000 });
instance.destroy();
runtime.dispose();
```

`readAuthorizedFile` 为宿主提供的服务示意，必须自行做权限校验。默认只允许宿主同源；额外来源必须逐个声明，不支持通配符。入口只接受 HTTP(S)、拒绝 URL 凭据及保留参数 `__aiao_orbit`。跨源应用还需服务器允许对应宿主嵌入，浏览器 CSP/iframe 策略照常生效。

同一 instanceId 在一个 runtime 内不能重复登记，销毁和失败均释放身份。重复 mount 同容器复用同一 ready Promise，跨容器移动明确失败。hide/show 保留原 iframe；从文档移除外壳会自动销毁实例。focus 把键盘焦点交给应用文档（宿主无法感知焦点在两个跨源 iframe 之间移动，激活窗口时由宿主显式调用），只在显示中的就绪状态可用。createOrbit 和模块导入支持 SSR，不注册全局监听。

状态：`created → loading → ready ↔ hidden`，失败进入 `failed`，显式释放进入 `destroyed`。ready 默认 15 秒超时；iframe 文档加载后 3 秒内仍未握手（入口不可达、被浏览器拦截或未接入 SDK，浏览器只给 iframe 报 load，不报 error）即以 LOAD_ERROR 失败，不必等满就绪时限。启动失败会拒绝 ready Promise 并调用 onError；运行中断通过状态订阅与 onError 通知。失败句柄不可复用，应重新 createApp；createOrbit.dispose 后不可创建新实例。

## 子应用

```ts
import { connectOrbitClient } from '@aiao/orbit/client';

const client = await connectOrbitClient();
const app = await bootstrapFramework(client?.context.props);
client?.onDispose(() => app.unmount());
client?.onRequest('document:save', async payload => saveDocument(payload));
client?.onPropsChange(props => applyTheme(props['theme']));
client?.ready();
```

`bootstrapFramework` 等为业务函数示意。握手必须发生在业务入口/路由模块初始化之前；SDK 会移除内部 URL 参数，再恢复为应用真实地址。普通页面和未带运行标记的 iframe 立即返回 undefined，可继续独立启动。

SDK 信任嵌入它的父窗口，宿主负责应用来源准入；它不认证桌面运营者身份。初始化校验父窗口和随机令牌，后续只接收握手时转交的专属端口。协议只接受不超过 1 MiB、深度不超过 32 的 JSON 数据，不能传函数、DOM、Date 或循环引用。

`client.request` 和 `instance.request` 默认 5 秒超时，可传 AbortSignal；取消会通知对端中止处理信号。退出会拒绝在途请求，清除超时与监听，取消入站处理。处理函数需要响应 signal，自身副作用不会被自动撤销。

子应用 `bus.$emit` 只发给宿主，不隐式转给其他应用。宿主 `instance.emit` 定向发送，`runtime.bus.$emit` 显式广播给这个运行内核的已连接应用。`$orbit.props/bus` 与 `__ORBIT.id` 为仓内主题和路由协议提供上下文入口。

## 窗口接口

`@aiao/orbit/window` 是给桌面类宿主用的窗口协议，接口对齐 Tauri：宿主用 `windowProps(state)` 把窗口初始状态放进启动属性、用 `serveWindow(instance, host)` 登记窗口操作，状态变化后调用返回值的 `publish()`；应用用 `getCurrentWindow(client)` 拿到当前窗口（宿主没给窗口时为 undefined，相当于 Tauri 的 `isTauri()` 为假）。

```ts
import { getCurrentWindow } from '@aiao/orbit/window';

const appWindow = getCurrentWindow(client);
appWindow?.state; // { platform: 'macos', frame: 'standard' | 'transparent', decorations, focused, maximized }
appWindow?.onStateChange(state => render(state));
await appWindow?.minimize(); // 另有 toggleMaximize()、close()、setTitle(title)、setDecorations(visible)
const stop = appWindow?.trackDragRegions(document); // 对应 data-tauri-drag-region
```

`frame: 'transparent'` 的窗口可以 `setDecorations(false)`，让宿主收起自己的标题栏，由应用画标题栏与窗口按钮（对应 Tauri 的 `decorations: false`）；标准窗口调用会被宿主拒绝。拖动区不转发指针（跨源 iframe 按下后指针归 iframe）：带 `data-orbit-drag-region` 的元素减去其中的按钮、链接、输入框与 `data-orbit-no-drag` 元素，作为形状上报给宿主，宿主在 iframe 上方盖拖动层。请求与事件都走实例专属端口，应用只能操作自己的窗口。

窗口协议是逐方法的旧协议（`window.minimize` 等，出错时以处理失败拒绝）；新接入的应用建议用下面的「桌面能力」，窗口操作归入同一个信封，错误码稳定。两者在桌面里落在同一个窗口上，权限一样：清单没有声明 `window` 时，桌面既不给窗口启动属性、也不登记旧版的窗口请求。

## 协议版本

握手消息的 `protocol` 字段是 `aiao.orbit:<版本号>`（版本号是正整数）。常量从 `@aiao/orbit` 导出：`PROTOCOL_NAME`（`aiao.orbit`）与 `PROTOCOL_VERSION`（本实现支持的版本，当前是 `1`）。协议版本 1 的握手字符串 `aiao.orbit:1` 已被线上应用使用，**不会变**。

规则（宿主与应用共用，单测断言）：

| 应用声明的版本             | 宿主（支持版本 N）的行为                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 等于或低于 N               | 照常运行，宿主按应用声明的版本通信（`init` 消息里的 `protocol` 回应应用声明的版本）。                                                                                                                |
| 高于 N                     | **明确失败，不缺能力继续运行**：宿主不建立端口，先向应用发一条 `{ type: 'incompatible', protocol, channel, supported, requested, message }` 通知，约 100 毫秒后实例以 `INCOMPATIBLE_PROTOCOL` 失败。 |
| 不是 `aiao.orbit:<正整数>` | 不是本协议，静默忽略（与之前一样，文档加载 3 秒后仍未握手按 `LOAD_ERROR` 失败）。                                                                                                                    |

`INCOMPATIBLE_PROTOCOL` 对应 `OrbitProtocolError`（继承 `OrbitError`），带 `requested`（应用声明的版本）与 `supported`（宿主支持的最高版本），消息含双方版本。宿主侧经 `instance.ready` 的拒绝、状态 `failed` 与 `onError` 得到它，桌面窗口据此显示原因；应用侧 `connectOrbitClient()` 收到通知后以同一个错误拒绝（只认带本次握手令牌、来自父窗口的通知）。版本协商用纯函数 `negotiateProtocol(requested, supported)` 表达，便于接入方自测。

新增协议能力时抬高 `PROTOCOL_VERSION`，旧应用不受影响：它们声明的版本不变，宿主仍按旧版本通信。

## 桌面能力

`@aiao/orbit/desktop` 是给桌面类宿主用的统一系统能力协议（Aiao Desktop 的 `DesktopAppContext` 与 remote-web 共用）：宿主用 `desktopProps(capabilities)` 把清单授予的能力放进启动属性、用 `serveDesktop(instance, host, { capabilities, onError })` 登记请求；应用用 `getDesktop(client)` 拿到能力（宿主不提供时为 undefined，相当于普通网页）。旧的 `@aiao/orbit/window`（逐方法协议）继续可用，已发布的应用不用改；新接入的应用用本节的统一接口。

```ts
// 宿主：每个实例一份 DesktopHost，绑定到这个实例的窗口
const server = serveDesktop(instance, host, {
  capabilities: ['window', 'appearance'],
  onError: (error, method) => showReason(error, method) // 拒绝、参数非法、超时由宿主在窗口里给出一句可见的原因
});

// 应用
import { DesktopError, getDesktop } from '@aiao/orbit/desktop';
const desktop = getDesktop(client);
await desktop?.window.setTitle('demo — Aiao Code');
try {
  await desktop?.appearance.set({ appearance: 'dark' }); // 需要另外声明 appearance:write
} catch (error) {
  if (error instanceof DesktopError && error.code === 'CAPABILITY_DENIED') showNotAllowed();
}
```

### 两层权限

登记表的浏览器权限（iframe 的 `allow`）决定应用能否直接调用浏览器 API，清单的 `capabilities` 决定应用能否经 Orbit 请求宿主，两层各管各的。默认拒绝只约束第二层，不是对浏览器所有访问路径的保证；两层都有的能力（现在是 clipboard）要求声明一致，由宿主的登记校验把关。未声明的能力一律返回 `CAPABILITY_DENIED`，宿主函数不会被调用；宿主也不为未声明的能力订阅推送事件。`getDesktop(client).capabilities` 是清单授予这个应用的能力，只供应用自检（不认识的能力名会被忽略，新版宿主授予旧 SDK 还不认识的能力不会让应用起不来）；授权的依据在宿主，不在应用读到的这份列表。

### 能力与方法

方法名是 `<能力域>.<方法>`，线上请求名是 `desktop.<方法名>`；方法与能力的对应写在 `DESKTOP_METHOD_CAPABILITIES`，宿主与内置应用的权限检查都读这张表。

| 能力名                                | 方法与推送                                                                                                                                                      | 说明                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `window`                              | `getState`、`setTitle`、`minimize`、`restore`、`toggleMaximize`、`close`、`setDecorations`、`setDragRegions`；`onStateChange`                                   | 只作用于调用方自己的窗口。`setDecorations(false)` 只有运营方批准 `transparent` 外观的应用能用。拖动区沿用 `data-orbit-drag-region`（`trackDragRegions(root)`）。                                                                                                                                           |
| `menu`                                | `set(menus)`；`onCommand(handler)`                                                                                                                              | 登记本窗口的菜单，菜单只在所属窗口在前台时显示，窗口关闭时解绑；`set([])` 撤销登记。同一次登记里命令 ID 重复是 `INVALID_ARGUMENT`。桌面内部用 `<appId>:<commandId>` 区分各应用，应用回调收到的是自己的命令 ID。                                                                                            |
| `app`                                 | `open(appId)`、`focus()`、`quit()`                                                                                                                              | `open` 只接受清单里已登记的 appId（未登记、系统入口、网址一律 `INVALID_ARGUMENT`），不带任何参数；`focus`、`quit` 只作用于调用方自己的应用。                                                                                                                                                               |
| `appearance`、`appearance:write`      | `get()`、`set(patch)`；`onChange`                                                                                                                               | 读取需 `appearance`，写入需另外声明 `appearance:write`。写入改的是全局系统设置，值只接受登记的取值集合（`DESKTOP_APPEARANCE_VALUES`：显示模式 `light`、`dark`、`auto`，强调色九种），超出是 `INVALID_ARGUMENT`。                                                                                           |
| `notification`                        | `post({ title, body, icon?, dedupeKey? })` → `{ id }`                                                                                                           | 条目归属调用方 appId，通知中心显示该应用的名称与图标（应用不能冒名）；`icon` 只能是桌面登记的图标 ID 或内联图片（`data:image/png\|jpeg\|gif\|webp;base64,…`）；同一应用相同的 `dedupeKey` 覆盖旧条目；每分钟条数有上限（`RATE_LIMITED`）。已提交的通知留在通知中心由用户清除，不随窗口关闭撤回。           |
| `clipboard:read`、`clipboard:write`   | `readText()` → 文本；`writeText(text)`                                                                                                                          | 影响范围是用户机器的系统剪贴板。读取由浏览器的权限提示决定，用户拒绝是 `BROWSER_PERMISSION_DENIED`；写入要求请求落在用户手势的有效期内，没有手势同样是 `BROWSER_PERMISSION_DENIED`，宿主不替用户在没有手势时写。浏览器权限层要在登记表 `allow` 里授予 `clipboard-read` / `clipboard-write`，两层必须一致。 |
| `filesystem:read`、`filesystem:write` | `open({ accept? })` → `{ name, mime, size, bytes, handle, version }`；`save({ handle?, suggestedName, bytes, expectedVersion? })` → `{ name, version, handle }` | `filesystem` 指桌面的虚拟磁盘，不是用户机器上的文件。打开 / 保存由桌面自己的面板提供，应用只拿到用户选定的那一个文件的内容与实例绑定的凭证。详见下面的「文件」一节。                                                                                                                                       |

### 请求与结果

请求：`desktop.<方法名>`，载荷 `{ instanceId, args }`（需要用户操作的请求再带 `requestId`，见下节）——`instanceId` 是握手时宿主给应用的实例 ID，宿主据此丢弃不属于这条连接的请求（旧实例迟到的请求）。回复是信封：成功 `{ ok: true, value }`，失败 `{ ok: false, code, message }`；`getDesktop` 把失败还原成 `DesktopError`（`code` 是稳定错误码）。宿主每个请求依次检查：实例还在、实例 ID 一致、能力已声明、参数合法、宿主在时限内处理完。宿主自己的程序错误不冒充任何错误码，按处理失败（`HANDLER_ERROR`）原样回给应用。

推送事件：`desktop.window.state`（窗口状态变化）、`desktop.menu.command`（用户点选菜单命令）、`desktop.appearance.change`（外观变化），只在应用就绪后推，只推变化、不推初始值（初始值用 `getState()` / `get()` 读）。

### 需要用户操作的请求

`filesystem.open` 与不带 `handle` 的 `filesystem.save` 要用户在桌面的面板里选文件、确认覆盖，用户停留多久没有上限，而 Orbit 的 RPC 时限最多 120 秒，所以这类请求不占着一个 RPC 等用户：请求带一个 `requestId`（`getDesktop` 自动生成），宿主校验完实例、能力与参数就应答「已受理」（`{ ok: true, value: null }`），宿主调用在后台跑，最终结果用事件 `desktop.request.settled` 送达，载荷 `{ requestId, envelope }`（成功或稳定错误码），宿主自己的程序错误是 `{ requestId, handlerError }`。应用侧的 `getDesktop` 把它们接成一个 Promise：先等「已受理」（时限 `callTimeoutMs`），再等完成事件（没有时限）；连接断开（窗口关闭、实例销毁）时还在等的调用以 `WINDOW_CLOSED` 结束。实例销毁或失败之后宿主才完成的请求，结果不再送出。

**超时只计宿主处理请求的时间**：宿主处理请求有 `requestTimeoutMs` 的时限，宿主等用户的那一段（`DesktopFilesystemHost.open / save` 的第二个参数 `interaction.waitForUser(pending)`）暂停计时，用户操作完再接着算剩下的时间——所以用户停留多久都不会让请求超时，而用户选定之后读写磁盘卡住仍然是 `TIMEOUT`。带 `handle` 的保存没有面板，整段都计时。

### 文件

- **只作用于用户选定的那一个文件**：`open` 返回内容快照与凭证 `handle`，凭证只能把内容写回这个文件，不能读别的文件、列目录或换目标。`accept`（最多 16 项扩展名或 MIME 类型）只做显示过滤，不限制用户能选什么；超过 `filesystem.bytes` 的文件在面板里禁用选择并说明原因。
- **`version`**：打开（或保存）时文件的修改时间与大小，一个不透明的字符串（`<毫秒时间>:<字节数>`），应用不解析它，保存时原样作为 `expectedVersion` 交回。
- **带 `handle` 的 `save`**：先比对 `expectedVersion`——磁盘上的文件已被改动是 `FILE_CHANGED`（不写入，应用可以改走另存）；文件已被删除或改名是 `FILE_NOT_FOUND`（不写入，**也不在原路径新建**）；通过才写回，返回新版本。不再弹确认。`expectedVersion` 只能与 `handle` 一起给；省略它就不比对版本（应用明确选择覆盖），但文件不在了仍然是 `FILE_NOT_FOUND`。
- **不带 `handle` 的 `save`**：一律弹出保存面板，由用户选位置和文件名，目标已存在时面板要求用户确认覆盖，应用不能跳过；返回的 `handle` 是新选定的文件的凭证。保存内容超过 `filesystem.bytes` 是 `FILE_TOO_LARGE`。
- **取消与关闭**：用户在面板里取消（按钮或 Esc）是 `USER_CANCELLED`，桌面不弹错误、不写盘；同一实例同一时刻只开一个面板，重复请求是 `BUSY`；窗口关闭、实例销毁或重试之后，面板随窗口关闭、不再提交任何写入，未完成的请求以 `WINDOW_CLOSED` 结束，凭证失效，再用是 `HANDLE_INVALID`，磁盘不变。
- **字节在线上是 base64**：`bytes` 经 base64 放进 JSON 消息，`getDesktop` 在应用侧收发的都是 `Uint8Array`。

### 错误码表

应用按 `code` 分支，不匹配错误文本。用户取消是正常结果：调用方收到取消码后安静结束，桌面不弹错误；拒绝、参数非法与超时由桌面在窗口里给出一句可见的原因（常量 `DESKTOP_ERROR_PRESENTATION`）。

| 错误码                      | 含义                                                          | 桌面呈现           | 阶段 |
| --------------------------- | ------------------------------------------------------------- | ------------------ | ---- |
| `CAPABILITY_DENIED`         | 清单没有声明这项能力（或这个窗口不允许这个操作）              | 窗口里一句可见原因 | C    |
| `INVALID_ARGUMENT`          | 参数非法（类型、长度、取值集合、重复的命令 ID、未登记的应用） | 窗口里一句可见原因 | C    |
| `USER_CANCELLED`            | 用户取消（正常结果）：文件面板里取消或按 Esc                  | 不提示             | D    |
| `BROWSER_PERMISSION_DENIED` | 浏览器层拒绝（权限提示被拒、写剪贴板时没有用户手势）          | 只回给应用         | D    |
| `TIMEOUT`                   | 宿主在时限内没有处理完                                        | 窗口里一句可见原因 | C    |
| `WINDOW_CLOSED`             | 窗口已关闭、实例已销毁或已被重试出来的新实例取代              | 只回给应用         | C    |
| `FILE_CHANGED`              | 磁盘上的文件已被改动（带凭证保存时版本不符）                  | 只回给应用         | D    |
| `FILE_NOT_FOUND`            | 文件已被删除或改名                                            | 只回给应用         | D    |
| `FILE_TOO_LARGE`            | 超过大小上限                                                  | 只回给应用         | D    |
| `HANDLE_INVALID`            | 文件凭证在窗口关闭、实例销毁或重试后失效                      | 只回给应用         | D    |
| `BUSY`                      | 同一实例同一时刻只开一个面板                                  | 只回给应用         | D    |
| `RATE_LIMITED`              | 通知频率超限                                                  | 只回给应用         | D    |

### 协议常量

超时、大小与频率上限是协议常量（`DESKTOP_LIMITS`），阶段 C、D 实现前定下，单测逐项断言；改动时同步更新这里。

| 常量                                        | 值                                                                                                                                            | 说明                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestTimeoutMs`                          | 5000                                                                                                                                          | 宿主处理一次请求的时限，**只计宿主处理的时间**：用户在桌面面板里选文件、确认覆盖的停留时间不计入（宿主用 `interaction.waitForUser` 声明）。超时回 `TIMEOUT`。                            |
| `callTimeoutMs`                             | 7000                                                                                                                                          | 应用侧等待宿主**应答**的兜底时限，比宿主多留 2 秒，让宿主自己的 `TIMEOUT` 先到。需要用户操作的请求，它只管「已受理」的应答，用户操作的最终结果没有时限。RPC 层的超时同样归为 `TIMEOUT`。 |
| `titleLength`、`dragRegions`、`appIdLength` | 256、64、64                                                                                                                                   | 窗口标题的字符数、一次上报的拖动区数、应用 ID 的字符数。                                                                                                                                 |
| `menu`                                      | `sections` 12、`itemsPerSection` 64、`commands` 256、`sectionLabelLength` 32、`itemLabelLength` 64、`shortcutLength` 16、`commandIdLength` 64 | 菜单结构上限；命令 ID 由字母或数字开头，其后字母、数字、`.`、`_`、`-`，不含冒号。                                                                                                        |
| `notification`                              | `titleLength` 120、`bodyLength` 1000、`dedupeKeyLength` 128、`iconBytes` 65536、`perMinute` 10、`windowMs` 60000、`entriesPerApp` 20          | 同一 appId 在 `windowMs` 内最多提交 `perMinute` 条，超限 `RATE_LIMITED`；通知中心里每个应用最多保留 `entriesPerApp` 条（超出的旧条目被挤掉）；`iconBytes` 是内联图片解码后的字节数。     |
| `clipboard`                                 | `textLength` 262144                                                                                                                           | 文本字符数；最坏情况（每字符 3 字节）仍在 1 MiB 消息上限之内。                                                                                                                           |
| `filesystem`                                | `bytes` 524288、`acceptEntries` 16、`nameLength` 255                                                                                          | 文件内容经 base64 放进 JSON 消息，编码后仍在 1 MiB 消息上限之内；超过 `bytes` 是 `FILE_TOO_LARGE`。                                                                                      |

### 实例绑定与解绑

每个请求带实例 ID。窗口关闭、实例销毁或重试之后，宿主的 `serveDesktop` 自动解绑（方法注销、事件订阅取消），已经派发出去的旧请求回调、实例 ID 与连接不符的请求一律 `WINDOW_CLOSED`，不会调用宿主函数；重试创建的是新实例 ID。旧实例销毁时端口关闭、iframe 移除，所以它**物理上**发不出迟到的消息，实例 ID 检查是纵深防御。

### 扩展点

新增一项能力：先在 `DesktopCapability` 的取值表（`DESKTOP_CAPABILITIES`）里确认名称，在 `DesktopArguments`、`DesktopResults` 里登记方法，再在注册表里补它的规格（所属能力、参数校验、宿主调用、结果校验；需要线上编码的值补 `encodeArguments` / `encodeResult`，要用户操作的方法补 `interactive`）、在 `DesktopHost` 与 `OrbitDesktop` 里加对应的接口——漏补任何一处编译不过。数值常量写进 `DESKTOP_LIMITS` 并由单测断言。

## 三框架生命周期

| 入口                  | API                             | 返回契约       |
| --------------------- | ------------------------------- | -------------- |
| `@aiao/orbit/angular` | `injectOrbit(runtime, options)` | `OrbitBinding` |
| `@aiao/orbit/react`   | `useOrbit(runtime, options)`    | `OrbitBinding` |
| `@aiao/orbit/vue`     | `useOrbit(runtime, options)`    | `OrbitBinding` |

三端均在容器连接文档后调用 `binding.mount(container)`；框架卸载时自动 `binding.unmount()`。binding 支持销毁后再次 mount，适配 React StrictMode。React options 使用稳定引用；Vue 在 setup/有效作用域中使用；Angular 在注入上下文中调用，可在 afterNextRender 装载。核心包不导入框架，各框架为可选 peer dependencies。

## 校验

```bash
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t build,typecheck,lint -p orbit --parallel=1
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx test orbit --coverage
```

测试自动先构建三框架子应用，再通过真实 Chromium iframe 装载。首次需安装 Chromium：`pnpm exec playwright install chromium`。测试覆盖身份、协议来源校验、属性/事件/双向请求、取消、超时、错误、隐藏恢复、动态资源、框架卸载和 30 轮回收。测试页面和框架演示产物不进入内核 dist。

当前不包括 macOS/Windows 桌面外壳、应用目录、文件系统、托管存储、服务授权或离线缓存；本包是这些功能的运行基础。实机浏览器矩阵及最终产品验收另行记录。
