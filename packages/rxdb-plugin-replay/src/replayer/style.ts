/**
 * 回放器的内联样式。
 *
 * @remarks
 * 颜色都走 `--rxdb-replayer-*` 变量，宿主在任一祖先上覆盖即可换肤；默认值在浅色 / 深色下都满足 WCAG AA 对比度。
 * `.replayer-wrapper` / `.replayer-mouse` 是 rrweb `Replayer` 自己生成的节点，这里只给最少的定位样式，不依赖 rrweb 的样式表。
 */
export const REPLAYER_STYLE = `
.rxdb-replayer {
  --rxdb-replayer-fg: var(--rxdb-replayer-fg-override, #1f2328);
  --rxdb-replayer-bg: var(--rxdb-replayer-bg-override, #ffffff);
  --rxdb-replayer-muted: var(--rxdb-replayer-muted-override, #59636e);
  --rxdb-replayer-accent: var(--rxdb-replayer-accent-override, #0550ae);
  --rxdb-replayer-border: var(--rxdb-replayer-border-override, #d1d9e0);
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--rxdb-replayer-fg);
  background: var(--rxdb-replayer-bg);
  font: 14px/1.4 system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .rxdb-replayer {
    --rxdb-replayer-fg: var(--rxdb-replayer-fg-override, #f0f6fc);
    --rxdb-replayer-bg: var(--rxdb-replayer-bg-override, #0d1117);
    --rxdb-replayer-muted: var(--rxdb-replayer-muted-override, #9198a1);
    --rxdb-replayer-accent: var(--rxdb-replayer-accent-override, #4493f8);
    --rxdb-replayer-border: var(--rxdb-replayer-border-override, #3d444d);
  }
}
.rxdb-replayer__stage {
  position: relative;
  overflow: auto;
  border: 1px solid var(--rxdb-replayer-border);
}
.rxdb-replayer__stage .replayer-wrapper {
  position: relative;
}
.rxdb-replayer__stage .replayer-wrapper > iframe {
  border: 0;
  pointer-events: none;
}
.rxdb-replayer__stage .replayer-mouse {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--rxdb-replayer-accent);
  pointer-events: none;
}
.rxdb-replayer__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rxdb-replayer__timeline {
  flex: 1;
  accent-color: var(--rxdb-replayer-accent);
}
.rxdb-replayer button {
  color: inherit;
  background: transparent;
  border: 1px solid var(--rxdb-replayer-border);
  border-radius: 4px;
  padding: 2px 8px;
  font: inherit;
  cursor: pointer;
}
.rxdb-replayer button:focus-visible,
.rxdb-replayer__timeline:focus-visible {
  outline: 2px solid var(--rxdb-replayer-accent);
  outline-offset: 2px;
}
.rxdb-replayer__commits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rxdb-replayer__status,
.rxdb-replayer__empty {
  margin: 0;
  color: var(--rxdb-replayer-muted);
}
.rxdb-replayer__error {
  color: var(--rxdb-replayer-fg);
}
`;
