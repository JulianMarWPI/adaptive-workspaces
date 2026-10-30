// AOI logging: bounding rectangles of the grid, toolbar, My tools row,
// assistant panel, and any proposal card — logged at session start, on
// resize, and whenever the layout changes (card shown/hidden, tool added).

import type { Logger } from '../logging/logger';

const AOI_IDS = ['aw-grid', 'aw-toolbar', 'aw-mytools', 'aw-assistant', 'aw-tabs', 'aw-card', 'aw-promptbox'];

function snapshot(): Record<string, { x: number; y: number; w: number; h: number }> {
  const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const id of AOI_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    rects[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
  // Every open proposal card individually (there is at most one, but keep it general).
  document.querySelectorAll<HTMLElement>('[data-card-key]').forEach((el) => {
    const r = el.getBoundingClientRect();
    rects[`card:${el.dataset.cardKey}`] = {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  return rects;
}

export function startAoiLogging(logger: Logger): () => void {
  let last = '';
  let pending: number | null = null;

  const emit = (reason: string) => {
    const rects = snapshot();
    const key = JSON.stringify(rects);
    if (key === last) return;
    last = key;
    logger.log({ kind: 'layout', reason, rects });
  };

  const schedule = (reason: string) => {
    if (pending !== null) window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = null;
      emit(reason);
    }, 150);
  };

  emit('session_start');

  const onResize = () => schedule('window_resize');
  window.addEventListener('resize', onResize);

  const ro = new ResizeObserver(() => schedule('element_resize'));
  for (const id of AOI_IDS) {
    const el = document.getElementById(id);
    if (el) ro.observe(el);
  }

  // Cards appearing/disappearing and tools being added change the DOM.
  const mo = new MutationObserver(() => {
    schedule('layout_change');
    // newly-mounted AOI elements need observing too
    for (const id of AOI_IDS) {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.removeEventListener('resize', onResize);
    ro.disconnect();
    mo.disconnect();
    if (pending !== null) window.clearTimeout(pending);
  };
}
