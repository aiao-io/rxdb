/** Quick Open 与命令面板独立于编辑器和 Dockview 的样式。 */
export const workbenchCommandsStyle = `
.wb-quick-input{position:fixed;z-index:20000;transform:translateX(-50%);max-width:calc(100vw - 24px);background:#252526;color:#ccc;border:1px solid #454545;border-radius:6px;box-shadow:0 12px 36px #0009;padding:8px 6px 6px;font:13px system-ui,-apple-system,sans-serif}
.wb-quick-input-box{display:flex;align-items:center;gap:7px;margin:0 2px 7px;padding:0 8px;background:#313131;border:1px solid #3c3c3c;border-radius:3px}
.wb-quick-input-box>.codicon{color:#a8a8a8;font-size:16px;flex:none}
.wb-quick-input input{display:block;min-width:0;width:100%;height:30px;padding:3px 0;background:none;border:0;outline:0;color:#f0f0f0;font:inherit}
.wb-quick-input input:focus{outline:none}
.wb-quick-input input::placeholder{color:#a0a0a0}
.wb-quick-input-list{max-height:340px;overflow:auto;scrollbar-width:thin}
.wb-quick-input [role=option]{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:4px 8px;border:0;border-radius:3px;background:none;color:inherit;text-align:left;font:inherit;cursor:pointer}
.wb-quick-input [role=option]:hover{background:#2a2d2e}
.wb-quick-input [role=option][aria-selected=true]{background:#04395e;color:#fff;outline:1px solid #007fd4;outline-offset:-1px}
.wb-quick-input [role=option]>.codicon{flex:none;color:#b2bdc9;font-size:16px}
.wb-quick-input [role=option]>.codicon[data-language=typescript]{color:#519aba}
.wb-quick-input [role=option]>.codicon[data-language=javascript]{color:#cbcb41}
.wb-quick-input [role=option]>.codicon[data-language=react]{color:#61dafb}
.wb-quick-input [role=option]>.codicon[data-language=vue]{color:#41b883}
.wb-quick-input-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-quick-input-label mark,.wb-quick-input-description mark{background:none;color:#4fc1ff}
.wb-quick-input-description{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a0a0a0;font-size:12px;flex:1}
.wb-quick-input kbd{margin-left:auto;flex:none;white-space:nowrap;padding:1px 5px;background:#ffffff0a;border:1px solid #6666;border-radius:3px;color:#bdbdbd;font:11px system-ui,sans-serif}
.wb-quick-input-status{padding:5px 8px 1px;color:#9d9d9d;font-size:11px}
@media(pointer:coarse){.wb-quick-input [role=option]{min-height:42px}.wb-quick-input input{height:36px}}
`;
