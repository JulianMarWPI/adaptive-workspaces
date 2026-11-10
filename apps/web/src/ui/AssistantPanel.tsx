// Assistant panel (right, ~25%): proposal cards and — in the prompted
// condition — the "Ask for a tool" box. Never a modal, never steals focus.
// A small dot on the header signals a new card.

import { useState, type ReactNode } from 'react';
import { describeSteps } from '@aw/core';
import { useStore } from '../state/store';

function ProposalCardView() {
  const card = useStore((s) => s.card);
  const expandCard = useStore((s) => s.expandCard);
  const acceptCard = useStore((s) => s.acceptCard);
  const dismissCard = useStore((s) => s.dismissCard);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  if (!card) return null;
  const steps = describeSteps(card.pattern.steps);

  if (editing) {
    return (
      <div className="aw-card" id="aw-card" data-card-key={card.key}>
        <div className="aw-card-label">Edit tool</div>
        <label className="aw-card-field">
          Name
          <input value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {card.exposedInputs.length > 0 && (
          <div className="aw-card-field">
            Ask me each time for:
            {card.exposedInputs.map((inp) => (
              <label key={inp.param} className="aw-card-check">
                <input
                  type="checkbox"
                  checked={enabled[inp.param] ?? true}
                  onChange={(e) => setEnabled({ ...enabled, [inp.param]: e.target.checked })}
                />
                {inp.friendly_name}
              </label>
            ))}
          </div>
        )}
        <div className="aw-card-actions">
          <button
            className="aw-primary"
            onClick={() =>
              acceptCard(
                label.trim() || card.label,
                card.exposedInputs.filter((i) => enabled[i.param] ?? true).map((i) => i.param),
              )
            }
          >
            Add button
          </button>
          <button onClick={() => setEditing(false)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="aw-card" id="aw-card" data-card-key={card.key}>
      <div className="aw-card-label">{card.label}</div>
      <div className="aw-card-text">{card.cardText}</div>
      <button className="aw-card-expander" onClick={expandCard} aria-expanded={card.expanded}>
        {card.expanded ? '▾ Steps' : '▸ Show steps'}
      </button>
      {card.expanded && (
        <ol className="aw-card-steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      <div className="aw-card-actions">
        <button className="aw-primary" onClick={() => acceptCard()}>Add button</button>
        <button
          onClick={() => {
            setLabel(card.label);
            setEnabled(Object.fromEntries(card.exposedInputs.map((i) => [i.param, true])));
            setEditing(true);
          }}
        >
          Edit
        </button>
        <button onClick={() => dismissCard('not_now')}>Not now</button>
        <button className="aw-quiet" onClick={() => dismissCard('never')}>Don't suggest this</button>
      </div>
    </div>
  );
}

function PromptBox() {
  const submitPrompt = useStore((s) => s.submitPrompt);
  const busy = useStore((s) => s.promptBusy);
  const [text, setText] = useState('');
  return (
    <div className="aw-promptbox" id="aw-promptbox">
      <div className="aw-panel-sub">Ask for a tool</div>
      <textarea
        rows={3}
        placeholder={'e.g. "button that removes empty rows and sorts by date"'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      <button
        className="aw-primary"
        disabled={busy || !text.trim()}
        onClick={async () => {
          await submitPrompt(text);
          setText('');
        }}
      >
        {busy ? 'Building…' : 'Create tool'}
      </button>
    </div>
  );
}

/** Distinct sheets the user has touched with a manual command in this block. */
function sheetsWorkedThisBlock(): string[] {
  const { logger, blockIndex } = useStore.getState();
  if (!logger) return [];
  const start = logger.events.findIndex(
    (e) => e.kind === 'session' && e.event === 'block_start' && e.block === blockIndex + 1,
  );
  const seen: string[] = [];
  for (const e of logger.events.slice(start === -1 ? 0 : start)) {
    if (e.kind === 'command' && e.source === 'manual' && !e.failed && e.sheet && !seen.includes(e.sheet)) {
      seen.push(e.sheet);
    }
  }
  return seen;
}

function DemoExplainer() {
  // gridVersion bumps on every command, so this recomputes as the user works.
  const gridVersion = useStore((s) => s.gridVersion);
  void gridVersion;
  const worked = sheetsWorkedThisBlock();

  let nudge: ReactNode;
  if (worked.length === 0) {
    nudge = <>Start with the <strong>Jan</strong> sheet — clean it with the toolbar (select, then click each tool).</>;
  } else if (worked.length === 1) {
    nudge = (
      <>
        You've cleaned <strong>{worked[0]}</strong>. Now open another month tab (e.g.{' '}
        <strong>Feb</strong>) and clean it the same way — <strong>that second sheet is
        what lets me spot the repeat and offer a one-click button.</strong>
      </>
    );
  } else {
    nudge = <>Two sheets done — a suggestion should appear here any moment (or after a short pause).</>;
  }

  return (
    <div className="aw-demo-note" id="aw-demo-note">
      <div>
        <strong>What to watch for.</strong> Cleaning each sheet by hand means deleting
        its blank rows one by one and then repeating the same aimed formatting steps on
        every month. The assistant watches for that repeated formatting and offers to
        turn it into one button — which also re-targets the columns on sheets where
        they're in a different order. (Row deletion stays yours: it needs a human eye.)
      </div>
      <div className="aw-demo-nudge" id="aw-demo-nudge">{nudge}</div>
    </div>
  );
}

export function AssistantPanel() {
  const cond = useStore((s) => s.cond);
  const phase = useStore((s) => s.phase);
  const card = useStore((s) => s.card);
  const panelDot = useStore((s) => s.panelDot);
  const demo = useStore((s) => s.config?.demo ?? false);

  // In the default condition there is no assistant panel at all.
  if (cond === 'default' && phase === 'task') return null;

  return (
    <aside className="aw-assistant" id="aw-assistant">
      <div className="aw-panel-header">
        Assistant
        {panelDot && <span className="aw-dot" title="New suggestion" />}
      </div>
      {cond === 'proactive' && (card ? <ProposalCardView /> : (
        <div className="aw-panel-idle">
          Suggestions will appear here while you work.
          {demo && <DemoExplainer />}
        </div>
      ))}
      {cond === 'prompted' && <PromptBox />}
    </aside>
  );
}
