"""Analysis pipeline for Adaptive Workspaces sessions.

Reads every session JSONL under data/sessions/ and produces:
  analysis/out/summary.csv      per sheet: time, manual/tool step counts,
                                correctness, whether a tool existed yet
  analysis/out/proposals.csv    per proposal: time to decide, decision,
                                later tool uses, sheets remaining
  analysis/out/tlx.csv          NASA-TLX scores per condition
  analysis/out/gaze.csv         dwell time per AOI per sheet (if gaze logged)
  analysis/out/*.png            charts

Usage:  python analysis/analyze.py [--data data/sessions] [--out analysis/out]
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

DECISIONS = {"accepted", "edited", "not_now", "never"}


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_sessions(data_dir: Path) -> list[tuple[str, str, list[dict]]]:
    out = []
    for f in sorted(data_dir.glob("*/*.jsonl")):
        events = []
        with open(f, encoding="utf8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        if events:
            events.sort(key=lambda e: e.get("t", 0))
            out.append((f.parent.name, f.stem, events))
    return out


# ---------------------------------------------------------------------------
# Per-sheet metrics
# ---------------------------------------------------------------------------

def sheet_metrics(pid: str, session: str, events: list[dict]) -> list[dict]:
    """One row per sheet per block: active time, manual/tool steps,
    correctness, and whether a tool existed before the sheet was worked on."""
    rows: dict[tuple[int, str], dict] = {}
    cur_sheet = None
    cur_since = None
    cur_block = None
    cond = None
    tool_exists_since: float | None = None

    def ensure(block, sheet):
        key = (block, sheet)
        if key not in rows:
            rows[key] = {
                "pid": pid, "session": session, "cond": cond, "block": block,
                "sheet": sheet, "time_s": 0.0, "manual_steps": 0, "tool_steps": 0,
                "correctness": None, "tool_existed": False, "first_command_t": None,
            }
        return rows[key]

    def close_interval(t):
        nonlocal cur_since
        if cur_sheet is not None and cur_since is not None and cur_block is not None:
            ensure(cur_block, cur_sheet)["time_s"] += max(0.0, (t - cur_since) / 1000.0)
        cur_since = t

    for e in events:
        t = e.get("t", 0)
        kind = e.get("kind")
        if kind == "session" and e.get("event") == "block_start":
            close_interval(t)
            cur_block = e.get("block")
            cond = e.get("cond")
            cur_sheet = None
            tool_exists_since = None
        elif kind == "session" and e.get("event") == "block_end":
            close_interval(t)
            for s in e.get("scores") or []:
                if s:
                    ensure(cur_block, s["sheet"])["correctness"] = s.get("score")
            cur_sheet = None
        elif kind == "sheet_switch":
            close_interval(t)
            cur_sheet = e.get("sheet")
        elif kind == "command" and cur_block is not None and not e.get("failed"):
            sheet = e.get("sheet")
            if cur_sheet is None:
                cur_sheet = sheet
                cur_since = t
            r = ensure(cur_block, sheet)
            if r["first_command_t"] is None:
                r["first_command_t"] = t
                r["tool_existed"] = tool_exists_since is not None and tool_exists_since <= t
            if e.get("source") == "manual":
                r["manual_steps"] += 1
            elif e.get("source") in ("tool", "prompt"):
                r["tool_steps"] += 1
        elif kind == "assistant" and e.get("event") in ("accepted", "edited"):
            tool_exists_since = t if tool_exists_since is None else tool_exists_since
        elif kind == "assistant" and e.get("event") == "prompt_result" and e.get("ok"):
            tool_exists_since = t if tool_exists_since is None else tool_exists_since

    out = list(rows.values())
    for r in out:
        r.pop("first_command_t", None)
        r["time_s"] = round(r["time_s"], 2)
    return out


# ---------------------------------------------------------------------------
# Per-proposal metrics
# ---------------------------------------------------------------------------

def proposal_metrics(pid: str, session: str, events: list[dict]) -> list[dict]:
    rows = []
    open_props: dict[str, dict] = {}
    accepted_keys: set[str] = set()
    sheets_touched: set[str] = set()
    block_sheets = 6  # task workbooks have six sheets

    for e in events:
        kind, ev = e.get("kind"), e.get("event")
        if kind == "session" and ev == "block_start":
            sheets_touched = set()
        if kind == "command" and e.get("sheet"):
            sheets_touched.add(e["sheet"])
        if kind == "assistant" and ev == "proposal_shown":
            open_props[e.get("key", "?")] = {
                "pid": pid, "session": session, "cond": e.get("cond"), "block": e.get("block"),
                "key": e.get("key"), "label": e.get("label"), "path": e.get("path"),
                "support": e.get("support"), "shown_t": e.get("t"),
                "sheets_remaining": max(0, block_sheets - len(sheets_touched)),
                "decision": None, "decide_s": None, "later_tool_uses": 0,
            }
        if kind == "assistant" and ev in DECISIONS:
            key = e.get("key", "?")
            if key in open_props and open_props[key]["decision"] is None:
                p = open_props[key]
                p["decision"] = ev
                p["decide_s"] = round((e.get("t", 0) - p["shown_t"]) / 1000.0, 2)
                rows.append(p)
                if ev in ("accepted", "edited"):
                    accepted_keys.add(key)
        if kind == "assistant" and ev == "tool_used":
            tid = e.get("tool_id")
            for p in rows:
                if p["key"] == tid:
                    p["later_tool_uses"] += 1
    return rows


# ---------------------------------------------------------------------------
# TLX
# ---------------------------------------------------------------------------

def tlx_metrics(pid: str, session: str, events: list[dict]) -> list[dict]:
    rows = []
    for e in events:
        if e.get("kind") == "session" and e.get("event") == "tlx":
            row = {"pid": pid, "session": session, "cond": e.get("cond"), "block": e.get("block")}
            row.update({k: v for k, v in (e.get("values") or {}).items()})
            rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Gaze -> AOI dwell
# ---------------------------------------------------------------------------

def gaze_metrics(pid: str, session: str, events: list[dict]) -> tuple[list[dict], list[dict]]:
    """Dwell time per AOI per sheet, time reading open cards, and time to
    first fixation on My tools after a tool is added.

    Gaze points are mapped to the AOI rectangles active at that timestamp.
    Dwell is approximated as (sample count x median inter-sample interval)."""
    layouts: list[tuple[float, dict]] = [
        (e.get("t", 0), e.get("rects") or {}) for e in events if e.get("kind") == "layout"
    ]
    gaze = [e for e in events if e.get("kind") == "gaze"]
    if not layouts or not gaze:
        return [], []

    intervals = [b.get("t", 0) - a.get("t", 0) for a, b in zip(gaze, gaze[1:])]
    intervals = sorted(i for i in intervals if 0 < i < 1000)
    dt = (intervals[len(intervals) // 2] / 1000.0) if intervals else 0.033

    cur_sheet = "?"
    li = 0
    dwell: dict[tuple[str, str], float] = defaultdict(float)
    tool_added_t: float | None = None
    first_fix_rows: list[dict] = []
    sheet_events = [(e.get("t", 0), e.get("sheet")) for e in events if e.get("kind") == "sheet_switch"]
    tool_adds = [e.get("t", 0) for e in events if e.get("kind") == "assistant" and e.get("event") in ("accepted", "edited")]
    si = 0

    def rects_at(t: float) -> dict:
        nonlocal li
        while li + 1 < len(layouts) and layouts[li + 1][0] <= t:
            li += 1
        return layouts[li][1]

    for g in gaze:
        t, x, y = g.get("t", 0), g.get("x"), g.get("y")
        if x is None or y is None:
            continue
        while si < len(sheet_events) and sheet_events[si][0] <= t:
            cur_sheet = sheet_events[si][1] or "?"
            si += 1
        hit = None
        for aoi, r in rects_at(t).items():
            if r["x"] <= x <= r["x"] + r["w"] and r["y"] <= y <= r["y"] + r["h"]:
                # prefer the most specific AOI (cards over the panel)
                if hit is None or aoi.startswith("card:") or aoi == "aw-card":
                    hit = aoi
        if hit:
            dwell[(cur_sheet, hit)] += dt
            if tool_adds and hit == "aw-mytools":
                # first fixation on My tools after the most recent tool add
                added = max((a for a in tool_adds if a <= t), default=None)
                if added is not None and (tool_added_t is None or added != tool_added_t):
                    tool_added_t = added
                    first_fix_rows.append({
                        "pid": pid, "session": session, "tool_added_t": added,
                        "first_mytools_fixation_s": round((t - added) / 1000.0, 2),
                    })

    dwell_rows = [
        {"pid": pid, "session": session, "sheet": sheet, "aoi": aoi, "dwell_s": round(v, 2)}
        for (sheet, aoi), v in sorted(dwell.items())
    ]
    return dwell_rows, first_fix_rows


# ---------------------------------------------------------------------------
# Charts
# ---------------------------------------------------------------------------

def save_charts(out: Path, sheets: pd.DataFrame, tlx: pd.DataFrame, gaze: pd.DataFrame) -> None:
    if not sheets.empty:
        fig, ax = plt.subplots(figsize=(7, 4))
        for cond, grp in sheets.groupby("cond"):
            m = grp.groupby("sheet", sort=False)["time_s"].mean()
            ax.plot(m.index, m.values, marker="o", label=str(cond))
        ax.set_xlabel("Sheet")
        ax.set_ylabel("Mean time (s)")
        ax.set_title("Time per sheet by condition")
        ax.legend()
        fig.tight_layout()
        fig.savefig(out / "time_per_sheet.png", dpi=150)
        plt.close(fig)

        fig, ax = plt.subplots(figsize=(7, 4))
        agg = sheets.groupby("cond")[["manual_steps", "tool_steps"]].mean()
        agg.plot.bar(stacked=True, ax=ax)
        ax.set_ylabel("Mean steps per sheet")
        ax.set_title("Manual vs tool-driven steps")
        fig.tight_layout()
        fig.savefig(out / "steps_by_condition.png", dpi=150)
        plt.close(fig)

    if not tlx.empty:
        scales = [c for c in tlx.columns if c not in ("pid", "session", "cond", "block")]
        fig, ax = plt.subplots(figsize=(8, 4))
        tlx.groupby("cond")[scales].mean().T.plot.bar(ax=ax)
        ax.set_ylabel("NASA-TLX (0-100)")
        ax.set_title("Workload by condition")
        fig.tight_layout()
        fig.savefig(out / "tlx_by_condition.png", dpi=150)
        plt.close(fig)

    if not gaze.empty:
        fig, ax = plt.subplots(figsize=(7, 4))
        gaze.groupby("aoi")["dwell_s"].sum().sort_values().plot.barh(ax=ax)
        ax.set_xlabel("Total dwell (s)")
        ax.set_title("Gaze dwell per AOI")
        fig.tight_layout()
        fig.savefig(out / "gaze_dwell.png", dpi=150)
        plt.close(fig)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(data_dir: Path, out_dir: Path) -> dict[str, pd.DataFrame]:
    out_dir.mkdir(parents=True, exist_ok=True)
    sessions = load_sessions(data_dir)
    if not sessions:
        print(f"No sessions found under {data_dir}")

    sheet_rows, prop_rows, tlx_rows, gaze_rows, fix_rows = [], [], [], [], []
    for pid, sess, events in sessions:
        sheet_rows += sheet_metrics(pid, sess, events)
        prop_rows += proposal_metrics(pid, sess, events)
        tlx_rows += tlx_metrics(pid, sess, events)
        g, f = gaze_metrics(pid, sess, events)
        gaze_rows += g
        fix_rows += f

    frames = {
        "summary": pd.DataFrame(sheet_rows),
        "proposals": pd.DataFrame(prop_rows),
        "tlx": pd.DataFrame(tlx_rows),
        "gaze": pd.DataFrame(gaze_rows),
        "gaze_first_fixation": pd.DataFrame(fix_rows),
    }
    for name, df in frames.items():
        df.to_csv(out_dir / f"{name}.csv", index=False)
    save_charts(out_dir, frames["summary"], frames["tlx"], frames["gaze"])

    print(f"Sessions analysed: {len(sessions)}")
    for name, df in frames.items():
        print(f"  {name}.csv: {len(df)} rows")
    print(f"Output: {out_dir}")
    return frames


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(root / "data" / "sessions"))
    ap.add_argument("--out", default=str(root / "analysis" / "out"))
    args = ap.parse_args()
    run(Path(args.data), Path(args.out))
