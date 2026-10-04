import base64
import io
import json
import re
from dataclasses import dataclass

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_ingest import REPLY, ok, wait_for, wired_client

from apprentice import settings as settings_module
from apprentice.main import app as main_app
from apprentice.privacy.redactor import MAP_FILE, Redactor
from apprentice.session.hub import Hub
from apprentice.session.routes import router
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

# Pillow comes with the privacy extra; without it these tests are skipped, not broken.
Image = pytest.importorskip("PIL.Image")
ImageDraw = pytest.importorskip("PIL.ImageDraw")
ImageFont = pytest.importorskip("PIL.ImageFont")


@dataclass
class Hit:
    entity_type: str
    start: int
    end: int
    score: float


class FakeAnalyzer:
    """Reports every occurrence of the known strings, case-insensitively."""

    def __init__(self, known: dict[str, str]):
        self.known = known

    def analyze(self, text, language, entities, score_threshold):
        out = []
        for value, kind in self.known.items():
            pattern = re.compile(r"\s+".join(map(re.escape, value.split())), re.IGNORECASE)
            out += [Hit(kind, m.start(), m.end(), 0.9) for m in pattern.finditer(text)]
        return out


class BlackoutEngine:
    def redact(self, image, fill, entities, score_threshold):
        return Image.new("RGB", image.size, fill)


KNOWN = {
    "Anna Schmidt": "PERSON",
    "Anna": "PERSON",
    "Jan Novak": "PERSON",
    "anna@example.com": "EMAIL_ADDRESS",
}


def jpeg(color=(255, 255, 255)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (64, 32), color).save(out, format="JPEG")
    return out.getvalue()


def make(tmp_path, **kw) -> tuple[Redactor, SessionStore]:
    store = SessionStore(tmp_path)
    store.create("s1")
    store.create("s2")
    kw.setdefault("analyzer", FakeAnalyzer(KNOWN))
    return Redactor(store, Settings(PRESIDIO_ENABLED=True), **kw), store


def test_numbering_is_stable_per_session(tmp_path):
    r, _ = make(tmp_path)
    assert r.text("s1", "Anna Schmidt and Jan Novak") == "<PERSON_1> and <PERSON_2>"
    assert r.text("s1", "jan   NOVAK wrote anna@example.com") == (
        "<PERSON_2> wrote <EMAIL_ADDRESS_1>"
    )
    assert r.text("s2", "Jan Novak") == "<PERSON_1>"


def test_map_persists_without_raw_values(tmp_path):
    r, store = make(tmp_path)
    r.text("s1", "Anna Schmidt")
    again = Redactor(store, Settings(PRESIDIO_ENABLED=True), analyzer=FakeAnalyzer(KNOWN))
    assert again.text("s1", "Jan Novak, Anna Schmidt") == "<PERSON_2>, <PERSON_1>"
    raw = (store.session_dir("s1") / MAP_FILE).read_text(encoding="utf-8")
    assert "anna" not in raw.lower() and "schmidt" not in raw.lower()
    assert len(json.loads(raw)) == 2


def test_overlapping_spans_keep_the_longer(tmp_path):
    r, _ = make(tmp_path)
    assert r.text("s1", "Anna Schmidt") == "<PERSON_1>"


def test_existing_placeholders_are_left_alone(tmp_path):
    r, _ = make(tmp_path, analyzer=FakeAnalyzer({"PERSON_1": "PERSON"}))
    assert r.text("s1", "<PERSON_1> signed") == "<PERSON_1> signed"


