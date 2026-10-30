"""Generate a synthetic session JSONL for testing the analysis pipeline."""

from __future__ import annotations

import json
from pathlib import Path

SHEETS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]


def fake_events(pid: str = "P99", session: str = "sfake") -> list[dict]:
    t = 0.0
    events: list[dict] = []

    def emit(kind: str, **kw):
        nonlocal t
        t += 500.0
        e = {"t": t, "wall": "2026-11-07T14:00:00Z", "pid": pid, "session": session,
             "cond": kw.pop("cond", "proactive"), "block": kw.pop("block", 1), "kind": kind}
        e.update(kw)
        events.append(e)
        return e

    emit("session", event="start", block=0)
    emit("layout", block=0, rects={
        "aw-grid": {"x": 0, "y": 100, "w": 1000, "h": 700},
        "aw-toolbar": {"x": 0, "y": 40, "w": 1400, "h": 30},
        "aw-mytools": {"x": 0, "y": 70, "w": 1400, "h": 30},
        "aw-assistant": {"x": 1000, "y": 100, "w": 400, "h": 700},
    })
    emit("session", event="block_start", block=1, workbook="A")

    cleanup = [
        ("deleteEmptyRows", "manual"), ("setRowStyle", "manual"), ("freezeRows", "manual"),
        ("setNumberFormat", "manual"), ("setNumberFormat", "manual"), ("insertTotalRow", "manual"),
    ]
    # Three manual sheets
    for sheet in SHEETS[:3]:
        if sheet != "Jan":
            emit("sheet_switch", sheet=sheet)
        for cmd, src in cleanup:
            emit("command", sheet=sheet, cmd=cmd, source=src, args={})
            # a few gaze samples over the grid while working
            for _ in range(3):
                emit("gaze", x=500, y=400)

    # Proposal appears, participant reads it, accepts
    emit("layout", rects={
        "aw-grid": {"x": 0, "y": 100, "w": 1000, "h": 700},
        "aw-mytools": {"x": 0, "y": 70, "w": 1400, "h": 30},
        "aw-assistant": {"x": 1000, "y": 100, "w": 400, "h": 700},
        "aw-card": {"x": 1010, "y": 120, "w": 380, "h": 200},
    })
    emit("assistant", event="proposal_shown", key="pX_6", label="Clean sheet", path="llm", support=3)
    for _ in range(5):
        emit("gaze", x=1200, y=200)  # reading the card
    emit("assistant", event="proposal_expanded", key="pX_6")
    emit("assistant", event="accepted", key="pX_6", label="Clean sheet")
    for _ in range(2):
        emit("gaze", x=200, y=85)  # first fixation on My tools after accept

    # Tool on remaining sheets
    for sheet in SHEETS[3:]:
        emit("sheet_switch", sheet=sheet)
        for cmd, _ in cleanup:
            emit("command", sheet=sheet, cmd=cmd, source="tool", args={}, tool_id="pX_6")
        emit("assistant", event="tool_used", tool_id="pX_6", steps=6)

    emit("session", event="block_end",
         scores=[{"sheet": s, "score": 1.0 if i else 0.9, "passed": 9, "total": 10}
                 for i, s in enumerate(SHEETS)])
    emit("session", event="tlx", values={
        "mental": 40, "physical": 10, "temporal": 35, "performance": 20,
        "effort": 45, "frustration": 15})

    # Second block: default condition, all manual, no assistant
    emit("session", event="block_start", block=2, cond="default", workbook="B")
    for sheet in SHEETS:
        if sheet != "Jan":
            emit("sheet_switch", sheet=sheet, cond="default", block=2)
        for cmd, _ in cleanup:
            emit("command", sheet=sheet, cmd=cmd, source="manual", args={}, cond="default", block=2)
    emit("session", event="block_end", cond="default", block=2,
         scores=[{"sheet": s, "score": 1.0, "passed": 10, "total": 10} for s in SHEETS])
    emit("session", event="tlx", cond="default", block=2, values={
        "mental": 60, "physical": 15, "temporal": 55, "performance": 25,
        "effort": 65, "frustration": 35})
    emit("session", event="end", block=2, cond="default")
    return events


def write_fake_session(data_dir: Path, pid: str = "P99", session: str = "sfake") -> Path:
    d = data_dir / pid
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"{session}.jsonl"
    with open(f, "w", encoding="utf8") as fh:
        for e in fake_events(pid, session):
            fh.write(json.dumps(e) + "\n")
    return f


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    print(write_fake_session(root / "data" / "sessions"))
