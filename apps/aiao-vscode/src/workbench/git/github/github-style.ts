const githubStyle = `
.wb-github-list{display:flex;flex-direction:column;gap:2px;max-height:280px;overflow:auto;margin:8px 0}
.wb-github-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:6px 8px;border-radius:3px;background:transparent;border:0;text-align:left;cursor:pointer}
.wb-github-item:hover{background:#ffffff12}
.wb-github-item.wb-github-selected{background:#04395e;color:#fff}
.wb-github-item-name{font-size:13px}
.wb-github-item-detail{font-size:11px;color:#9d9d9d;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.wb-github-item.wb-github-selected .wb-github-item-detail{color:#ccc}
.wb-github-message{font-size:12px;margin:8px 0}
.wb-github-hint{color:#9d9d9d}
.wb-github-error{color:#f48771}
.wb-github-back{align-self:flex-start;margin-top:6px;background:transparent;border:0;color:#75beff;padding:4px 0;cursor:pointer}
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

let injected = false;

/** 首次使用时把 GitHub 选择器与登录对话框的样式注入 document；幂等。 */
export function ensureGithubStyle(): void {
  if (injected || document.head.querySelector('style[data-github-style]')) return;
  const style = document.createElement('style');
  style.dataset['githubStyle'] = '';
  style.textContent = githubStyle;
  document.head.append(style);
  injected = true;
}
