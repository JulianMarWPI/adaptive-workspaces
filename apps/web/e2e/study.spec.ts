// End-to-end: a scripted participant cleans 3 sheets by hand in the
// proactive condition, a proposal card appears, the script accepts it, uses
// the tool on sheet 4 (which has shuffled columns), and we assert the sheet
// is correct and the log contains the expected events in order.

import { expect, test, type Page } from '@playwright/test';

/** Click a body cell of the grid. nth-child: 1 = row header, 2 = first col. */
async function clickCell(page: Page, row: number, col: number, modifiers: ('Shift')[] = []) {
  const sel = `#aw-grid .ht_master tbody tr:nth-child(${row + 1}) td:nth-child(${col + 2})`;
  await page.locator(sel).first().click({ modifiers, force: true });
}

/** The 6-step cleanup on the current sheet, via toolbar only. */
async function cleanSheet(page: Page, amountCol: number, dateCol: number, qtyCol: number) {
  await page.getByRole('button', { name: 'Delete empty rows' }).click();
  await page.getByRole('button', { name: 'Bold header' }).click();
  await page.getByRole('button', { name: 'Freeze header' }).click();
  // Format Amount as currency (select a cell in the column first)
  await clickCell(page, 2, amountCol);
  await page.getByRole('button', { name: '$ Currency' }).click();
  // Format Date as date
  await clickCell(page, 2, dateCol);
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  // Total row under Amount and Qty (multi-column selection via shift-click)
  await clickCell(page, 2, Math.min(amountCol, qtyCol));
  await clickCell(page, 2, Math.max(amountCol, qtyCol), ['Shift']);
  await page.getByRole('button', { name: 'Σ Total row' }).click();
}

interface SheetSnapshot {
  name: string;
  data: (string | number | null)[][];
  columnFormats: Record<number, string>;
  frozenRows: number;
  rowStyles: Record<number, { bold?: boolean }>;
}

async function getSheet(page: Page, index: number): Promise<SheetSnapshot> {
  return page.evaluate((i) => {
    const st = (window as never as { __aw: { getState: () => { sheets: SheetSnapshot[] } } }).__aw.getState();
    return JSON.parse(JSON.stringify(st.sheets[i])) as SheetSnapshot;
  }, index);
}

test('proactive flow: mine, propose, accept, reuse on a shuffled sheet', async ({ page }) => {
  await page.goto('/demo');

  // Demo starts in practice; move straight to the task block (proactive, workbook A).
  await page.locator('#aw-start-task').click();
  await expect(page.locator('#aw-assistant')).toBeVisible();

  // Sheets Jan..Mar have normal column order: Date(0) Customer(1) Amount(2) Qty(3)
  await cleanSheet(page, 2, 0, 3); // Jan
  await page.getByRole('button', { name: 'Feb' }).click();
  await cleanSheet(page, 2, 0, 3); // Feb
  await page.getByRole('button', { name: 'Mar' }).click();
  await cleanSheet(page, 2, 0, 3); // Mar

  // After the 3rd occurrence completes (3 s idle), the card must appear.
  const card = page.locator('#aw-card');
  await expect(card).toBeVisible({ timeout: 30_000 });

  // Inspect the steps, then accept.
  await card.getByRole('button', { name: /Show steps/ }).click();
  await expect(card.locator('.aw-card-steps li')).toHaveCount(6);
  await card.getByRole('button', { name: 'Add button' }).click();

  // The tool is on the My tools row.
  const toolBtn = page.locator('#aw-mytools .aw-tool-btn');
  await expect(toolBtn).toHaveCount(1);

  // Sheet 4 (Apr) has SHUFFLED columns: Amount(0) Date(1) Qty(2) Customer(3).
  await page.getByRole('button', { name: 'Apr' }).click();
  await toolBtn.click();

  // --- Assert the sheet is correct ---
  const apr = await getSheet(page, 3);
  const headers = apr.data[0];
  expect(headers).toEqual(['Amount', 'Date', 'Qty', 'Customer']);
  // no empty rows remain
  for (const row of apr.data) {
    expect(row.some((c) => c !== null && String(c).trim() !== '')).toBe(true);
  }
  // header bold + frozen
  expect(apr.rowStyles[0]?.bold).toBe(true);
  expect(apr.frozenRows).toBe(1);
  // currency on Amount (col 0 here), date on Date (col 1): re-targeted by header
  expect(apr.columnFormats[0]).toBe('currency');
  expect(apr.columnFormats[1]).toBe('date');
  // total row with SUM formulas under Amount (A) and Qty (C)
  const last = apr.data[apr.data.length - 1];
  expect(String(last[0])).toMatch(/^=SUM\(A2:A\d+\)$/);
  expect(String(last[2])).toMatch(/^=SUM\(C2:C\d+\)$/);

  // --- Assert the log contains the expected events in order ---
  const events = await page.evaluate(() => {
    const st = (window as never as {
      __aw: { getState: () => { logger: { events: { kind: string; event?: string; source?: string; cmd?: string }[] } } };
    }).__aw.getState();
    return st.logger.events.map((e) => ({ kind: e.kind, event: e.event, source: e.source, cmd: e.cmd }));
  });

  const seq = events
    .filter(
      (e) =>
        (e.kind === 'assistant' &&
          ['proposal_shown', 'proposal_expanded', 'accepted', 'tool_used'].includes(e.event ?? '')) ||
        (e.kind === 'command' && e.source === 'tool'),
    )
    .map((e) => (e.kind === 'assistant' ? e.event : `tool:${e.cmd}`));

  expect(seq).toEqual([
    'proposal_shown',
    'proposal_expanded',
    'accepted',
    'tool:deleteEmptyRows',
    'tool:setRowStyle',
    'tool:freezeRows',
    'tool:setNumberFormat',
    'tool:setNumberFormat',
    'tool:insertTotalRow',
    'tool_used',
  ]);

  // Manual cleanup produced 18 manual commands before the proposal.
  const manualCmds = events.filter((e) => e.kind === 'command' && e.source === 'manual');
  expect(manualCmds.length).toBe(18);
  // AOI layout snapshots were logged (session start + card/tool changes).
  const layouts = events.filter((e) => e.kind === 'layout');
  expect(layouts.length).toBeGreaterThanOrEqual(2);
});
