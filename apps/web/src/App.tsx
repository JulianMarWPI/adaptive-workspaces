import { useEffect, useRef } from 'react';
import { useStore } from './state/store';
import { SetupScreen } from './study/SetupScreen';
import { CalibrationScreen, ConsentScreen, EndScreen, TlxScreen } from './study/Screens';
import { Workspace } from './ui/Workspace';
import { startAoiLogging } from './sensing/aoi';
import { connectBridge } from './sensing/bridge';
import { webgazerStudyMode } from './sensing/webgazer';
import { counterbalance } from './tasks/workbooks';

/** /demo: seeded, skips consent, click through the whole flow in minutes. */
function useDemoAutostart() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (window.location.pathname !== '/demo') return;
    started.current = true;
    const st = useStore.getState();
    if (st.config) return;
    st.startSession({
      pid: 'DEMO',
      session: `demo${Date.now().toString(36)}`,
      pilot: true,
      demo: true,
      K: 3,
      sensing: 'none',
      condOrder: ['proactive', 'prompted'],
      workbookOrder: ['A', 'B'],
      consent: { interaction: true, eye: false, eeg: false },
    });
  }, []);
}

export default function App() {
  const phase = useStore((s) => s.phase);
  const config = useStore((s) => s.config);
  const logger = useStore((s) => s.logger);
  useDemoAutostart();

  // Sensing hookup, once per session.
  useEffect(() => {
    if (!logger || !config) return;
    const stops: (() => void)[] = [];
    stops.push(startAoiLogging(logger));
    if (config.sensing === 'lab') stops.push(connectBridge(logger));
    return () => stops.forEach((f) => f());
  }, [logger, config]);

  // After calibration, hide the WebGazer debug UI.
  useEffect(() => {
    if (phase === 'practice' || phase === 'task') webgazerStudyMode();
  }, [phase]);

  void counterbalance; // (referenced by SetupScreen)

  switch (phase) {
    case 'setup':
      return <SetupScreen />;
    case 'consent':
      return <ConsentScreen />;
    case 'calibration':
      return <CalibrationScreen />;
    case 'practice':
    case 'task':
      return <Workspace />;
    case 'tlx':
      return <TlxScreen />;
    case 'end':
      return <EndScreen />;
  }
}
