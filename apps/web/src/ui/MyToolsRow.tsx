// "My tools": accepted tools appended to the right as labeled buttons.
// Tooltip lists the steps; right-click removes. The row exists from the
// start (empty) so the layout never moves.

import { useState } from 'react';
import { describeSteps, type ToolDef } from '@aw/core';
import { useStore } from '../state/store';

function ToolButton({ tool }: { tool: ToolDef }) {
  const runTool = useStore((s) => s.runTool);
  const removeTool = useStore((s) => s.removeTool);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const steps = describeSteps(tool.steps);
  const tooltip = `${tool.summary}\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n(right-click to remove)`;

  const run = () => {
    const parsed: Record<string, unknown> = {};
    for (const p of tool.exposedParams) {
      const raw = inputs[p.param];
      if (raw === undefined || raw === '') parsed[p.param] = p.default;
      else parsed[p.param] = Number.isNaN(Number(raw)) ? raw : Number(raw);
    }
    runTool(tool, parsed);
  };

  if (confirmRemove) {
    return (
      <span className="aw-tool aw-tool-confirm">
        Remove “{tool.label}”?
        <button onClick={() => removeTool(tool.id)}>Remove</button>
        <button onClick={() => setConfirmRemove(false)}>Keep</button>
      </span>
    );
  }

  return (
    <span className="aw-tool" data-tool-id={tool.id}>
      {tool.exposedParams.map((p) => (
        <input
          key={p.param}
          className="aw-tool-input"
          title={p.friendly_name}
          placeholder={String(p.default)}
          value={inputs[p.param] ?? ''}
          onChange={(e) => setInputs({ ...inputs, [p.param]: e.target.value })}
        />
      ))}
      <button
        className="aw-tool-btn"
        title={tooltip}
        onClick={run}
        onContextMenu={(e) => {
          e.preventDefault();
          setConfirmRemove(true);
        }}
      >
        ⚡ {tool.label}
      </button>
    </span>
  );
}

export function MyToolsRow() {
  const tools = useStore((s) => s.tools);
  return (
    <div className="aw-mytools" id="aw-mytools">
      <span className="aw-mytools-label">My tools</span>
      {tools.length === 0 ? (
        <span className="aw-mytools-empty">— none yet —</span>
      ) : (
        tools.map((t) => <ToolButton key={t.id} tool={t} />)
      )}
    </div>
  );
}
