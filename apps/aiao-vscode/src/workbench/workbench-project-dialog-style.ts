export const workbenchProjectDialogStyle = `
.wb-dialog.wb-project-dialog{width:min(600px,calc(100vw - 32px));min-width:0;max-width:none;max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--wb-menu-border);border-radius:12px;background:var(--wb-editor);box-shadow:0 24px 80px #0008;overflow:hidden}
.wb-project-dialog::backdrop{background:#0008;backdrop-filter:blur(3px)}
.wb-project-dialog form{display:flex;flex-direction:column;gap:0;max-height:calc(100dvh - 34px)}
.wb-project-dialog-header{position:relative;flex:none;padding:24px 28px 20px;border-bottom:1px solid var(--wb-line)}
.wb-project-dialog h3{padding-right:28px;font-size:20px;font-weight:600;text-transform:none;color:#f0f0f0}
.wb-project-dialog-header p{margin:8px 0 0;color:var(--wb-muted);font-size:13px;line-height:1.6}
.wb-project-dialog .wb-project-close{position:absolute;top:18px;right:18px;width:30px;height:30px;padding:0;background:transparent;color:var(--wb-muted)}
.wb-project-dialog .wb-project-close:hover{background:var(--wb-hover);color:var(--wb-text)}
.wb-project-dialog-body{padding:22px 28px 24px;overflow-y:auto;min-height:0}
.wb-project-dialog fieldset{min-width:0;margin:0;padding:0;border:0}
.wb-project-dialog legend{margin-bottom:12px;padding:0;font-size:12px;color:var(--wb-muted)}
.wb-project-template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.wb-project-dialog .wb-project-template{position:relative;display:grid;grid-template-columns:34px 1fr 16px;align-items:center;gap:10px;min-width:0;min-height:82px;padding:14px 12px;border:1px solid var(--wb-input-border);border-radius:7px;background:transparent;cursor:pointer;transition:background .12s,border-color .12s}
.wb-project-template:hover{background:var(--wb-hover);border-color:#666}
.wb-project-template:has(:checked){border-color:#75beff;background:#75beff0d;box-shadow:inset 0 0 0 1px #75beff}
.wb-project-template:focus-within{outline:2px solid #75beff;outline-offset:3px}
.wb-project-template input{position:absolute;width:1px;height:1px;opacity:0;margin:0;padding:0;border:0}
.wb-project-template .wb-project-template-icon{font-size:34px;line-height:1;width:34px;text-align:center}
.wb-project-template .wb-project-angular-icon{width:27px;height:30px;margin:auto;background:linear-gradient(140deg,#ed3155,#b42add);color:white;clip-path:polygon(50% 0,100% 18%,89% 81%,50% 100%,11% 81%,0 18%);font:600 22px/30px sans-serif}
.wb-project-template-text{display:grid;gap:5px;min-width:0}
.wb-project-template-text strong{color:#ededed;font-size:14px;font-weight:500}
.wb-project-template-text>span{color:var(--wb-muted);font-size:11px;line-height:1.5}
.wb-project-template-check{visibility:hidden;color:#75beff}
.wb-project-template:has(:checked) .wb-project-template-check{visibility:visible}
.wb-project-dialog .wb-project-field{margin-top:24px;gap:9px;font-size:12px;color:var(--wb-text)}
.wb-project-field input{width:100%;height:40px;background:var(--wb-input);border-color:var(--wb-input-border);border-radius:5px;font-size:14px}
.wb-project-field input[aria-invalid=true]{border-color:#f48771}
.wb-project-field-hint{margin:9px 0 0;color:var(--wb-muted);font-size:12px;line-height:1.6}
.wb-project-field-hint[data-error=true]{color:#f48771}
.wb-project-dialog-actions{flex:none;padding:16px 28px;border-top:1px solid var(--wb-line);background:var(--wb-bg)}
.wb-project-dialog-actions button{min-width:76px;min-height:34px;border-radius:5px}
.wb-project-dialog-actions .wb-primary:not(:disabled):hover{background:var(--wb-blue-hover)!important}
@media(max-width:440px){.wb-dialog.wb-project-dialog{width:calc(100vw - 24px)}.wb-project-dialog-header{padding:20px}.wb-project-dialog-body{padding:20px}.wb-project-template-grid{grid-template-columns:1fr}.wb-project-dialog .wb-project-template{min-height:64px;padding:10px 12px}.wb-project-dialog-actions{padding:14px 20px}}
@media(prefers-reduced-motion:reduce){.wb-project-template{transition:none}}
`;
