# Adaptive Workspaces: Evaluating AI-Proposed Interface Elements with Interaction Logs, EEG, and NASA-TLX
### Milestone 2 — Prototype + Method / Evaluation Plan

**Team:** Julian Mariscal · Gary DeVilbiss · Joshua Joubert — Worcester Polytechnic Institute · CS 546 · Prof. Erin Solovey
**Track:** Artifact Contribution (interactive system + study design)
**Prototype / repo:** `adaptive-workspaces` · https://github.com/JulianMarWPI/adaptive-workspaces

> **To confirm before submitting:** the per-person Milestone 2 contributions (two lines marked
> `[confirm]`), the exact GenAI tools used, and the participant count `[N]`. Citation markers `[n]`
> refer to the Milestone 1 reference list; new sources are listed at the end.

---

## Abstract

As AI copilots become common in workplace software, it is important to understand not only whether
they make people faster, but how they change cognitive effort and stress during the work itself. We
built a spreadsheet AI copilot that creates shortcuts for repetitive actions in two ways: from user
prompts, or automatically when it detects a repeated action sequence. In a within-subjects study, *[N]*
participants complete spreadsheet tasks under three conditions (no copilot, prompt-based copilot,
automatic copilot), with condition order counterbalanced. Tasks are matched in difficulty and built
around repeated operations (plotting/labeling data and formatting tables) so that the copilot has
opportunities to help. Before the tasks, participants complete a performance-based spreadsheet skill
test, used to examine whether expertise moderates the effect of assistance, and a calibration block
(rest and n-back) that anchors each participant's EEG workload index to known load levels.
Productivity is measured by rubric-scored correctness, completion time, action logs, and suggestion
acceptance. Cognitive load is measured using continuous EEG, with timestamps for copilot events such
as suggestion onset and acceptance, paired with a post-block NASA-TLX questionnaire that yields
perceived task difficulty and stress. We hypothesize that assistance reduces perceived and neural
workload during repetitive segments, and that automatic suggestions cause a brief transient increase
in load at onset. We discuss what EEG and subjective workload can and cannot reveal about the value
of AI copilots.

## Research Questions & Hypotheses

Research questions (from Milestone 1):

- **RQ1 (Proactive vs. prompted).** Do AI-proposed elements derived from observed repeated actions
  reduce task time and steps compared with elements users request by prompt and with the default
  interface?
- **RQ2 (Adoption).** Which proposed elements do users accept, keep using, or remove, and why?
- **RQ3 (Hidden costs).** Do EEG and self-reported workload reveal costs of adaptation that offset the
  efficiency benefit?

Hypotheses:

- **H1.** Both copilot conditions reduce perceived (NASA-TLX) and neural (EEG) workload during the
  repetitive segments of a task relative to the no-copilot baseline.
- **H2.** The *automatic* copilot produces a brief, transient *increase* in neural workload at the
  moment a suggestion appears (an interruption cost), even if overall workload is lower.

These map onto the conditions: **no copilot** (baseline), **prompt-based** (user-initiated, in the
spirit of DynaVis [6]), and **automatic** (system mines repeats and proposes unprompted).

---

## Method / Evaluation Plan

### Study Design

**Design.** Within-subjects, single session (~60 min with EEG setup). Each participant works under all
three copilot conditions; condition order is counterbalanced across participants so order effects can
be estimated.

**Conditions.**
- **A — No copilot:** the toolbar only; no assistant.
- **B — Prompt-based copilot:** an "Ask for a tool" box; the participant describes a shortcut in
  natural language and the system builds it (user-initiated).
- **C — Automatic copilot:** the system mines the action log for a repeated sequence and offers a
  proposal card unprompted; the participant accepts, edits, or dismisses it (system-initiated).

**Tasks & stimuli.** Six tasks, two per condition, matched in difficulty and built around repeated
operations so the copilot has something to detect and offer (Table 1). Tasks are drawn from two types:
**formatting tables** (delete blank rows, bold/freeze headers, apply number formats, add total rows —
repeated across structurally-similar sheets) and **plotting/labeling data** (structuring, sorting, and
labeling a dataset for a chart). Tasks within a condition are paired (1&2, 3&4, 5&6) and the task order
within a pair is counterbalanced. Workbooks are generated from fixed seeds so difficulty is equated and
no participant sees the same values twice; some sheets have shuffled column order so the copilot's
re-target-by-header behavior is exercised. The current prototype implements the **formatting-tables**
routine (what we piloted); the **plotting/labeling** task type is a planned extension for the full
study — chart rendering is not yet built — and is flagged as such in the Status Document.

