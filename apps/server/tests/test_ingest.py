import json
import time

import httpx
from fastapi.testclient import TestClient

from apprentice.capture.pause import PauseService
from apprentice.capture.vision import VisionService
from apprentice.llm.client import LlmClient
from apprentice.main import app
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

JPEG = b"\xff\xd8fake-jpeg"
REPLY = {"events": [{"kind": "edit", "entity": "invoice 4471", "field": "Cost center",
                     "before": "4711", "after": "0400", "confidence": 0.9}]}  # fmt: skip


def wired_client(tmp_path, handler) -> tuple[TestClient, list]:
    calls = []

    def record(req: httpx.Request) -> httpx.Response:
        calls.append(json.loads(req.content))
        return handler(req)

    client = TestClient(app)
    client.__enter__()  # run lifespan, then swap in test doubles
    settings = Settings()
    llm = LlmClient(settings, transport=httpx.MockTransport(record))
    app.state.llm = llm
    app.state.pause.stop_all()
    app.state.store = SessionStore(tmp_path)
    app.state.pause = PauseService(app.state.store, app.state.hub, settings)
    app.state.vision = VisionService(
        llm, app.state.store, app.state.hub, settings, app.state.redactor
    )
    return client, calls


def wait_for(fn, timeout=2.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if result := fn():
            return result
        time.sleep(0.02)
    raise AssertionError("timed out")


def ok(_req):
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(REPLY)}}]})


def test_frames_become_events_and_are_broadcast(tmp_path):
    client, calls = wired_client(tmp_path, ok)
    try:
        q = "/ingest/frame?session_id=s1&frame_ts="
        assert client.post(q + "0", content=JPEG).json()["frame_ref"] == "frames/0000000000.jpg"
        with client.websocket_connect("/ws/session/s1") as ws:
            assert ws.receive_json()["type"] == "snapshot"
            assert client.post(q + "1000", content=b"").json() == {"frame_ref": None}  # tick
            client.post(q + "2000", content=JPEG)
            msg = ws.receive_json()
        assert msg["type"] == "event"
        assert msg["data"]["after"] == "0400" and msg["data"]["frame_ref"].endswith("2000.jpg")

        [ev] = wait_for(lambda: client.get("/sessions/s1/events").json())
        assert ev["kind"] == "edit" and ev["ts_ms"] == 2000
        assert len(calls) == 1  # the baseline frame alone is never sent to the model
        body = calls[0]
        assert body["id_slot"] == 0
        images = [p for p in body["messages"][-1]["content"] if p["type"] == "image_url"]
        assert len(images) == 2
        assert len(client.get("/sessions/s1").json()) and len(app.state.store.frames("s1")) == 3
    finally:
        client.__exit__(None, None, None)


def test_rejects_non_image_body(tmp_path):
    client, _ = wired_client(tmp_path, ok)
    try:
        r = client.post("/ingest/frame?session_id=s1&frame_ts=0", content=b"hello")
        assert r.status_code == 415
        assert (
            client.post("/ingest/frame?session_id=../x&frame_ts=0", content=JPEG).status_code == 422
        )
    finally:
        client.__exit__(None, None, None)


def test_model_failure_keeps_keyframe(tmp_path):
    state = {"fail": True}

    def flaky(req):
        if state["fail"]:
            return httpx.Response(500, text="boom")
        return ok(req)

    client, calls = wired_client(tmp_path, flaky)
    try:
        q = "/ingest/frame?session_id=s1&frame_ts="
        client.post(q + "0", content=JPEG)
        client.post(q + "1000", content=JPEG + b"1")
        wait_for(lambda: len(calls) == 1)
        state["fail"] = False
        client.post(q + "2000", content=JPEG + b"2")
        wait_for(lambda: client.get("/sessions/s1/events").json())
        # second diff still starts from the baseline frame, so the failed change isn't lost
        first_image = calls[1]["messages"][-1]["content"][1]["image_url"]["url"]
        assert first_image == calls[0]["messages"][-1]["content"][1]["image_url"]["url"]
    finally:
        client.__exit__(None, None, None)