def test_event_redaction_touches_values_only(tmp_path):
    r, _ = make(tmp_path)
    ev = {
        "id": "e1",
        "ts_ms": 5,
        "kind": "edit",
        "entity": "contact Anna Schmidt",
        "field": "Anna Schmidt",
        "before": None,
        "after": "anna@example.com",
        "frame_ref": "frames/0000000005.jpg",
        "fields": {"Anna": "Jan Novak", "Amount": "100"},
    }
    out = r.event("s1", ev)
    assert out["entity"] == "contact <PERSON_1>"
    assert out["after"] == "<EMAIL_ADDRESS_1>" and out["before"] is None
    assert out["fields"] == {"Anna": "<PERSON_2>", "Amount": "100"}
    assert out["field"] == "Anna Schmidt" and out["frame_ref"] == ev["frame_ref"]
    assert ev["entity"] == "contact Anna Schmidt"


def test_disabled_is_identity(tmp_path):
    store = SessionStore(tmp_path)
    r = Redactor(store, Settings(PRESIDIO_ENABLED=False))
    ev = {"entity": "Anna Schmidt"}
    img = jpeg()
    assert r.text("nope", "Anna Schmidt") == "Anna Schmidt"
    assert r.text("nope", None) is None
    assert r.event("nope", ev) is ev
    assert r.image("nope", img) is img
    assert r.status() == "off"


def test_image_masked_and_status(tmp_path):
    r, _ = make(tmp_path, image_engine=BlackoutEngine())
    out = r.image("s1", jpeg())
    assert out.startswith(b"\xff\xd8")
    assert Image.open(io.BytesIO(out)).getpixel((5, 5)) == (0, 0, 0)
    assert r.status() == "on"


def test_image_without_tesseract_is_text_only(tmp_path, monkeypatch):
    monkeypatch.setattr("apprentice.privacy.redactor._tesseract_available", lambda cmd: False)
    r, _ = make(tmp_path)
    img = jpeg()
    assert r.image("s1", img) is img
    assert r.status() == "text-only"


