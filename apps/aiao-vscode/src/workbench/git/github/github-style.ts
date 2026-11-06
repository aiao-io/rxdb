import { workbenchCommandsStyle } from '../../workbench-commands-style.js';

const githubStyle = `
${workbenchCommandsStyle}
.wb-github-picker.wb-dialog{inset:auto;margin:0;min-width:0;max-width:calc(100vw - 24px);max-height:calc(100vh - 60px);overflow:hidden;padding:5px 6px 6px;background:var(--wb-menu,#252526);border:1px solid var(--wb-menu-border,#454545);color:var(--wb-text,#ccc);border-radius:6px;box-shadow:0 12px 36px #0009}
.wb-github-picker.wb-dialog::backdrop{background:transparent}
.wb-github-picker-title{display:flex;align-items:center;gap:5px;height:25px;margin-bottom:5px;padding:0 2px;color:var(--wb-muted,#9d9d9d);font-size:12px}
.wb-github-picker-heading{flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-github-picker .wb-github-picker-title button:not([hidden]){display:inline-flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;padding:0;border:0;border-radius:3px;background:transparent;color:var(--wb-text,#ccc);cursor:pointer}
.wb-github-picker .wb-github-picker-title button:hover{background:var(--wb-hover,#2a2d2e)}
.wb-github-picker .wb-quick-input-box{background:var(--wb-input,#313131);border-color:var(--wb-focus,#0078d4);border-radius:2px;margin:0 2px 6px;padding:0 8px}
.wb-github-picker .wb-quick-input-box input{height:28px;padding:3px 0;border:0;background:transparent;color:var(--wb-text,#ccc);font:inherit;outline:none}
.wb-github-picker .wb-github-list{max-height:min(340px,60vh);margin:0;overflow:auto}
.wb-github-picker.wb-dialog .wb-github-item{display:flex;align-items:center;gap:7px;width:100%;min-height:28px;padding:4px 8px;border:0;border-radius:3px;background:transparent;color:var(--wb-text,#ccc);text-align:left;font:inherit;cursor:pointer}
.wb-github-picker.wb-dialog .wb-github-item:hover{background:var(--wb-hover,#2a2d2e)}
.wb-github-picker.wb-dialog .wb-github-item[aria-selected=true]{background:var(--wb-list-active,#04395e);color:#fff;outline:1px solid var(--wb-focus,#0078d4);outline-offset:-1px}
.wb-github-picker .wb-github-item>.codicon{flex:none;font-size:16px}
.wb-github-picker .wb-github-item-name{min-width:0;flex:none;max-width:100%;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-github-picker .wb-github-item-detail{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--wb-muted,#9d9d9d);font-size:12px}
.wb-github-picker .wb-github-message{margin:0;padding:5px 8px 1px;font-size:11px;color:var(--wb-muted,#9d9d9d)}
.wb-github-picker .wb-github-error{color:#f48771}
@media(pointer:coarse){.wb-github-picker.wb-dialog .wb-github-item{min-height:42px}.wb-github-picker .wb-quick-input-box input{height:36px}}
.wb-github-dialog{min-width:420px}
.wb-github-account{display:flex;align-items:center;gap:10px;padding:4px 0}
.wb-github-account img{width:26px;height:26px;border-radius:50%}
.wb-github-account-name{font-size:14px}
.wb-github-field{display:grid;gap:6px;margin:10px 0}
.wb-github-field label{display:grid;gap:6px;font-size:12px;color:#9d9d9d}
.wb-github-divider{display:flex;align-items:center;gap:10px;color:#747474;font-size:11px;margin:12px 0}
.wb-github-divider:before,.wb-github-divider:after{content:'';flex:1;height:1px;background:#454545}
.wb-github-waiting{display:flex;align-items:center;gap:8px;color:#9d9d9d;font-size:12px;padding:8px 0}
`;

/** 首次使用时把 GitHub 选择器与登录对话框的样式注入 document；幂等。 */
export function ensureGithubStyle(): void {
  if (document.head.querySelector('style[data-github-style]')) return;
  const style = document.createElement('style');
  style.dataset['githubStyle'] = '';
  style.textContent = githubStyle;
  document.head.append(style);
}
