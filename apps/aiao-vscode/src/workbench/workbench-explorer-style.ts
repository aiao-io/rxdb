/**
 * 侧栏容器与资源管理器样式，数值取自 vscode.dev（Dark Modern + modern UI）实测：
 * 标题栏 32px、区块头 28px、行高 22px、正文 13px、每级缩进 8px、行左右内缩 4px、控件圆角 4px。
 */
export const workbenchExplorerStyle = `
.wb-side{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--wb-bg);overflow:hidden}
.wb-side-header{display:flex;align-items:center;height:32px;padding:0 4px;flex:none}
.ao-workbench .wb-side-header h2{flex:1;min-width:0;margin:0;padding-left:8px;font-size:12px;font-weight:600;line-height:32px;text-transform:capitalize;color:var(--wb-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-side-actions{display:flex;align-items:center;height:32px;padding-left:4px}
.wb-side-actions button{width:22px;height:22px;padding:3px;border-radius:4px;color:var(--wb-text)}
.ao-workbench .wb-side-actions button:hover{background:var(--wb-toolbar-hover)}
.wb-tree,[data-slot=git-view],[data-slot=search-view]{flex:1;min-height:0;overflow:auto}
.wb-tree{position:relative;padding:0 0 8px;outline:none;font-size:13px;line-height:22px}
.wb-tree,.wb-scm,.wb-search-results{scrollbar-width:thin;scrollbar-color:#79797966 transparent}
.wb-pane{display:flex;flex-direction:column}
.wb-pane+.wb-pane>.wb-tree-section-row:before{content:"";position:absolute;top:0;left:4px;right:4px;height:1px;background:var(--wb-line);pointer-events:none}
.wb-tree-section-row{display:flex;align-items:center;position:relative;height:28px;margin:0 4px;border-radius:4px}
.ao-workbench .wb-tree-section-row:hover{background:var(--wb-hover)}
.ao-workbench .wb-tree-section{display:flex!important;flex:1;min-width:0;height:28px;align-items:center;justify-content:flex-start!important;border-radius:4px!important;padding:0 0 0 4px!important;gap:0!important;background:transparent!important;font-size:12px!important;font-weight:600;line-height:28px;color:var(--wb-text);text-transform:none;white-space:nowrap}
.wb-tree-section:hover{background:transparent!important}
.ao-workbench .wb-tree-section:focus-visible{outline:1px solid var(--wb-focus)!important;outline-offset:-2px}
.wb-tree-section>.codicon:first-child{width:16px;margin:0 2px;flex:none;font-size:16px;color:var(--wb-text)}
.wb-tree-section>span{overflow:hidden;text-overflow:ellipsis}
.wb-tree-section-actions{position:absolute;right:0;top:0;height:28px;display:flex;align-items:center;padding-right:4px;opacity:0}
.wb-pane:hover>.wb-tree-section-row>.wb-tree-section-actions,.wb-pane:focus-within>.wb-tree-section-row>.wb-tree-section-actions{opacity:1}
.ao-workbench .wb-tree-section-actions button{width:20px;height:20px;padding:2px;margin-right:4px;border-radius:4px}
.ao-workbench .wb-tree-section-actions button:last-child{margin-right:0}
.ao-workbench .wb-tree-section-actions button:hover{background:var(--wb-toolbar-hover)}
.ao-workbench .wb-file{position:relative;display:flex!important;align-items:center;justify-content:flex-start!important;width:calc(100% - 8px);height:22px;margin:0 4px;padding:0 0 0 calc(var(--wb-level,1)*8px)!important;gap:0!important;border-radius:4px!important;font-size:13px!important;line-height:22px;color:var(--wb-text);text-align:left;white-space:nowrap;overflow:hidden;cursor:pointer}
.ao-workbench .wb-file:hover{background:var(--wb-hover)}
.ao-workbench .wb-file[aria-current=true]{background:var(--wb-list-inactive)}
.ao-workbench .wb-tree:focus-within .wb-file[aria-current=true]{background:var(--wb-list-active);color:#fff!important}
.ao-workbench .wb-file:focus-visible{outline:1px solid var(--wb-focus)!important;outline-offset:-1px}
.ao-workbench .wb-file.wb-drop-into,.ao-workbench .wb-editor-open.wb-drop-into{background:var(--wb-drop)!important}
.ao-workbench .wb-tree.wb-root-drop{background:var(--wb-drop)}
.wb-guides{position:absolute;inset:0;pointer-events:none}
.wb-guide{position:absolute;top:0;bottom:0;border-left:1px solid transparent}
.wb-tree:hover .wb-guide,.wb-tree:focus-within .wb-guide{border-color:var(--wb-guide-inactive)}
.wb-tree:hover .wb-guide.active,.wb-tree:focus-within .wb-guide.active{border-color:var(--wb-guide)}
.wb-twistie{flex:none;display:flex;align-items:center;justify-content:center;width:16px;height:22px;margin-right:6px;transform:translateX(3px);font-size:16px;color:inherit}
.wb-seti{flex:none;display:inline-block;width:16px;height:22px;margin-right:6px;font:normal 19.5px/22px seti;-webkit-font-smoothing:antialiased;text-align:left;vertical-align:top}
.wb-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}
.wb-label-sep{margin:0 2px;opacity:.5}
.wb-file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}
.wb-file .wb-file-status{flex:none;margin:0 8px 0 5px;font-size:11px;font-weight:600;line-height:22px;text-align:center;opacity:.75;font-family:inherit}
.ao-workbench .wb-tree:focus-within .wb-file[aria-current=true] .wb-file-status{color:inherit}
.wb-file[data-status=M],.wb-file[data-status=M] .wb-file-status{color:var(--wb-git-modified)}
.wb-file[data-status=A],.wb-file[data-status=A] .wb-file-status{color:var(--wb-git-added)}
.wb-file[data-status=R],.wb-file[data-status=R] .wb-file-status,.wb-file[data-status=U],.wb-file[data-status=U] .wb-file-status{color:var(--wb-git-untracked)}
.wb-file[data-status=D],.wb-file[data-status=D] .wb-file-status{color:var(--wb-git-deleted)}
.wb-input-row{position:relative;display:flex;align-items:center;height:22px;margin:0 4px;padding:0 0 0 calc(var(--wb-level,1)*8px)}
.wb-input-row>.wb-seti{margin-right:6px}
.wb-input-row>.wb-twistie{visibility:hidden}
.ao-workbench .wb-tree .wb-inline-input{display:block;flex:1;min-width:0;height:22px;padding:0 4px;background:var(--wb-input);border:1px solid var(--wb-input-border);border-radius:4px;color:var(--wb-text);font-size:13px;line-height:20px;outline:1px solid var(--wb-focus);outline-offset:-1px}
.ao-workbench .wb-tree .wb-inline-input[aria-invalid=true]{outline-color:var(--wb-error)}
.wb-input-validation{position:absolute;z-index:5;top:22px;left:calc(var(--wb-level,1)*8px + 22px);right:0;padding:3px 6px;border:1px solid var(--wb-error);border-top:0;border-radius:0 0 4px 4px;background:#5a1d1d;color:#fff;font-size:12px;line-height:16px}
.wb-editor-row{position:relative;display:flex;align-items:center;height:22px;margin:0 4px;border-radius:4px}
.ao-workbench .wb-editor-row:hover{background:var(--wb-hover)}
.ao-workbench .wb-editor-open{display:flex!important;flex:1;min-width:0;height:22px;align-items:center;justify-content:flex-start!important;border-radius:4px!important;padding:0 0 0 22px!important;gap:0!important;background:transparent!important;font-size:13px!important;line-height:22px;text-align:left;white-space:nowrap}
.ao-workbench .wb-editor-open:focus-visible{outline:1px solid var(--wb-focus)!important;outline-offset:-1px}
.wb-editor-name{overflow:hidden;text-overflow:ellipsis}
.ao-workbench .wb-editor-row-close{position:absolute;left:2px;top:3px;padding:2px;width:16px;height:16px;opacity:0;border-radius:4px}
.wb-editor-row:hover .wb-editor-row-close,.wb-editor-row:focus-within .wb-editor-row-close{opacity:1}
.wb-empty-view{display:flex;flex-direction:column;align-items:center;padding:0 20px 13px;font-size:13px;line-height:18.2px;color:var(--wb-text)}
.wb-empty-view>*{width:100%;max-width:300px}
.wb-empty-view-hint{margin:13px 0 0}.wb-empty-view-storage{margin:8px 0 0;color:var(--wb-muted);font-size:12px;line-height:1.5}
.ao-workbench .wb-empty-view-action{display:flex!important;align-items:center;justify-content:center!important;gap:0!important;height:26px;margin-top:13px;padding:4px 8px;border:1px solid var(--wb-button-border);border-radius:4px!important;background:var(--wb-blue)!important;color:#fff!important;font-size:12px!important;line-height:16px}
.ao-workbench .wb-empty-view-action:hover{background:var(--wb-blue-hover)!important}
.wb-empty-view-recent{display:flex;flex-direction:column;margin-top:13px}
.wb-empty-view-recent-header{padding:0 0 4px;font-size:12px;font-weight:600;color:var(--wb-text)}
.ao-workbench .wb-empty-view-recent-item{display:flex!important;align-items:center;justify-content:flex-start!important;gap:6px!important;width:100%;height:22px;border-radius:4px!important;background:transparent!important;color:var(--wb-text)!important;font-size:13px!important;text-align:left;overflow:hidden}
.ao-workbench .wb-empty-view-recent-item:hover{background:var(--wb-hover)!important}
.wb-empty-view-recent-item>.codicon{color:#b7b7b7;flex:none}
.wb-empty-view-recent-item>span:last-child{overflow:hidden;text-overflow:ellipsis}
.wb-context-menu{position:fixed;z-index:20001;display:flex;flex-direction:column;padding:4px 0;min-width:160px;background:var(--wb-menu);border:1px solid var(--wb-menu-border);border-radius:8px;box-shadow:0 2px 8px 2px #0000005c;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--wb-text)}
.ao-workbench .wb-context-menu button{position:relative;display:flex;align-items:center;justify-content:flex-start;width:calc(100% - 8px);height:24px;margin:0 4px;border:0;background:transparent;padding:0 26px;border-radius:6px;font:inherit;line-height:18px;color:inherit;text-align:left;cursor:pointer;white-space:nowrap}
.ao-workbench .wb-context-menu button:hover:not(:disabled),.ao-workbench .wb-context-menu button:focus-visible{background:var(--wb-blue);color:#fff;outline:none}
.ao-workbench .wb-context-menu button:disabled{opacity:.5;cursor:default}
.wb-menu-check{position:absolute;left:0;top:0;width:26px;height:24px;display:flex;align-items:center;justify-content:center;font-size:16px}
.wb-menu-label{flex:1;overflow:hidden;text-overflow:ellipsis}
.wb-menu-keybinding{margin-left:24px;opacity:.7;font-size:12px}
.wb-context-menu-sep{height:1px;margin:4px 8px;background:var(--wb-menu-border);flex:none}
@media(pointer:coarse){
.wb-file,.wb-editor-row,.ao-workbench .wb-editor-open{height:34px;line-height:34px}
.wb-seti,.wb-twistie{height:34px;line-height:34px}
.wb-tree-section-row,.ao-workbench .wb-tree-section{height:38px;line-height:38px}
.wb-tree-section-actions{height:38px;opacity:1}
.ao-workbench .wb-tree-section-actions button{width:30px;height:30px}
.wb-side-header{height:42px}
.wb-side-actions button{width:36px;height:36px}
.wb-empty-view-action{height:40px!important}
.wb-empty-view-recent-item{height:38px!important}
.ao-workbench .wb-context-menu button{height:42px}
.ao-workbench .wb-editor-row-close{opacity:1;width:26px;height:26px}
}
`;