def test_transcript_post_stores_and_returns_placeholder(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.state.store = SessionStore(tmp_path)
    app.state.hub = Hub()
    app.state.redactor = Redactor(
        app.state.store, Settings(PRESIDIO_ENABLED=True), analyzer=FakeAnalyzer(KNOWN)
    )
    c = TestClient(app)
    sid = c.post("/sessions").json()["session_id"]
    body = {"speaker": "expert", "ts_ms": 1, "text": "Call Anna Schmidt"}
    with c.websocket_connect(f"/ws/session/{sid}") as ws:
        ws.receive_json()
        r = c.post(f"/sessions/{sid}/transcript", json=body)
        assert ws.receive_json()["data"]["text"] == "Call <PERSON_1>"
    assert r.json()["text"] == "Call <PERSON_1>"
    assert app.state.store.transcript(sid)[0]["text"] == "Call <PERSON_1>"


def test_ingested_frame_stored_masked_vision_gets_original(tmp_path):
    client, calls = wired_client(tmp_path, ok)
    try:
        main_app.state.redactor = Redactor(
            main_app.state.store,
            Settings(PRESIDIO_ENABLED=True),
            analyzer=FakeAnalyzer(KNOWN),
            image_engine=BlackoutEngine(),
        )
        first, second = jpeg((250, 250, 250)), jpeg((200, 200, 200))
        q = "/ingest/frame?session_id=s1&frame_ts="
        client.post(q + "0", content=first)
        client.post(q + "1000", content=second)
        wait_for(lambda: calls)
        urls = [
            p["image_url"]["url"]
            for p in calls[0]["messages"][-1]["content"]
            if p["type"] == "image_url"
        ]
        assert [base64.b64decode(u.split(",", 1)[1]) for u in urls] == [first, second]
        stored = main_app.state.store.frame_path("s1", "frames/0000001000.jpg").read_bytes()
        assert Image.open(io.BytesIO(stored)).getpixel((5, 5)) == (0, 0, 0)
    finally:
        client.__exit__(None, None, None)


def test_claude_vision_gets_masked_frames(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_module.get_settings(), "VISION_PROVIDER", "anthropic")
    client, calls = wired_client(tmp_path, ok)
    try:
        main_app.state.redactor = Redactor(
            main_app.state.store,
            Settings(PRESIDIO_ENABLED=True),
            analyzer=FakeAnalyzer(KNOWN),
            image_engine=BlackoutEngine(),
        )
        q = "/ingest/frame?session_id=s1&frame_ts="
        client.post(q + "0", content=jpeg((250, 250, 250)))
        client.post(q + "1000", content=jpeg((200, 200, 200)))
        wait_for(lambda: calls)
        urls = [
            p["image_url"]["url"]
            for p in calls[0]["messages"][-1]["content"]
            if p["type"] == "image_url"
        ]
        stored = [
            main_app.state.store.frame_path("s1", f"frames/{ts:010d}.jpg").read_bytes()
            for ts in (0, 1000)
        ]
        assert [base64.b64decode(u.split(",", 1)[1]) for u in urls] == stored
    finally:
        client.__exit__(None, None, None)


def test_vision_events_are_redacted(tmp_path):
    raw = {
        **REPLY["events"][0],
        "entity": "contact Anna Schmidt",
        "before": "Jan Novak",
        "after": 5,
        "fields": {"Name": "Anna", "N": 2},
    }
    content = json.dumps({"events": [raw]})

    def handler(_req):
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    client, _ = wired_client(tmp_path, handler)
    try:
        main_app.state.vision.redactor = Redactor(
            main_app.state.store, Settings(PRESIDIO_ENABLED=True), analyzer=FakeAnalyzer(KNOWN)
        )
        q = "/ingest/frame?session_id=s1&frame_ts="
        client.post(q + "0", content=jpeg())
        client.post(q + "1000", content=jpeg((1, 1, 1)))
        [ev] = wait_for(lambda: client.get("/sessions/s1/events").json())
        assert ev["entity"] == "contact <PERSON_1>" and ev["before"] == "<PERSON_2>"
        assert ev["after"] == "5" and ev["fields"] == {"Name": "<PERSON_3>", "N": "2"}
    finally:
        client.__exit__(None, None, None)


@pytest.fixture(scope="module")
def real_redactor():
    pytest.importorskip("presidio_analyzer")
    spacy = pytest.importorskip("spacy")
    model = Settings().PRESIDIO_SPACY_MODEL
    if not spacy.util.is_package(model):
        pytest.skip(f"spaCy model {model} not installed")
    from apprentice.privacy.redactor import _build_analyzer

    analyzer = _build_analyzer(model, ["AT", "DE", "CZ", "GB", "US"])

    def build(tmp_path):
        store = SessionStore(tmp_path)
        store.create("s1")
        settings = Settings(PRESIDIO_ENABLED=True)
        return Redactor(store, settings, analyzer=analyzer)

    return build


def test_real_presidio_text(tmp_path, real_redactor):
    out = real_redactor(tmp_path).text("s1", "Please call Anna Schmidt at anna.schmidt@example.com")
    assert "<PERSON_1>" in out and "<EMAIL_ADDRESS_1>" in out
    assert "Anna Schmidt" not in out and "example.com" not in out


def test_real_presidio_frame_masking(tmp_path, real_redactor):
    pytest.importorskip("presidio_image_redactor")
    r = real_redactor(tmp_path)
    if r.status() == "text-only":
        pytest.skip("Tesseract not available")
    try:
        font = ImageFont.truetype("arial.ttf", 90)
    except OSError:
        pytest.skip("no TrueType font for rendering")
    img = Image.new("RGB", (900, 200), "white")
    ImageDraw.Draw(img).text((20, 40), "Anna Schmidt", fill="black", font=font)
    src = io.BytesIO()
    img.save(src, format="JPEG")
    out = Image.open(io.BytesIO(r.image("s1", src.getvalue())))
    box = (20, 40, 600, 140)
    ink_before = sum(1 for p in img.crop(box).convert("L").get_flattened_data() if p < 128)
    ink_after = sum(1 for p in out.crop(box).convert("L").get_flattened_data() if p < 128)
    assert ink_after > ink_before * 1.5
