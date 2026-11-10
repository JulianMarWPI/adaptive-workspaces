# Adaptive Workspaces: Evaluating AI-Proposed Interface Elements with Interaction Logs, Eye Tracking, and EEG
### Milestone 2 — Prototype + Method / Evaluation Plan

**Team:** Julian Mariscal · Gary DeVilbiss · Joshua Joubert — Worcester Polytechnic Institute · CS 546 · Prof. Erin Solovey
**Track:** Artifact Contribution (interactive system + study design)
**Prototype:** `adaptive-workspaces` — local-only web app ([repo / demo link here])
**Demo:** runs fully offline on one laptop; seeded click-through at `/demo`

> **Fill-in before submitting:** the repo/demo link, the per-person Milestone 2 contributions
> (last section — confirm the split), and the exact GenAI tools you used in your process.
> Citation numbers `[n]` refer to your Milestone 1 reference list.

---

## 1. One-Page Status Document

**What we built.** A working research probe: a browser spreadsheet in which every user
action is captured as a structured command. A deterministic *repeat miner* watches the
command stream for sequences the user repeats across sheets; when a repeat crosses a
support threshold *K*, a **local** LLM (qwen3:8b via Ollama, running offline on the same
laptop) names the repeated routine and writes a one-sentence proposal card. The user
accepts, edits, or dismisses the card; on accept, a one-click tool appears on a "My Tools"
toolbar and re-applies the routine to any sheet — re-targeting columns **by header**, so it
works even when a later sheet has its columns in a different order. The app supports three
interaction conditions (default / prompted / proactive), per-stream informed consent,
NASA-TLX after each block, and lab-grade sensing (eye-tracking + EEG) over
Lab Streaming Layer (LSL). Every event — including when a proposal appeared and whether it
was accepted, dismissed, or later removed — is written to a local JSONL log. **The central
mechanism (proactive mine → LLM proposal → accept → one-click reuse) is functional and
verified end-to-end** by an automated browser test against the live LLM, plus 77 unit tests.

**What we learned (from a pilot run on our own task, see §4).** (1) The assistant only fires
after a routine repeats across *two* sheets; in an early run the block was ended after a
single sheet and the assistant never appeared — so a correct system looked broken. (2) The
manual toolbar's one-click "do everything" buttons undersold the tedium the assistant is
meant to relieve. (3) Sorting a cleaned sheet scrambled the total row. Each finding drove a
concrete change (§4).

**What we will change before Milestone 3.** Recruit and run the full evaluation (≥7
participants for M3) across the three conditions with the lab sensing stack; finalize the
exit-interview protocol; and analyze the eye-tracking + EEG streams post-session against the
proposal-event markers. Open risk we are managing: lab-sensing throughput — booking and
calibrating eye-tracker + EEG for every participant by early December.

---

## 2. Method / Evaluation Plan

### Research questions (from Milestone 1)

- **RQ1 (Proactive vs. prompted).** Do AI-proposed elements, derived from observed repeated
  actions, reduce task time and steps compared with elements users request by prompt and with
  the default interface?
- **RQ2 (Adoption).** Which proposed elements do users accept, keep using, or remove, and why?
- **RQ3 (Hidden costs).** Do eye-tracking and EEG signals reveal costs of adaptation that
  decrease work efficiency?

These map directly onto the three study conditions: **default** (baseline), **prompted**
(user requests an element, in the spirit of DynaVis [6]), and **proactive** (the system mines
repeated actions and proposes an element unprompted) — the comparison at the heart of RQ1.

### 2a. Study Design

**Design.** Within-subjects, single session (~45 min). Each participant completes the same
spreadsheet-cleanup task under **three conditions**, one per block:

- **A — Default:** the toolbar only; no assistant panel.
- **B — Prompted:** an "Ask for a tool" box; the participant describes a tool in natural
  language and the system builds it (user-initiated automation).
