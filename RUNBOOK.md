# Pilot session runbook (one page)

## Before the participant arrives (~10 min)

- [ ] Laptop on power, Wi-Fi can stay on (the app never leaves localhost).
- [ ] `ollama serve` running → `ollama list` shows `qwen3:8b`.
- [ ] `npm run dev` from the repo root; wait for both lines
      (server on 8787, web on 5173).
- [ ] Lab mode only: start LabRecorder / eye-tracker software, then
      `python bridge/lsl_bridge.py`; confirm the `AdaptiveWorkspaces` stream
      is visible in LabRecorder.
- [ ] Open `http://127.0.0.1:5173/setup`:
  - [ ] Server ✅ and Ollama ✅ in the status list. If Ollama shows ⚠️ the
        session still works, but cards use template text — note it in the log.
  - [ ] Enter participant ID (e.g. `P07`), study = Pilot, K = 3,
        sensing mode as planned.
  - [ ] Check the condition/workbook order matches the counterbalancing sheet.
- [ ] Close other windows; browser in full screen (F11); display scaling 100%.
- [ ] One dry click into `/demo` earlier in the day to warm the model
      (first LLM call loads the model into VRAM and is slow).

## During

- [ ] Participant reads and ticks consent (interaction log is required; eye /
      EEG each have their own checkbox).
- [ ] Sensing on: run calibration (9 dots × 3 clicks for webcam; lab tracker
      calibrates in its own software first).
- [ ] Practice (~2 min): let them try the toolbar; answer interface questions
      now, not during blocks.
- [ ] Click **Start task →** to begin block 1. Per block:
  - Participant works through the six month sheets per the instruction bar.
  - Do not point at the assistant panel; if asked, say "use anything you see".
  - They click **Done with block N** themselves → NASA-TLX appears.
- [ ] Watch the terminal for server errors; a yellow inline strip in the app
      is expected behavior (rollback/validation messages), not a crash.
- [ ] If the app must be reloaded: reload, go to `/setup`, start a NEW session
      with the same PID (a new session file is created; note it).

## After

- [ ] End screen: participant is done; thank them.
- [ ] Verify the file exists and has size:
      `data/sessions/<PID>/<session>.jsonl` (also listed on `/setup` with an
      export link).
- [ ] Lab mode: stop LabRecorder; confirm the XDF contains the
      `AdaptiveWorkspaces` stream and the 5 sync pulses near session start.
- [ ] Copy the `.jsonl` (and XDF) to the encrypted study drive; nothing else
      to scrub — logs contain the participant code only.
- [ ] Quick sanity: `python analysis/analyze.py` → `analysis/out/summary.csv`
      has 6 rows per block for this session.
- [ ] Note anything unusual (fallback cards, reloads, tool failures) in the
      session notes with the wall-clock time.
