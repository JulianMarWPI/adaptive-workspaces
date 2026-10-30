"""Lab Streaming Layer bridge.

Runs a local websocket server; the web app sends every log event here, and
each one is pushed as a string marker on an LSL outlet named
"AdaptiveWorkspaces". The lab recorder (e.g. LabRecorder) picks the stream up
alongside the EEG / eye-tracker streams.

Sync check: the web app emits 5 `sync_pulse` session events at session start;
they appear as 5 markers ~200 ms apart, which lets you verify clock alignment
in the recording.

Usage:
    pip install -r bridge/requirements.txt
    python bridge/lsl_bridge.py            # listens on ws://127.0.0.1:8765

If pylsl is not installed (or no LSL library is present), the bridge still
runs and prints markers to stdout so it can be tested without lab hardware.
"""

import asyncio
import json
import signal
import sys

HOST = "127.0.0.1"
PORT = 8765


def make_outlet():
    """Create the LSL outlet, or None if pylsl is unavailable."""
    try:
        from pylsl import StreamInfo, StreamOutlet  # type: ignore

        info = StreamInfo(
            name="AdaptiveWorkspaces",
            type="Markers",
            channel_count=1,
            nominal_srate=0,  # irregular
            channel_format="string",
            source_id="adaptive-workspaces-bridge",
        )
        return StreamOutlet(info)
    except Exception as exc:  # pylsl missing or liblsl not found
        print(f"[bridge] pylsl unavailable ({exc}); echoing markers to stdout only", flush=True)
        return None


def marker_for(event: dict) -> str:
    """Compact, single-string marker. The full event stays in the JSONL log;
    the marker carries enough to align and identify it."""
    kind = event.get("kind", "?")
    detail = event.get("event") or event.get("cmd") or ""
    t = event.get("t", "")
    return json.dumps({"t": t, "kind": kind, "detail": detail}, separators=(",", ":"))


async def handle(websocket, outlet):
    peer = getattr(websocket, "remote_address", "?")
    print(f"[bridge] client connected: {peer}", flush=True)
    try:
        async for message in websocket:
            try:
                event = json.loads(message)
            except json.JSONDecodeError:
                continue
            marker = marker_for(event)
            if outlet is not None:
                outlet.push_sample([marker])
            if event.get("kind") != "gaze":  # keep stdout readable
                print(f"[bridge] marker: {marker}", flush=True)
    finally:
        print(f"[bridge] client disconnected: {peer}", flush=True)


async def main():
    try:
        import websockets
    except ImportError:
        print("Missing dependency. Run: pip install -r bridge/requirements.txt", file=sys.stderr)
        sys.exit(1)

    outlet = make_outlet()
    stop = asyncio.get_event_loop().create_future()
    for sig in ("SIGINT", "SIGTERM"):
        if hasattr(signal, sig):
            try:
                asyncio.get_event_loop().add_signal_handler(
                    getattr(signal, sig), lambda: stop.set_result(None)
                )
            except NotImplementedError:
                pass  # Windows

    async with websockets.serve(lambda ws: handle(ws, outlet), HOST, PORT):
        print(f"[bridge] LSL bridge listening on ws://{HOST}:{PORT}", flush=True)
        print("[bridge] stream: AdaptiveWorkspaces (Markers)", flush=True)
        await stop


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
