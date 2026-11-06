/** 终端面板沿用工作台的暗色、滚动与焦点样式。 */
export const terminalViewStyle = `
.wb-terminal .wb-terminal-content{padding:4px 12px 8px;overflow:hidden;box-sizing:border-box}
.wb-terminal-instance{height:100%;width:100%}
.wb-terminal-screen{flex:1;min-height:0;min-width:0;overflow:hidden;background:#181818;box-sizing:border-box}
.wb-terminal-screen .xterm{height:100%;width:100%}
.wb-terminal-screen .xterm-viewport{background-color:#181818!important}
.wb-terminal-screen .xterm-screen{outline:none}
.wb-terminal-screen .xterm-scrollable-element>.scrollbar>.slider{background:#79797966}
.wb-terminal-screen .xterm-scrollable-element>.scrollbar>.slider:hover{background:#646464b3}
`;
