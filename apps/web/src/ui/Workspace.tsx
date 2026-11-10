// The three fixed regions: spreadsheet (left ~75%), My tools row under the
// toolbar, assistant panel (right ~25%). Nothing ever moves.

import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { Toolbar } from './Toolbar';
import { MyToolsRow } from './MyToolsRow';
import { AssistantPanel } from './AssistantPanel';
import { SheetGrid } from '../grid/SheetGrid';
import { SheetTabs } from './SheetTabs';
import { TASK_INSTRUCTIONS } from '../tasks/workbooks';

export function Workspace() {
  const phase = useStore((s) => s.phase);
  const cond = useStore((s) => s.cond);
  const blockIndex = useStore((s) => s.blockIndex);
  const config = useStore((s) => s.config);
  const toolMessage = useStore((s) => s.toolMessage);
  const clearToolMessage = useStore((s) => s.clearToolMessage);
  const endBlock = useStore((s) => s.endBlock);
  const beginBlock = useStore((s) => s.beginBlock);
  const maybePropose = useStore((s) => s.maybePropose);
  const practice = phase === 'practice';

  // Auto-dismiss inline messages after a few seconds.
  useEffect(() => {
    if (!toolMessage) return;
    const id = window.setTimeout(clearToolMessage, 6000);
    return () => window.clearTimeout(id);
  }, [toolMessage, clearToolMessage]);

  // 3 s idle after the last manual command: an occurrence may have completed.
  const idleTimer = useRef<number | null>(null);
  const lastManualAt = useStore((s) => s.lastManualAt);
  useEffect(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (lastManualAt === 0) return;
    idleTimer.current = window.setTimeout(() => {
      const st = useStore.getState();
      if (!st.idleEvaluated) {
        useStore.setState({ idleEvaluated: true });
        maybePropose('idle');
      }
    }, 3000);
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [lastManualAt, maybePropose]);

  return (
    <div className="aw-root">
      <div className="aw-appbar">
        <span className="aw-appname">Workbook</span>
        <span className="aw-instructions">
          {practice
            ? 'Practice (2 min): get a feel for the toolbar. Each tool acts on your selection — click a cell or drag to select, then click a tool (e.g. select the header row, then Bold row).'
            : TASK_INSTRUCTIONS}
        </span>
        {practice ? (
          <button className="aw-primary" onClick={() => beginBlock(0)} id="aw-start-task">
            Start task →
          </button>
        ) : (
          <button className="aw-primary" onClick={endBlock} id="aw-finish-block"
            title="Finish this block when all sheets are done">
            Done with block {blockIndex + 1}
            {config ? `/${config.condOrder.length}` : ''}
          </button>
        )}
      </div>
      <Toolbar />
      <MyToolsRow />
      {toolMessage && (
        <div className="aw-inline-msg" role="status" id="aw-message">
          {toolMessage}
          <button onClick={clearToolMessage} aria-label="dismiss">×</button>
        </div>
      )}
      <div className="aw-main">
        <div className={`aw-gridwrap${cond === 'default' && !practice ? ' aw-fullwidth' : ''}`}>
          <SheetGrid />
          <SheetTabs />
        </div>
        {!practice && <AssistantPanel />}
      </div>
    </div>
  );
}
