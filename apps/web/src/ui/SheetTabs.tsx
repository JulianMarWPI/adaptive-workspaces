// Sheet tabs at the bottom of the grid. Double-click the active tab to
// rename (renameSheet command).

import { useState } from 'react';
import { useStore } from '../state/store';

export function SheetTabs() {
  const sheets = useStore((s) => s.sheets);
  const active = useStore((s) => s.active);
  const switchSheet = useStore((s) => s.switchSheet);
  const dispatch = useStore((s) => s.dispatch);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="aw-tabs" id="aw-tabs">
      {sheets.map((s, i) =>
        renaming && i === active ? (
          <input
            key={i}
            className="aw-tab-rename"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = name.trim();
                if (v && v !== s.name) dispatch({ cmd: 'renameSheet', args: { name: v } }, 'manual');
                setRenaming(false);
              }
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button
            key={i}
            className={`aw-tab${i === active ? ' aw-tab-active' : ''}`}
            onClick={() => switchSheet(i)}
            onDoubleClick={() => {
              if (i === active) {
                setName(s.name);
                setRenaming(true);
              }
            }}
            title={i === active ? 'Double-click to rename' : s.name}
          >
            {s.name}
          </button>
        ),
      )}
    </div>
  );
}
