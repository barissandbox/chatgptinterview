export function createAssistantOverlayStyles(overlayId: string): string {
  return `
#${overlayId} {
  position: fixed;
  right: 18px;
  top: 18px;
  z-index: 2147483647;
  display: none;
  width: min(496px, calc(100vw - 32px));
  min-width: 360px;
  height: min(680px, calc(100vh - 36px));
  max-height: calc(100vh - 36px);
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 8px;
  background: #f8fafc;
  color: #111827;
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.24);
  font-family: Inter, Segoe UI, system-ui, sans-serif;
  font-size: 9px;
}
#${overlayId}.is-visible { display: flex; flex-direction: column; }
html.civ-sidepanel,
html.civ-sidepanel body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #f8fafc;
}
html.civ-sidepanel #${overlayId} {
  position: fixed;
  inset: 0;
  width: 100%;
  min-width: 0;
  height: 100vh;
  max-height: 100vh;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
#${overlayId} [hidden] { display: none !important; }
#${overlayId} * { box-sizing: border-box; letter-spacing: 0; }
#${overlayId} button,
#${overlayId} select,
#${overlayId} input {
  height: 24px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #172033;
  font: inherit;
  font-size: 9px;
  font-weight: 600;
}
#${overlayId} input {
  min-width: 0;
  padding: 0 7px;
}
#${overlayId} button { cursor: pointer; }
#${overlayId} button:hover:not(:disabled) { background: #eef2f7; }
#${overlayId} button:disabled { cursor: default; opacity: 0.55; }
#${overlayId} .civ-controls,
#${overlayId} .civ-panel-head {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  background: #ffffff;
}
#${overlayId} .civ-status,
#${overlayId} .civ-controls {
  flex: 0 0 auto;
}
#${overlayId} .civ-controls { flex-wrap: nowrap; }
#${overlayId} .civ-panel-head {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
#${overlayId} .civ-controls button { padding: 0 6px; }
#${overlayId} .civ-control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
#${overlayId} .civ-control-group { display: flex; flex: 1 1 auto; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
#${overlayId} .civ-control-group button { flex: 0 0 auto; }
#${overlayId} .civ-settings-row { align-items: center; }
#${overlayId} .civ-settings-left {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px 86px;
  flex: 1 1 auto;
  gap: 6px;
  min-width: 0;
}
#${overlayId} .civ-settings-left select { width: 100%; min-width: 0; }
#${overlayId} .civ-session-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
#${overlayId} .civ-session-actions button { flex: 0 0 auto; }
#${overlayId} .civ-primary { min-width: 48px; background: #0f766e; border-color: #0f766e; color: #fff; }
#${overlayId} .civ-primary:hover:not(:disabled) { background: #115e59; }
#${overlayId} .civ-status {
  min-height: 22px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  color: #475569;
  background: #f1f5f9;
}
#${overlayId} .civ-status.is-error { color: #991b1b; background: #fff1f2; }
#${overlayId} .is-active { border-color: #0f766e; background: #ecfdf5; color: #065f46; }
#${overlayId} .civ-body {
  display: grid;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  grid-template-rows: var(--civ-transcript-height, 136px) 8px minmax(0, 1fr);
}
#${overlayId} .civ-body.is-transcript-only {
  grid-template-rows: minmax(0, 1fr);
}
#${overlayId} .civ-panel,
#${overlayId} .civ-answer-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
#${overlayId} .civ-panel { height: 100%; }
#${overlayId} .civ-divider {
  position: relative;
  height: 8px;
  border-top: 1px solid rgba(15, 23, 42, 0.1);
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  background: #f1f5f9;
  cursor: row-resize;
  touch-action: none;
}
#${overlayId} .civ-divider::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 42px;
  height: 2px;
  border-radius: 999px;
  background: #94a3b8;
  transform: translate(-50%, -50%);
}
#${overlayId} .civ-divider:hover,
#${overlayId} .civ-divider.is-dragging {
  background: #e2e8f0;
}
#${overlayId} .civ-answer-panel {
  overflow: hidden;
  background: #fff;
}
#${overlayId} .civ-panel-head { height: 42px; padding: 8px 10px; font-weight: 700; }
#${overlayId} .civ-small { width: auto; height: 26px; padding: 0 10px; font-size: 12px; }
#${overlayId} .civ-live { max-width: 320px; overflow: hidden; color: #64748b; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
#${overlayId} .civ-transcript {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.48;
  background: #fff;
}
#${overlayId} .civ-question-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 6px;
  align-items: stretch;
  padding: 5px 7px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
}
#${overlayId} .civ-question-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}
#${overlayId} .civ-question-button {
  height: 22px;
  min-width: 22px;
  padding: 0 5px;
  font-size: 9px;
}
#${overlayId} .civ-media-button {
  width: 28px;
  min-width: 28px;
  padding: 0;
  font-family: "Segoe UI Symbol", "Apple Symbols", system-ui, sans-serif;
  font-size: 12px;
  line-height: 1;
}
#${overlayId} .civ-question {
  min-height: 28px;
  max-height: 64px;
  overflow: auto;
  padding: 5px 7px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 6px;
  background: #f8fafc;
  color: #334155;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
#${overlayId} .civ-question-count {
  align-self: center;
  color: #64748b;
  font-size: 9px;
  font-weight: 650;
  white-space: nowrap;
}
#${overlayId} .civ-answer-text {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 12px 20px;
  border-top: 0;
  color: #111827;
  font-size: 13px;
  line-height: 1.5;
  white-space: normal;
  overflow-wrap: anywhere;
}
#${overlayId} .civ-answer-text p,
#${overlayId} .civ-answer-text ul,
#${overlayId} .civ-answer-text ol,
#${overlayId} .civ-answer-text h3,
#${overlayId} .civ-answer-text h4 {
  margin: 0 0 10px;
}
#${overlayId} .civ-answer-text ul,
#${overlayId} .civ-answer-text ol {
  padding-left: 20px;
}
#${overlayId} .civ-answer-text li {
  margin: 0 0 6px;
}
#${overlayId} .civ-answer-text p {
  white-space: pre-wrap;
}
#${overlayId} .civ-answer-text h3,
#${overlayId} .civ-answer-text h4 {
  color: #0f172a;
  font-size: 14px;
  line-height: 1.35;
}
#${overlayId} .civ-answer-text code {
  padding: 1px 4px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #0f172a;
  font-family: Consolas, Menlo, monospace;
  font-size: 12px;
}
#${overlayId} .civ-empty { color: #64748b; }
@media (max-width: 720px) {
  #${overlayId} { inset: 8px; width: auto; min-width: 0; height: calc(100vh - 16px); max-height: calc(100vh - 16px); }
  #${overlayId} .civ-body { grid-template-rows: var(--civ-transcript-height, 128px) 8px minmax(0, 1fr); }
  #${overlayId} .civ-body.is-transcript-only { grid-template-rows: minmax(0, 1fr); }
  #${overlayId} .civ-answer-text { max-height: none; }
}
  `;
}
