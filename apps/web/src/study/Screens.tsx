// Participant-facing screens: consent, calibration, practice banner,
// NASA-TLX, and the end screen.

import { useState } from 'react';
import { useStore } from '../state/store';
import { startWebgazerCalibration } from '../sensing/webgazer';

export function ConsentScreen() {
  const giveConsent = useStore((s) => s.giveConsent);
  const config = useStore((s) => s.config);
  const [interaction, setInteraction] = useState(false);
  const [eye, setEye] = useState(false);
  const [eeg, setEeg] = useState(false);
  const sensingOn = config?.sensing !== 'none';

  return (
    <div className="aw-screen">
      <h1>Consent</h1>
      <p>
        You are taking part in a study about spreadsheet work (WPI CS 546). You will clean up
        a few small spreadsheets. Everything is recorded locally on this laptop only, under a
        participant code — never your name. You can stop at any time.
      </p>
      <p>Please tick each data stream you agree to:</p>
      <label className="aw-consent-line">
        <input type="checkbox" checked={interaction} onChange={(e) => setInteraction(e.target.checked)} />
        Interaction log (clicks, edits, timing) — required to take part
      </label>
      {sensingOn && (
        <label className="aw-consent-line">
          <input type="checkbox" checked={eye} onChange={(e) => setEye(e.target.checked)} />
          Eye tracking ({config?.sensing === 'lab' ? 'lab eye tracker' : 'webcam, processed locally'})
        </label>
      )}
      {config?.sensing === 'lab' && (
        <label className="aw-consent-line">
          <input type="checkbox" checked={eeg} onChange={(e) => setEeg(e.target.checked)} />
          EEG (recorded by the lab software)
        </label>
      )}
      <button
        className="aw-primary aw-big"
        disabled={!interaction}
        onClick={() => giveConsent({ interaction, eye, eeg })}
      >
        I agree — continue
      </button>
    </div>
  );
}

const CAL_POINTS: [number, number][] = [
  [10, 10], [50, 10], [90, 10],
  [10, 50], [50, 50], [90, 50],
  [10, 90], [50, 90], [90, 90],
];
const CLICKS_PER_POINT = 3;

export function CalibrationScreen() {
  const finishCalibration = useStore((s) => s.finishCalibration);
  const config = useStore((s) => s.config);
  const logger = useStore((s) => s.logger);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [clicks, setClicks] = useState(0);

  if (config?.sensing === 'lab') {
    // Lab eye tracker calibrates in its own software; we only mark the moment.
    return (
      <div className="aw-screen">
        <h1>Calibration</h1>
        <p>Calibrate the lab eye tracker now. The app has sent sync markers to the LSL stream.</p>
        <button className="aw-primary aw-big" onClick={finishCalibration}>Calibration done — continue</button>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="aw-screen">
        <h1>Eye-tracking calibration</h1>
        <p>You will see 9 dots. Look at each dot and click it {CLICKS_PER_POINT} times.</p>
        <button
          className="aw-primary aw-big"
          onClick={async () => {
            await startWebgazerCalibration(logger);
            setStarted(true);
            logger?.log({ kind: 'session', event: 'calibration_start' });
          }}
        >
          Start
        </button>
        <button onClick={finishCalibration}>Skip (no eye tracking)</button>
      </div>
    );
  }

  const [x, y] = CAL_POINTS[idx];
  return (
    <div className="aw-screen aw-cal">
      <button
        className="aw-cal-dot"
        style={{ left: `${x}%`, top: `${y}%`, opacity: 0.4 + 0.2 * clicks }}
        onClick={() => {
          logger?.log({ kind: 'session', event: 'calibration_click', point: idx, x, y });
          if (clicks + 1 >= CLICKS_PER_POINT) {
            if (idx + 1 >= CAL_POINTS.length) {
              finishCalibration();
            } else {
              setIdx(idx + 1);
              setClicks(0);
            }
          } else {
            setClicks(clicks + 1);
          }
        }}
      />
      <p className="aw-cal-hint">Dot {idx + 1} of {CAL_POINTS.length}</p>
    </div>
  );
}

const TLX_SCALES: { key: string; label: string; lo: string; hi: string }[] = [
  { key: 'mental', label: 'Mental demand', lo: 'Very low', hi: 'Very high' },
  { key: 'physical', label: 'Physical demand', lo: 'Very low', hi: 'Very high' },
  { key: 'temporal', label: 'Temporal demand', lo: 'Very low', hi: 'Very high' },
  { key: 'performance', label: 'Performance', lo: 'Perfect', hi: 'Failure' },
  { key: 'effort', label: 'Effort', lo: 'Very low', hi: 'Very high' },
  { key: 'frustration', label: 'Frustration', lo: 'Very low', hi: 'Very high' },
];

export function TlxScreen() {
  const submitTlx = useStore((s) => s.submitTlx);
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(TLX_SCALES.map((s) => [s.key, 50])),
  );
  return (
    <div className="aw-screen">
      <h1>How was that block?</h1>
      <p>Move each slider to match your experience (NASA-TLX).</p>
      {TLX_SCALES.map((s) => (
        <div key={s.key} className="aw-tlx-row">
          <div className="aw-tlx-label">{s.label}</div>
          <div className="aw-tlx-slider">
            <span>{s.lo}</span>
            <input
              type="range" min={0} max={100} step={5}
              value={values[s.key]}
              onChange={(e) => setValues({ ...values, [s.key]: Number(e.target.value) })}
            />
            <span>{s.hi}</span>
          </div>
        </div>
      ))}
      <button className="aw-primary aw-big" onClick={() => submitTlx(values)}>Continue</button>
    </div>
  );
}

export function EndScreen() {
  const logger = useStore((s) => s.logger);
  return (
    <div className="aw-screen">
      <h1>All done — thank you!</h1>
      <p>Please let the researcher know you have finished.</p>
      <button onClick={() => logger?.exportJsonl()}>Export session log (researcher)</button>{' '}
      <button onClick={() => window.location.assign('/setup')}>Back to setup</button>
    </div>
  );
}
