// Webcam gaze via WebGazer (bundled, runs fully locally). Treated as coarse:
// AOI-level analysis only. Samples are logged at whatever rate WebGazer
// provides, on the same performance.now() clock as everything else.

import type { Logger } from '../logging/logger';

type WebgazerModule = {
  default: {
    setGazeListener: (fn: (data: { x: number; y: number } | null, ts: number) => void) => unknown;
    begin: () => Promise<unknown>;
    end: () => void;
    showVideoPreview: (b: boolean) => unknown;
    showPredictionPoints: (b: boolean) => unknown;
    pause: () => void;
    resume: () => void;
  };
};

let wg: WebgazerModule['default'] | null = null;

export async function startWebgazerCalibration(logger: Logger | null): Promise<void> {
  const mod = (await import('webgazer')) as unknown as WebgazerModule;
  wg = mod.default;
  wg.showVideoPreview(true);
  wg.showPredictionPoints(true);
  wg.setGazeListener((data) => {
    if (data && logger) {
      logger.log({ kind: 'gaze', x: Math.round(data.x), y: Math.round(data.y) });
    }
  });
  await wg.begin();
}

/** After calibration: hide the debug UI, keep sampling. */
export function webgazerStudyMode(): void {
  wg?.showVideoPreview(false);
  wg?.showPredictionPoints(false);
}

export function stopWebgazer(): void {
  try {
    wg?.end();
  } catch {
    /* already stopped */
  }
  wg = null;
}