- **C — Proactive:** the assistant watches for repeats and offers a proposal card
  unprompted (system-initiated automation).

**Counterbalancing.** Condition order and workbook assignment are assigned from the
participant ID via a Latin square (implemented in the prototype), so practice/fatigue
effects do not confound the condition comparison and no participant sees the same data
twice. Three **equivalent** workbooks (A/B/C) are generated from fixed seeds: same structure
and difficulty, different values; two of the six sheets in each workbook have shuffled
column order so the "re-target by header" behavior is exercised in every condition.

**Task & stimuli.** Each workbook is six "monthly export" sheets (Jan–Jun) of synthetic
sales rows. For every sheet the participant performs the same cleanup: delete the blank rows
(one at a time, selecting each), bold and freeze the header, format Amount as currency and
Date as a date, and add a SUM total row under Amount and Qty. The routine is deliberately
repetitive across the six sheets — that repetition is the phenomenon the assistant targets.

**Procedure.** (1) Consent, with a separate checkbox per data stream (interaction log /
eye-tracking / EEG). (2) Sensing calibration (eye-tracker; EEG signal check). (3) A 2-minute
unscored practice sheet. (4) Three task blocks (one per condition), each followed by a
NASA-TLX questionnaire. (5) A short semi-structured exit interview. Five LSL sync pulses are
emitted at session start so the interaction log, eye-tracking, and EEG streams can be aligned
offline.

**Pilot scope (this milestone).** We piloted the two most contrasting conditions —
**Default (A)** and **Proactive (C)** — which is the comparison that most directly tests the
core claim; the full study adds the Prompted (B) condition. (See §4 for pilot results.)

