"""pytest: the analysis runs on a generated fake session without errors and
produces sensible numbers."""

from pathlib import Path

from analyze import run
from make_fake_session import write_fake_session


def test_analysis_on_fake_session(tmp_path: Path):
    data = tmp_path / "sessions"
    out = tmp_path / "out"
    write_fake_session(data)

    frames = run(data, out)

    # Files exist
    for name in ["summary", "proposals", "tlx", "gaze"]:
        assert (out / f"{name}.csv").exists()
    assert (out / "time_per_sheet.png").exists()
    assert (out / "tlx_by_condition.png").exists()
    assert (out / "gaze_dwell.png").exists()

    # Per-sheet: 6 sheets x 2 blocks
    summary = frames["summary"]
    assert len(summary) == 12
    jan1 = summary[(summary.block == 1) & (summary.sheet == "Jan")].iloc[0]
    assert jan1.manual_steps == 6
    assert jan1.tool_steps == 0
    assert not jan1.tool_existed
    may1 = summary[(summary.block == 1) & (summary.sheet == "May")].iloc[0]
    assert may1.tool_steps == 6
    assert may1.tool_existed
    assert (summary.correctness.notna()).all()

    # Proposals: one, accepted, with later tool uses on sheets 4-6
    props = frames["proposals"]
    assert len(props) == 1
    p = props.iloc[0]
    assert p.decision == "accepted"
    assert p.decide_s > 0
    assert p.later_tool_uses == 3
    assert p.sheets_remaining == 3

    # TLX: one row per block, grouped by condition
    tlx = frames["tlx"]
    assert len(tlx) == 2
    assert set(tlx.cond) == {"proactive", "default"}

    # Gaze: dwell on grid and on the card
    gaze = frames["gaze"]
    assert (gaze.aoi == "aw-grid").any()
    assert (gaze.aoi == "aw-card").any()
    fix = frames["gaze_first_fixation"]
    assert len(fix) == 1
    assert fix.iloc[0].first_mytools_fixation_s >= 0
