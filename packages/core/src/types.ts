// Shared types for Adaptive Workspaces core.
// The core is pure TypeScript: no DOM, no Handsontable. The web app mirrors
// SheetState into Handsontable; the server and tests use it directly.

export type CellValue = string | number | null;

/** Column reference. Always stored with both index and header text so tools
 * can re-target a column by header when column order differs between sheets. */
export interface ColRef {
  index: number;
  header: string;
}

export type NumberFormat = 'currency' | 'percent' | 'date' | 'integer';
export type Align = 'left' | 'center' | 'right';
export type SortDirection = 'asc' | 'desc';

export interface RowStyle {
  bold?: boolean;
  fill?: string; // CSS color
}

/** Pure model of one sheet. Row 0 is the header row. Formula cells are
 * strings starting with '='. */
export interface SheetState {
  name: string;
  data: CellValue[][];
  columnWidths: Record<number, number>;
  frozenRows: number;
  rowStyles: Record<number, RowStyle>;
  columnFormats: Record<number, NumberFormat>;
  columnAligns: Record<number, Align>;
}

export type CommandSource = 'manual' | 'tool' | 'prompt';

export type Command =
  | { cmd: 'deleteEmptyRows'; args: { sheet: string } }
  | { cmd: 'setRowStyle'; args: { row: number; bold?: boolean; fill?: string } }
  | { cmd: 'freezeRows'; args: { count: number } }
  | { cmd: 'setColumnWidth'; args: { column: ColRef; width: number } }
  | { cmd: 'autoFitColumns'; args: { columns: ColRef[] } }
  | { cmd: 'setNumberFormat'; args: { column: ColRef; format: NumberFormat } }
  | { cmd: 'setAlignment'; args: { column: ColRef; align: Align } }
  | { cmd: 'insertTotalRow'; args: { columns: ColRef[] } }
  | { cmd: 'sortBy'; args: { column: ColRef; direction: SortDirection } }
  | { cmd: 'renameSheet'; args: { name: string } }
  | { cmd: 'setCellValue'; args: { row: number; column: ColRef; value: CellValue } };

export type CommandName = Command['cmd'];

/** One line of the session log (JSONL). */
export interface LogEvent {
  t: number; // performance.now() ms
  wall: string; // ISO time
  pid: string;
  session: string;
  cond: 'default' | 'proactive' | 'prompted';
  block: number;
  kind:
    | 'command'
    | 'undo'
    | 'redo'
    | 'sheet_switch'
    | 'assistant'
    | 'layout'
    | 'gaze'
    | 'session';
  source?: CommandSource;
  sheet?: string;
  cmd?: CommandName;
  args?: Record<string, unknown>;
  /** Context captured at dispatch time, used by normalization
   * (e.g. rowCount lets us abstract "last row"). */
  ctx?: { rowCount?: number };
  event?: string; // for kind: assistant / session
  [key: string]: unknown;
}

/** How a generalized tool step binds one argument. */
export type Binding =
  | { kind: 'constant'; value: unknown }
  | { kind: 'currentSheet' }
  | { kind: 'lastRow' }
  | { kind: 'columnByHeader'; header: string }
  | { kind: 'columnsByHeader'; headers: string[] }
  | { kind: 'input'; param: string; default: unknown };

export interface GeneralizedStep {
  cmd: CommandName;
  args: Record<string, Binding>;
}

export interface GeneralizedPattern {
  id: string;
  steps: GeneralizedStep[];
  support: number;
  /** Params the user may edit when the tool runs (kind: 'input' bindings). */
  exposedParams: { param: string; default: unknown }[];
}

/** An accepted one-click tool on the "My tools" row. */
export interface ToolDef {
  id: string;
  label: string;
  summary: string;
  steps: GeneralizedStep[];
  exposedParams: { param: string; friendly_name: string; default: unknown }[];
  origin: 'mined' | 'prompted';
}