**Ethics (consent, data handling, debrief).** Participation is voluntary with the right to
withdraw at any time. Consent is collected per data stream, so a participant may allow
interaction logging but decline eye-tracking or EEG. **All data stays on the local machine**
(`data/sessions/<pid>/<session>.jsonl`): no cloud APIs, no telemetry, no analytics at
runtime. The workbooks are **synthetic** — participants never handle real or personal data.
The on-device LLM sees only the *abstract operation sequence* (e.g., "delete empty rows →
bold header → …") and generic synthetic column headers; **no cell values and nothing
identifying ever leave the laptop**, and the model is not trained or fine-tuned on
participant data. This directly operationalizes what our Milestone 1 interviewees asked for
(data should stay local and should not train the AI). Participants are debriefed on the
study's purpose at the end and may have their session deleted on request.

### 2b. Evaluation / Measures

The prototype already logs every measure below with aligned timestamps.

| Measure | Source in the log | RQ |
|---|---|---|
| Task time per sheet | command timestamps (first→last command per sheet; block_start→block_end) | RQ1 |
| Manual action count per sheet | `command` events, `source: manual` | RQ1 |
| Clicks saved by tools | `tool_used` events × bundled step count | RQ1 |
| Accept / dismiss / "don't suggest" / remove rates | `assistant` events (`accepted`, `not_now`, `never`, `tool_removed`) | RQ2 |
| Time-to-accept | latency `proposal_shown` → `accepted` | RQ2 |
| Attention: gaze on spreadsheet vs. toolbar vs. assistant panel | gaze stream × logged AOI rectangles (`aw-grid`, `aw-toolbar`, `aw-mytools`, `aw-assistant`) | RQ3 |
| EEG workload | Unicorn EEG, analyzed **post-session** from the CSV export, windowed around proposal-event markers | RQ3 |
| Subjective workload | NASA-TLX, six subscales, after each block | RQ1, RQ3 |
| Trust / interruption / control | semi-structured exit interview (coded for themes) | RQ2 |

Primary analysis is the within-subjects contrast across the three conditions (A vs. B vs. C)
on task time, action count, and NASA-TLX (RQ1), with proposal-response rates (RQ2) and
gaze/EEG (RQ3) as the mechanism-level measures explaining *why* a difference arises. The
sensing analysis is grounded in our Milestone 1 reading: EEG stress markers (decreased alpha,
increased beta power [7]) and the use of combined EEG + eye-tracking features to tell apart
target from non-target fixations [8], following Liu et al.'s multimodal approach of aligning
physiological signals to task events [4]. We use these signals, as the abstract states, *to
evaluate* whether a generated element eases work or adds cognitive load — not to trigger the
AI. Subjective workload uses NASA-TLX (add the Hart & Staveland 1988 citation to your
reference list if you report it); order effects are controlled by Latin-square
counterbalancing.

### 2c. Ecological Validity

The task is a near-direct instantiation of what **P2** (Excel / Power BI) described in our
Milestone 1 interviews: *"resetting column sizes (A, B, C, D) every time he makes another
table on another sheet — you're constantly going back and forth,"* plus reformatting cells,
adding headings, and rebuilding totals on *"new workbooks over and over … time wasted."* Our
six-sheet monthly-export cleanup reproduces exactly that pattern — the same multi-step routine
repeated across structurally-similar sheets — which is precisely the condition under which a
proactive assistant could help. The stimulus therefore reflects the phenomenon our users
actually named rather than an artificial puzzle. We strengthened this during iteration (§4):
the manual toolbar now requires the participant to *aim* each operation (select the target,
then act) and to delete blank rows one at a time — as real spreadsheet work does — instead
of one magic button that cleans the whole sheet. This makes the baseline's effort realistic
and keeps row-deletion a human judgment, matching the interview finding that users want to
review destructive actions themselves.

**What is still artificial, and we say so.** Data and workbooks are synthetic; the task is
fixed rather than self-chosen; a single lab session compresses what is really a recurring,
multi-session habit; and the lab sensing setup is not a natural work environment. We frame
the single-session, six-sheet design as a tractable proxy and describe the multi-session,
in-the-wild version as the ideal study.

---

## 3. Built Work (Prototype)

- **Repo / files:** [link]
- **Run it:** `npm install && ollama pull qwen3:8b && npm run dev`, then open `/demo` for a
  seeded click-through or `/setup` for the researcher screen. Everything runs offline.
- **Verification:** an automated end-to-end browser test drives the full proactive loop
  (mine → LLM proposal → accept → one-click reuse on a shuffled-column sheet) against the
  live local LLM and checks the resulting sheet and event log; 77 unit tests cover the
  command engine, miner, generalizer, and server. All passing.

---

## 4. Iteration (pilot findings → changes)

We piloted the Default and Proactive conditions on our own task and instrumented the
session. Three issues surfaced; each produced a change, with before/after artifacts.

1. **The assistant needs two sheets, and that wasn't obvious.** In a pilot run the block was
   ended after cleaning a single sheet, so the repeat never occurred and the assistant never
   proposed anything — a correct system that *looked* broken. **Change:** a live progress
   nudge in the assistant panel that tells the participant exactly what unlocks a suggestion
   ("you've cleaned Jan; now clean another sheet the same way"). *Artifacts: pilot log
   `DEMO_demomw9lfwcn.jsonl`; before/after screenshots of the assistant panel.*

2. **The manual baseline was too easy, undercutting the premise.** One-click buttons like
   "Delete empty rows" did the whole job, so the repetition the assistant is meant to relieve
   didn't *feel* tedious. **Change:** every toolbar operation now requires aiming first
   (select, then act), and blank rows are deleted one at a time — closer to real spreadsheet
   work and to our interviewees' desire to stay in control of deletions. *Artifacts:
   before/after toolbar screenshots; `DECISIONS.md`.*

3. **Sorting broke the total row.** Sorting a cleaned sheet dragged the SUM total row up into
   the data. **Change:** total rows are now pinned at the bottom during a sort. *Artifacts:
   failing-vs-fixed screenshots; regression test added.*

Our pilot NASA-TLX also showed the expected direction — far higher effort and frustration in
the manual Default block than when the assistant was available — which is encouraging
evidence that the manipulation has the intended effect, to be confirmed with real
participants at Milestone 3.

---

## 5. AI Module 1 — Where the LLM Got Our Users Wrong

Validating a naive "let the LLM watch and automate" design against our Milestone 1 interview
data surfaced four places the AI would have gotten our users wrong — each became a design
decision:

- **"Notify first," not act silently.** P1 was explicit: *automatic* changes should notify or
  ask the user before executing, while *prompted* ones can run right away. A proactive LLM
  that just applies changes violates this. We reconciled it by making every proactive change a
  *proposal card that notifies but never auto-applies* (accept / edit / "not now" / "don't
  suggest this"), one card at a time, never stealing focus — while the prompted condition runs
  immediately after the user's request, exactly the asymmetry P1 described.
- **Repetition threshold, which the LLM alone doesn't know.** P2 would welcome an auto-added
  tool *only if the pattern is caught within 2–3 sessions*; otherwise he'd rather prompt for
  it himself. An LLM asked to "suggest automations" has no notion of how many repeats justify
  a suggestion. Our **deterministic miner gates proposals on a support threshold K** (and the
  prompted condition exists precisely for patterns below it), operationalizing P2's "2–3
  sessions" rule rather than trusting the model's judgment about when to speak up.
- **Over-reaching into destructive, data-dependent actions.** The model will happily bundle
  *everything* a user repeats, including blank-row deletion — but our users wanted to keep
  control and be able to undo. We **exclude row deletion from the learned tool** (it also
  can't generalize — blanks sit in different places on every sheet) and keep it a manual,
  human-judged step. The assistant automates the deterministic formatting; the human decides
  what to delete.
- **Locality and trust.** P1 would only accept this if the AI were *local or enterprise and
  isolated to one program*, and both interviewees were uneasy about data leaving the machine
  (and about EEG). A cloud LLM would fail that test outright. Our proposer is a **local model
  running offline**; it sees only abstract operation names and synthetic headers, and per-
  stream consent lets a participant decline eye-tracking or EEG entirely.

Finally, the model's role is deliberately narrow: it *names* a routine the miner already
found — it never chooses the steps — and every label is validated, retried once, and falls
back to deterministic text if it misbehaves. An LLM mistake can produce a bad label, never a
broken spreadsheet.

---

## 6. Team Contributions

*(1–3 sentences each — confirm/adjust to your actual split before submitting.)*

- **Julian Mariscal:** Built the AI/assistant layer — the repeat miner, the local-LLM proposer
  with validation and deterministic fallback, and the proactive proposal UI — and led the pilot
  run and the prototype iteration (§4).
- **Gary DeVilbiss:** Led the sensing and evaluation plan — the eye-tracking + EEG measures and
  post-session analysis approach (grounded in [4], [7], [8]) — and the ethics / consent and
  participant-recruitment plan. [confirm]
- **Joshua Joubert:** Led the study design and stimuli — the three-condition structure, task and
  equivalent workbooks, and counterbalancing — and the measures-to-RQ mapping. [confirm]

## 7. Generative-AI Disclosure

Per the course Generative AI policy, we disclose our AI use:

- **In the system (studied, not incidental):** a local qwen3:8b model (Ollama, offline)
  names mined routines and writes proposal-card text. This is the research artifact itself;
  it runs on-device and sees no participant data (§2a).
- **In our process:** we used [ChatGPT / Claude / etc.] for [ideation / code scaffolding /
  drafting and editing this document / debugging]. All AI output was reviewed and validated
  by the team against our own code and our Milestone 1 user data; we take responsibility for
  the final content. [Edit this to match exactly what you used and where.]

---

### Appendix — Process artifacts included
- `DECISIONS.md` — running design-decision log
- Pilot session log: `DEMO_demomw9lfwcn.jsonl`
- Before/after screenshots: assistant nudge; aim-first toolbar; sort/total fix
- Automated end-to-end test + unit-test run output