| Condition | Task type | Task |
|---|---|---|
| No copilot | Plotting/labeling data | Task 1 |
| No copilot | Formatting tables | Task 2 |
| Prompt-based copilot | Plotting/labeling data | Task 3 |
| Prompt-based copilot | Formatting tables | Task 4 |
| Automatic copilot | Plotting/labeling data | Task 5 |
| Automatic copilot | Formatting tables | Task 6 |

*Table 1: tasks and conditions. The prototype implements the formatting-tables routine; plotting/labeling
is a planned extension (see Status Document).*

**Procedure.**
1. **Introduction & consent.** Researchers brief the participant on expected duration, the main blocks,
   the EEG cap, and the NASA-TLX instrument, then collect informed consent for anonymized screen
   recording, EEG, and NASA-TLX data, and the agreement to compensate them for their time.
2. **Block 1 — Calibration.** (a) A short performance-based spreadsheet **skill screen**; if the
   participant cannot complete it, the session may end here. (b) Fit the EEG cap; begin screen + EEG
   recording. (c) Explain and run an **n-back** task (1-back and 2-back with rest periods before and
   between), with the participant moving the mouse off-screen during rest so rest is unambiguous on the
   recording. This anchors each participant's EEG workload index to known load levels.
3. **Block 2 — Main experiment.** Explain the tasks and that the participant may use any tool in the
   environment. After a short rest, the participant completes the six tasks (Table 1) with rest periods
   between each pair. A **NASA-TLX** questionnaire follows each pair.
4. **Block 3 — Debrief.** End the recording, remove the EEG cap, thank and compensate the participant,
   and explain the study's purpose.

**Ethics (consent, data handling, debrief).** Participation is voluntary with the right to withdraw at
any time; consent is collected per data stream (screen recording / EEG / questionnaire). Data is
identified only by participant ID and **stays on team-controlled devices** — the application itself is
local-only (no cloud, no telemetry), workbooks are **synthetic** so participants never handle personal
data, and the on-device LLM sees only abstract operation names and generic headers, never cell values.
Data is **not used to train any model**, operationalizing exactly what our Milestone 1 interviewees
asked for (P1: "fine so long as the AI is local… not to train the AI"; both wanted data to stay local).
Participants are debriefed at the end and may request deletion of their session.

**Pilot scope (this milestone).** We piloted the two most contrasting conditions — **No copilot (A)**
and **Automatic copilot (C)** — on the formatting-tables task type; the full study adds the prompt-based
condition and the second task type (§4, §Notes).

### Evaluation / Measures

