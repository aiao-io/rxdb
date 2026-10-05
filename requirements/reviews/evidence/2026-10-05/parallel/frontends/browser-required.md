# 必需但未验证的 browser / consumer 证据（2026-10-05）

此清单是收口交接，不扩本轮 scope、不新增 probe，不由本子任务启动 browser/server。

## Editor 三端真实输入 / selection

- 用当前 build、真实浏览器和原生输入法，记录 OS/输入法/浏览器版本。先 caret/range selection，再中文或日文 composition 中宿主 append/格式化/value 回写；记录 compositionstart/update/end、beforeinput/input、CM doc 与 DOM Selection、用户 change 次数。
- 必须有普通键入/纯外部写入正反对照；相同回写不 dispatch、外部不进 undo、用户编辑仍可 undo；只读/disabled 切换后不丢组合文本，不抢焦点。
- UTF-16 fixed-seed、view.state.selection、合成 composition 事件或 happy-dom 都不能被改称原生 IME/真实 DOM Selection 已通过；Playwright keyboard.insertText 也不等原生输入法。
- Tab/Shift+Tab 与 indentWithTab 开关、label/labelledBy/describedBy 清空、屏幕阅读器、ShadowRoot/SSR、长文档滚动/重复挂载的真实证据分开。现有 app editor E2E 仅初值/挂载，Angular 多一条颜色断言。

## 独立 consumer

- 主控已经实际 pack、检查declared entries并新consumer root解析23/23，editor4齐全；Angular publish root是 dist/packages/code-editor-angular。
- 尚未做 declaration compilation 或 runtime import。独立strict TS / Angular template / React props / Vue SFC consumer 编译与挂载，依赖必须来自tarball非工作区alias；只加载SQL的bundle、缺语言chunk失败/错误回调另验。

## Extension / mini-program

- Extension现两条E2E仅v2正向协商/none零帧；DevTools API shim和localhost静态host权限两个variance明示。不证明wrong frame/tab/session、实际provider mutation拒绝、optional授权UI、真实DevTools宿主或Electron/Tauri。
- 小程序DevTools仅专用project/USER_DATA_PATH运行；不要接个人GUI自动清库。reLaunch是页面重进，不等完整进程/真机crash重启；安全随机指纹只验池耐久，不证明密码学熵质量。

## 收口纪律

以上必要证据未到时相关C保持部分/未核销；已充分的纯函数/竞态/生命周期子项独立核销。对象评审候选不等所有C通过，更不等修复/发布就绪。晚到的两个bounded probe和app tests由主控补结果；本轮不空转等待。
