export const workbenchSettingsStyle = `
.ao-workbench .wb-dialog.wb-settings-dialog{padding:0;width:min(80vw,1120px);height:min(74dvh,760px);min-width:0;max-width:calc(100vw - 16px);max-height:calc(100dvh - 24px);border:1px solid var(--wb-line);border-radius:8px;background:var(--wb-editor);color:var(--wb-text);box-shadow:0 12px 48px #0009;overflow:hidden}
.wb-settings-dialog::backdrop{background:#0006}
.ao-workbench .wb-settings-dialog.wb-settings-maximized{width:calc(100vw - 24px);height:calc(100dvh - 24px)}
.wb-settings-header{height:34px;display:flex;align-items:center;gap:3px;padding:0 8px 0 14px;background:var(--wb-bg);border-bottom:1px solid var(--wb-line)}
.wb-settings-title{display:flex;align-items:center;gap:8px;flex:1;font-size:12px;font-weight:600}
.ao-workbench .wb-settings-dialog .wb-settings-icon-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;padding:3px;border:0;border-radius:3px;background:transparent;color:var(--wb-text)}
.ao-workbench .wb-settings-dialog .wb-settings-icon-button:hover,.ao-workbench .wb-settings-dialog .wb-settings-icon-button[aria-pressed=true]{background:var(--wb-toolbar-hover)}
.ao-workbench .wb-settings-dialog .wb-settings-icon-button[aria-pressed=true]{color:#75beff}
.wb-settings-content{height:calc(100% - 34px);display:flex;flex-direction:column;padding:16px 24px 0;min-height:0}
.wb-settings-search{display:flex;align-items:center;gap:3px;height:28px;flex:none;padding:0 3px 0 8px;border:1px solid var(--wb-input-border);border-radius:2px;background:var(--wb-input)}
.wb-settings-search:focus-within{border-color:var(--wb-focus);outline:1px solid var(--wb-focus);outline-offset:-1px}
.ao-workbench .wb-settings-search input{flex:1;width:0;height:100%;padding:0;border:0;border-radius:0;outline:none;background:transparent;font-size:13px}
.wb-settings-search input::placeholder{color:var(--wb-muted)}
.wb-settings-search input::-webkit-search-cancel-button{display:none}
.wb-settings-count{flex:none;margin:0 7px;color:var(--wb-muted);font-size:11px;white-space:nowrap}
.wb-settings-scope{display:flex;align-items:center;gap:16px;height:42px;flex:none;padding-bottom:5px;font-size:13px}
.wb-settings-scope-active{padding:3px 8px;background:var(--wb-list-inactive);border-radius:3px;font-weight:600;color:#fff}
.wb-settings-save-hint{margin-left:auto;color:var(--wb-muted);font-size:11px}
.wb-settings-layout{display:flex;flex:1;min-height:0;min-width:0}
.wb-settings-navigation{width:176px;flex:none;overflow:auto;padding:7px 12px 16px 0;border-right:1px solid var(--wb-line)}
.ao-workbench .wb-settings-navigation button{display:flex;justify-content:space-between;gap:8px;width:100%;min-height:26px;padding:4px 10px;text-align:left;border-radius:0;background:transparent;color:var(--wb-text);font-size:13px;white-space:nowrap}
.ao-workbench .wb-settings-navigation button:hover{background:var(--wb-hover)}
.ao-workbench .wb-settings-navigation button[aria-current=true]{font-weight:600;color:#fff;background:var(--wb-list-inactive)}
.wb-settings-category-count{color:var(--wb-muted);font-size:11px;font-weight:400}
.wb-settings-body{flex:1;min-width:0;overflow-y:auto;scrollbar-gutter:stable;padding:0 8px 24px 28px;overscroll-behavior:contain}
.ao-workbench .wb-settings-heading{margin:0 0 8px;padding:4px 10px 0;font-size:26px;line-height:1.4;font-weight:600;text-transform:none;color:#eee}
.wb-setting-row{position:relative;padding:12px 32px 16px 10px;border-left:2px solid transparent;overflow-wrap:anywhere}
.wb-setting-row:hover,.wb-setting-row:focus-within{background:#ffffff04}
.wb-setting-row[data-modified=true]{border-left-color:#0c7d9d}
.ao-workbench .wb-settings-dialog .wb-setting-title{display:block;line-height:20px;font-size:13px;font-weight:600;margin:0 0 5px;cursor:pointer}
.wb-setting-category{color:var(--wb-muted)}
.wb-setting-value{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.ao-workbench .wb-settings-dialog .wb-setting-description{display:block;font-size:13px;font-weight:400;line-height:1.55;color:var(--wb-text);cursor:pointer}
.ao-workbench .wb-settings-dialog .wb-setting-value select{width:min(100%,320px);height:26px;padding:2px 7px;border:1px solid var(--wb-input-border);border-radius:2px;background:var(--wb-input);font-size:13px;outline:none}
.ao-workbench .wb-settings-dialog .wb-setting-value select:focus{outline:1px solid var(--wb-focus);outline-offset:-1px}
.wb-setting-value:has(input[type=checkbox]){flex-direction:row;align-items:flex-start;gap:9px}
.ao-workbench .wb-settings-dialog input[type=checkbox]{flex:none;width:18px;height:18px;margin:1px 0 0;padding:0;accent-color:var(--wb-focus);cursor:pointer}
.wb-setting-reset{position:absolute;right:5px;top:11px;opacity:0}
.wb-setting-row:hover .wb-setting-reset,.wb-setting-row:focus-within .wb-setting-reset{opacity:1}
.wb-settings-empty{padding:18px 10px;color:var(--wb-muted);line-height:1.6}
@media(max-width:700px){
.ao-workbench .wb-dialog.wb-settings-dialog{width:calc(100vw - 16px);height:86dvh}
.wb-settings-content{padding:12px 12px 0}
.wb-settings-layout{flex-direction:column}
.wb-settings-navigation{display:flex;gap:4px;width:100%;padding:0 0 10px;border:0;overflow-x:auto;flex:none}
.ao-workbench .wb-settings-navigation button{width:auto;flex:none;border-radius:3px;font-size:12px;padding:4px 8px}
.wb-settings-body{padding:0 0 16px}
.wb-settings-count{margin:0 3px;font-size:10px}
.wb-settings-save-hint{font-size:10px}
.ao-workbench .wb-settings-heading{font-size:22px}
}
@media(pointer:coarse){
.ao-workbench .wb-settings-dialog .wb-settings-icon-button{width:32px;height:32px}
.wb-settings-header{height:40px}
.wb-settings-content{height:calc(100% - 40px)}
.wb-settings-search{height:36px}
.ao-workbench .wb-settings-dialog .wb-setting-value select{height:34px}
.wb-setting-reset{opacity:1}
.ao-workbench .wb-settings-navigation button{min-height:36px}
}
`;
