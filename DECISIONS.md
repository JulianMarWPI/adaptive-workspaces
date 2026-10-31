# Decisions

Choices made during implementation that the build instructions did not fix.

## Core

- **Undo inverses are state snapshots.** Every `applyCommand` returns a deep
  snapshot of the prior sheet as its inverse. Study sheets are < 100 rows, so
  a snapshot is cheap, always correct (no per-command inverse bugs), and
  trivially testable. The undo stack lives in memory per session.
- **Sheet model is pure state** (`SheetState`): values (formulas as `=...`
  strings), column widths, frozen rows, row styles, column formats/alignments.
  Handsontable renders it; HyperFormula computes formulas at render time. The
  checker compares formula *strings*, not computed values, so a correct total
  row is recognized regardless of the data.
- **`resolveCol` prefers the stored index only when its header still matches**,
  otherwise it searches by header text and throws a `CommandError` if the
  header does not exist. This is what makes tools work on shuffled-column
  sheets even when an argument generalized to a constant `{index, header}`.
- **`autoFitColumns` is deterministic**: width = clamp(60, 8·maxLen+16, 300)
  from cell text length, identical in core and UI, so targets are reproducible.
- **`insertTotalRow`** labels the row "Total" in column 0 (unless column 0 is
  itself totaled), styles it bold, and sums rows 2..lastDataRow (A1 terms).
- **`sortBy` after structural changes** drops non-header row styles (they no
  longer track their rows). Sorting a sheet that already has a total row will
  move the total row; the task order never requires this, and the rollback in
  the executor protects tool runs.
- **Normalization context**: dispatch logs `ctx.rowCount` with every command so
  a row index equal to `rowCount-1` can be abstracted to `last` (e.g. styling
  the total row). Without `ctx`, row indices stay literal.
- **Undo semantics in normalization**: an `undo` event drops the most recent
  surviving command; a new command clears the redo stack (standard editor
  semantics).
- **Miner support counts episodes, not occurrences**: a sequence appearing
  twice inside one sheet-episode counts once, per the "once per episode" rule.
  The generalizer uses the first occurrence from each supporting episode.
- **Pattern keys** are a stable hash of the token sequence, so "Not now" /
  "Don't suggest this" survive re-mining within the session.

## Server / LLM

- **Summary keyword check**: each command declares *distinctive* keywords
  (e.g. `freeze`, `currency`, `sort`); generic spreadsheet words (`sheet`,
  `row`, `column`, `format`, …) are whitelisted and never treated as a
  mention of a missing operation. Coarse by design; it only needs to catch
  summaries that clearly describe operations not in the pattern.
- **Connection failures skip the retry**: if the first Ollama call fails at
  the network level, we go straight to the deterministic fallback instead of
  waiting for a second timeout. Validation failures do retry once with the
  rejection reason appended.
- **Prompted-path hydration**: the LLM refers to columns by header string and
  `["*"]` for "all columns"; the server hydrates these to header-bound steps,
  so prompted tools also re-target columns by header on later sheets. Unknown
  headers are rejected with a friendly inline error.
- **`.env` is parsed by hand** (10 lines) rather than adding dotenv.
- The server binds 127.0.0.1 only, validates `pid`/`session` against
  `[A-Za-z0-9_-]{1,64}` (no path traversal), and CORS-allows only localhost
  origins.

## Web app

- **zustand** for state (one small, bundled dependency) instead of hand-rolled
  context; three students will maintain this and the store is one file.
- **Direct edits are cancelled and re-issued**: Handsontable `beforeChange`
  returns `false` and dispatches `setCellValue` commands instead, so there is
  exactly one mutation path. Numeric-looking input is stored as a number.
- **Toolbar column operations use the current selection**; with no selection
  they show an inline "Click a cell in the column first." message (logged as
  nothing — selection is never logged).
- **Freeze button toggles** (count 1 ↔ 0) so participants can recover.
- **Rename sheet** = double-click the active tab (inline input), like a real
  spreadsheet app; no modal.
- **Tool removal** uses a right-click → inline confirm swap on the button
  itself (no context-menu component, no modal).
- **Inline messages** (tool rollback, prompt errors) appear in a strip between
  My tools and the grid, visible in every condition, auto-dismissing after 6 s.
- **Mining scope is the current block** (manual commands only, from
  `block_start`), so tools never leak across conditions; My tools and the
  proposal policy reset at block start.
- **Demo mode** (`/demo`): PID `DEMO`, seeded workbooks, proactive then
  prompted block, no consent/calibration; same logging as a real session.
- **Workbook C** exists alongside A and B: the full study has three blocks, so
  a third seeded-equivalent workbook is needed for workbook counterbalancing.
  The pilot uses A/B only. Sheets 4 and 6 (Apr, Jun) have shuffled column
  order in every workbook, so header-based retargeting always matters after
  the pattern is typically learned on sheets 1–3.
- **Correctness scoring ignores column widths** (the spec's checker list is
  values, formats, frozen rows, total-row formulas); "fit columns" therefore
  does not affect the score. Header bold is checked via row styles.
- **The idle trigger** is a 3 s timer since the last *manual* command,
  evaluated at most once per quiet period; sheet switches also trigger
  evaluation. The miner never runs between rapid commands.
- **Proposal reservation**: `cardPendingKey` is set the moment the miner
  fires, so a second trigger cannot start a second LLM call while the first
  card is being generated (at most one open card).
- **Gaze samples** are logged at whatever rate WebGazer provides, unthrottled,
  with `Math.round`ed screen coordinates; analysis treats them as AOI-level.

## Bridge / analysis

- The bridge runs without `pylsl` (echo mode) so it can be tested off-lab;
  markers are compact JSON (`t`, `kind`, `detail`) — the full event stays in
  the JSONL log, keyed by the same `t`.
- Gaze dwell is approximated as sample count × median inter-sample interval;
  no fixation detection (webcam gaze is coarse; AOI-level only, per the spec).
- "Sheets remaining" at proposal time = 6 − sheets with any command so far.
- Analysis outputs four CSVs (summary/proposals/tlx/gaze) rather than packing
  everything into one file; `summary.csv` is the per-sheet table named in the
  spec.

## Testing

- The e2e test uses the demo route and asserts the exact ordered event
  sequence (`proposal_shown … accepted … tool:* … tool_used`) plus the state
  of the shuffled sheet (Apr) after a tool run.
- `eval:llm` / `eval:prompt` hit the real model and are run manually on the
  study laptop.
- **`think: false` is sent for reasoning models** (qwen3, deepseek-r1, …),
  gated by model name since Ollama rejects the flag on models without a
  thinking mode. Without it, qwen3:8b spent 10–30 s reasoning before each
  JSON reply and 68% of eval runs hit the 30 s timeout. With it
  (measured 2026-10-31, RTX 5070 8 GB, Ollama 0.40.13):
  - `eval:llm` (50 runs): **100% schema-valid first try, 0% fallback,
    1488 ms median** (targets: >95%, <5000 ms) — PASS.
  - `eval:prompt` (25 requests): **25/25 exact-match (100%), 567 ms median**.
