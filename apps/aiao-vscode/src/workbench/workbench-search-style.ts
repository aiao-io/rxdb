/** 搜索视图样式：输入行、匹配开关、按文件分组的结果与命中高亮，配色对齐 VS Code Dark Modern。 */
export const workbenchSearchStyle = `
.wb-search{display:flex;flex-direction:column;height:100%;min-height:0;background:#181818}
.wb-search-input{display:flex;align-items:center;gap:4px;margin:8px 8px 0;padding:0 6px;background:#313131;border:1px solid #454545;border-radius:3px;min-height:26px}
.wb-search-input>.codicon{color:#9d9d9d;font-size:14px}
.wb-search-input input{flex:1;min-width:0;background:transparent;border:0;padding:3px 2px;font-size:12px}
.wb-search-input input:focus{outline:none}
.wb-search-clear{padding:2px;width:20px;height:20px;color:#9d9d9d}
.wb-search-flags{display:flex;gap:2px}
.wb-search-flags button{padding:2px;width:20px;height:20px;color:#9d9d9d}
.wb-search-flags button[aria-pressed=true]{background:#04395e;color:#fff}
.wb-search-replace{display:flex;align-items:center;gap:4px;margin:4px 8px 0;padding:0 6px;background:#313131;border:1px solid #454545;border-radius:3px;min-height:26px}
.wb-search-replace>.codicon{color:#9d9d9d;font-size:14px}
.wb-search-replace input{flex:1;min-width:0;background:transparent;border:0;padding:3px 2px;font-size:12px}
.wb-search-replace input:focus{outline:none}
.wb-search-replace-all{padding:2px;width:20px;height:20px;color:#9d9d9d}
.wb-search-status{padding:10px 20px;color:#6e6e6e;font-size:12px;margin:0}
.wb-search-status.wb-search-error{color:#f48771}
.wb-search-results{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 0}
.wb-search-group-header{display:flex;align-items:center;gap:6px;height:22px;padding:0 8px;font-size:12px;color:#ccc;white-space:nowrap}
.wb-search-group-header:hover{background:#2a2d2e}
.wb-search-group-toggle{padding:0;width:16px;height:16px;color:#b7b7b7;flex:none}
.wb-search-group-toggle>.codicon{font-size:14px}
.wb-search-group-header>.codicon:not(.wb-search-group-toggle>.codicon){font-size:15px}
.wb-search-group-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-search-group-count{flex:none;min-width:18px;text-align:center;font-size:11px;padding:1px 5px;border-radius:10px;background:#404040;color:#ccc}
.wb-search-file-replace{display:none;margin-left:auto;flex:none;padding:2px;width:20px;height:20px;color:#9d9d9d}
.wb-search-group-header:hover .wb-search-file-replace,.wb-search-file-replace:focus-visible{display:inline-flex}
.wb-search-group-list{padding-left:20px;min-width:0}
.wb-search-match{display:flex!important;width:100%;height:20px;align-items:center;justify-content:flex-start!important;gap:8px;border-radius:0!important;padding:0 8px 0 4px!important;text-align:left;font:12px/1 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap}
.wb-search-match:hover{background:#2a2d2e}
.wb-search-match:focus-visible{outline:none!important;background:#062f4a}
.wb-search-line{flex:none;min-width:28px;text-align:right;color:#858585}
.wb-search-content{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-search-match-highlight{background:#613214;color:#fff;padding:0;margin:0}
@media(pointer:coarse){.wb-search-input,.wb-search-replace{min-height:36px}.wb-search-flags button,.wb-search-clear,.wb-search-replace-all,.wb-search-file-replace{width:30px;height:30px}.wb-search-group-header{height:34px}.wb-search-match{height:34px}}
`;
