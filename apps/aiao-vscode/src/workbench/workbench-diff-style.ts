/** 双栏差异与来源说明的独立样式。 */
export const workbenchDiffStyle = `
.wb-diff{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;color:#ccc;background:#1f1f1f;font:12px system-ui,-apple-system,sans-serif}
.wb-diff-header{display:flex;align-items:center;gap:8px;min-height:34px;padding:6px 12px;background:#181818;border-bottom:1px solid #303030;flex:none}
.wb-diff-header>.codicon{font-size:16px;color:#a9b3c2}.wb-diff-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-diff-readonly{margin-left:auto;color:#999;white-space:nowrap;font-size:11px}
.wb-diff-origins{display:flex;flex:none;border-bottom:1px solid #303030;background:#202020}.wb-diff-origin{width:50%;min-width:0;padding:6px 12px;line-height:1.6}.wb-diff-origin+ .wb-diff-origin{border-left:1px solid #383838}.wb-diff-origin strong{margin-right:10px;font-weight:500}.wb-diff-origin small{color:#aaa;font-size:11px}
.wb-diff-notice{padding:5px 12px;background:#302b1e;color:#d7bd7b;border-bottom:1px solid #4c4029;flex:none;font-size:11px}.wb-diff-language{padding:4px 12px;color:#969696;font-size:11px;flex:none}.wb-diff-language[role=alert]{padding:12px;color:#f48771}
.wb-diff-body{min-height:0;min-width:0;flex:1;overflow:hidden}.wb-diff .cm-mergeView{height:100%;min-height:0;overflow:hidden}.wb-diff .cm-mergeViewEditor{height:100%;min-height:0;min-width:0}.wb-diff .cm-editor{height:100%;min-height:0;background:#1f1f1f;color:#d4d4d4}.wb-diff .cm-scroller{overflow:auto;font:13px/20px ui-monospace,SFMono-Regular,Consolas,monospace}.wb-diff .cm-gutters{background:#1f1f1f;color:#858585;border:0}.wb-diff .cm-content{cursor:text}.wb-diff .cm-mergeViewEditor+ .cm-mergeViewEditor{border-left:1px solid #383838}
.wb-diff .cm-editor.cm-merge-a .cm-changedLine,.wb-diff .cm-editor.cm-merge-a .cm-changedLineGutter{background:#ff000033}.wb-diff .cm-editor.cm-merge-b .cm-changedLine,.wb-diff .cm-editor.cm-merge-b .cm-changedLineGutter{background:#9bb95533}
.wb-diff .cm-editor.cm-merge-a .cm-changedText{background:#ff000033}.wb-diff .cm-editor.cm-merge-b .cm-changedText{background:#9ccc2c33}.wb-diff .cm-changedText,.wb-diff .cm-insertedLine,.wb-diff .cm-deletedLine{text-decoration:none}
.wb-diff .cm-editor .cm-changeGutter{width:14px;padding:0}.wb-diff .cm-changedLineGutter{color:#d4d4d4;text-align:center}.wb-diff .cm-merge-a .cm-changedLineGutter:before{content:'−'}.wb-diff .cm-merge-b .cm-changedLineGutter:before{content:'+'}
.wb-diff .cm-mergeSpacer{background:repeating-linear-gradient(135deg,transparent 0 3px,#cccccc33 3px 4px)}
.wb-diff-binary{display:flex;overflow:auto}.wb-diff-binary-side{width:50%;min-width:0;padding:24px;color:#a0a0a0;white-space:pre-wrap}.wb-diff-binary-side+ .wb-diff-binary-side{border-left:1px solid #383838}
`;