**Requirement the copilot must meet for the experiment to work.** For the data to be interpretable,
the *automatic* copilot must reliably **detect the repeated routine and surface a proposal during the
task** (within the task's repetitions), so every participant in condition C actually receives a
suggestion to accept or reject at a comparable point, and the proposal's **onset must be timestamped
precisely** for EEG event-locking. Concretely, the miner's support threshold K must be reached within a
single task, and proposal latency must be short and stable (we measured ≈1.6 s from the local model)
so suggestion onset is a clean event marker. The *prompt-based* copilot must reliably build a valid
tool from a natural-language request. Both are verified by the end-to-end test and the pilot.

| Measure | Source | RQ / H |
|---|---|---|
| Rubric-scored correctness | automatic checker scores each sheet against a target state | RQ1 |
| Completion time per task | command timestamps (task start → end) | RQ1 |
| Action count per task | `command` events, `source: manual` | RQ1 |
| Suggestion accept / dismiss / "don't suggest" / remove | `assistant` events (`accepted`, `not_now`, `never`, `tool_removed`) | RQ2 |
| Sustained neural workload | continuous EEG; power-spectral-density (PSD) workload index (↓alpha, ↑beta [7]) over repetitive task segments, normalized to the n-back/rest calibration | RQ3 / H1 |
| Event-locked workload at suggestion onset | EEG windowed around the `proposal_shown` marker vs. baseline (interruption cost) | RQ3 / H2 |
| Perceived workload & stress | NASA-TLX, six subscales, after each task pair | RQ3 / H1 |
| Expertise (moderator) | performance-based skill screen score | moderator for RQ1/RQ3 |

EEG is analyzed **post-session**: PSD on manually timestamped periods from the screen recording and on
copilot-event markers, each participant normalized to their own n-back/rest anchors so the workload
index is comparable across people. The sensing approach follows prior work combining EEG with
self-reported workload for adaptive interfaces [Duraisamy 2026] and EEG stress markers [7]; the
proactive-vs-prompted framing follows mixed-initiative and proactive-support work [4]. (If NASA-TLX is
reported, add the Hart & Staveland 1988 citation to the reference list.)

### Ecological Validity

The task is grounded in a real workflow our Milestone 1 interviews surfaced. **P2** (Excel / Power BI)
described *"resetting column sizes every time he makes another table on another sheet — constantly
going back and forth,"* plus reformatting cells, adding headings, and rebuilding totals on *"new
workbooks over and over … time wasted."* Our tasks reproduce exactly this: the same multi-step routine
repeated across structurally-similar sheets — precisely the condition under which a behavior-mining
copilot could help — so the stimulus reflects a phenomenon users actually named rather than an
artificial puzzle.

We deliberately run the study in a **custom, fully-instrumented spreadsheet application rather than
stock Excel**. This is a methodological requirement, not a convenience: a controlled study needs
per-action logging, an injected copilot that mines behavior in real time, and **EEG event markers
aligned to suggestion onset** — none of which stock Excel exposes. The environment offers the standard
spreadsheet affordances the task needs, and a practice block mitigates unfamiliarity. The copilot is
also *behaviorally grounded* (it mines real repeated actions rather than being Wizard-of-Oz'd) and runs
**locally with a notify-first proposal**, matching the deployment our interviewees said they would
accept (P1: local/enterprise, "notify before executing"; P2: auto-add only if a pattern is caught
within 2–3 sessions, otherwise prompt).

**What is still artificial, and we say so.** Workbooks and data are synthetic; tasks are fixed rather
than self-chosen; a single lab session compresses what is really a recurring, multi-session habit; the
EEG cap and lab setting are not a natural work environment; and pilot participants are students who may
not be domain experts (the skill screen partly addresses this). We frame the single-session design as a
tractable proxy and describe the multi-session, in-the-wild version as the ideal study.

---

## Built Work (Prototype)

- **Repo / files:** https://github.com/JulianMarWPI/adaptive-workspaces
- **Run it (local-only by design, so the repo is the demo):** `npm install && ollama pull qwen3:8b &&
  npm run dev`, then open `/demo` for a seeded click-through or `/setup` for the researcher screen.
  Everything runs offline — no cloud, no API keys.
- **What is functional:** the full **automatic** loop (mine a repeated routine → local LLM names it →
  proposal card → accept → one-click reuse, re-targeting columns by header on shuffled sheets); the
  **prompt-based** "Ask for a tool" path; the **no-copilot** baseline; per-action logging with copilot
  event markers; an automatic correctness **checker**; NASA-TLX after each block; and LSL markers for
  EEG alignment.
- **Verification:** an automated end-to-end browser test drives the full automatic loop against the
  live local LLM and checks the resulting sheet and the event log; 77 unit tests cover the command
  engine, miner, generalizer, and server. All passing.

---

## Iteration (pilot findings → changes)

We piloted the no-copilot and automatic conditions on the formatting task and instrumented the session.
Three issues surfaced; each produced a change, with before/after artifacts.

1. **The automatic copilot needs the routine to repeat before it can help, and that wasn't obvious.** In
   a pilot run the task ended after a single sheet, so no repeat occurred and no suggestion appeared — a
   correct system that *looked* broken. **Change:** a live progress nudge that tells the participant what
   unlocks a suggestion. *Artifacts: pilot log `DEMO_demomw9lfwcn.jsonl`; before/after screenshots.*
2. **The manual baseline was too easy, undercutting the premise.** One-click buttons did whole jobs, so
   the repetition the copilot relieves didn't *feel* effortful. **Change:** every operation now requires
   aiming first (select, then act) and blank rows are deleted one at a time — closer to real spreadsheet
   work and to interviewees' wish to control deletions. *Artifacts: before/after toolbar screenshots;
   `DECISIONS.md`.*
3. **Sorting scrambled the total row.** **Change:** total rows are pinned at the bottom during a sort; a
   regression test was added.

Pilot NASA-TLX moved in the predicted direction (higher effort/frustration in the no-copilot block than
with the copilot available), consistent with H1 — to be confirmed with real participants and EEG at M3.

---

## AI Module 1 — Where the LLM Got Our Users Wrong

Validating a naive "let the LLM watch and automate" design against our Milestone 1 interviews surfaced
four mismatches, each of which became a design decision:

- **"Notify first," not act silently.** P1 was explicit that *automatic* changes should notify/ask
  before executing while *prompted* ones can run immediately. We made every automatic change a proposal
  card that notifies but never auto-applies (accept / edit / "not now" / "don't suggest"), while the
  prompt-based condition runs on request — exactly P1's asymmetry.
- **A repetition threshold the LLM alone doesn't know.** P2 would accept auto-added tools *only if the
  pattern is caught within 2–3 sessions*, else he'd prefer to prompt. An LLM has no notion of how many
  repeats justify a suggestion; our deterministic miner gates proposals on a support threshold K, and
  the prompt-based condition exists for patterns below it.
- **Over-reaching into destructive actions.** The model will happily bundle everything repeated,
  including row deletion; our users wanted to keep control. We exclude row deletion from the learned
  tool (it also can't generalize — blanks differ per sheet) and keep it a manual, human-judged step.
- **Locality and trust.** P1 would only accept a local/enterprise AI isolated to one program, and both
  were uneasy about data leaving the machine. A cloud LLM fails that test; ours is a local model that
  sees only abstract operation names and synthetic headers.

The model's role is deliberately narrow: it *names* a routine the miner already found — it never
chooses the steps — and every label is validated, retried once, and falls back to deterministic text.
An LLM mistake can produce a bad label, never a broken spreadsheet.

---

## Status Document

**What we built.** A local, fully-instrumented spreadsheet application with three copilot conditions
(no copilot / prompt-based / automatic), behavior mining that turns repeated actions into a local-LLM-
named one-click tool, per-action logging with copilot event markers, an automatic correctness checker,
NASA-TLX after each block, and LSL markers for EEG alignment. The central mechanism is **functional and
verified end-to-end** (automated browser test against the live LLM + 77 unit tests).

**What we learned.** From a pilot of the no-copilot and automatic conditions: (1) the automatic copilot
only helps once the routine repeats, which must be made visible to participants; (2) the manual baseline
must demand real effort or the copilot's value doesn't register; (3) a sort/total bug. Each drove a
change (§4), and pilot NASA-TLX moved as H1 predicts.

**What we will change before Milestone 3.** Recruit ≥7 participants and run all three conditions with
EEG; finalize the calibration block (skill screen + n-back) and the EEG PSD pipeline normalized to
those anchors; finalize NASA-TLX scoring and the analysis for the event-locked onset measure (H2);
and build the **plotting/labeling** task type into the prototype (chart rendering — currently a planned
extension) so both task types run in the same instrumented environment. Primary open risk: **EEG
throughput** — fitting, calibrating, and recording EEG for every participant within the semester.

---

## Team Contributions

*(1–3 sentences each — confirm/adjust before submitting.)*

- **Julian Mariscal:** Built the copilot layer — the repeat miner, the local-LLM proposer with
  validation and deterministic fallback, and the automatic proposal UI — and led the pilot run and
  prototype iteration (§4).
- **Gary DeVilbiss:** Led the EEG and evaluation design — the calibration block (n-back/rest anchoring),
  the PSD workload-index analysis, and the ethics / consent and recruitment plan. [confirm]
- **Joshua Joubert:** Led the study design and stimuli — the three-condition structure, task table and
  counterbalancing, and the measures-to-RQ/hypothesis mapping. [confirm]

## Generative-AI Disclosure

Per the course Generative AI policy:

- **In the system (studied, not incidental):** a local qwen3:8b model (Ollama, offline) names mined
  routines and writes proposal text. This is the research artifact itself; it runs on-device and sees no
  participant data.
- **In our process:** we used Claude Code (Anthropic) for prototype implementation and iteration,
  debugging, and drafting/editing this document, and [add any others, e.g. ChatGPT for Milestone 1
  literature search]. All AI output was reviewed and validated by the team against our own code and our
  Milestone 1 user data; we take responsibility for the final content.

---

## Sources

- Duraisamy, S., Attygalle, N. T., Emami, P., Vanderdonckt, J., & Leiva, L. A. 2026. Evaluating
  Real-Time Adaptive Interfaces through EEG-derived and Self-reported Mental Workload Indicators. In
  *Companion Proc. 18th ACM SIGCHI Symp. on Engineering Interactive Computing Systems (EICS '26)*, 40–47.
- Al-Shargie, F., Kiguchi, M., Badruddin, N., Dass, S. C., Hani, A. F. M., & Tang, T. B. 2016. Mental
  stress assessment using simultaneous measurement of EEG and fNIRS. *Biomedical Optics Express*, 7(10),
  3882–3898. https://doi.org/10.1364/BOE.7.003882
- Plus the adaptive-UI, mixed-initiative, and generative-UI works from the Milestone 1 reference list
  ([2], [3], [4], [6]) cited above by number — carry their full entries over here for the final paper.
