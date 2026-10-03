"""PII redaction (T-401): Presidio over text and stored frames, typed placeholders per session."""

import hashlib
import io
import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Any

from apprentice.session.store import SessionStore
from apprentice.settings import Settings

log = logging.getLogger(__name__)

MAP_FILE = "pii_map.json"
_PLACEHOLDER = re.compile(r"<[A-Z_]+_\d+>")


def _norm(value: str) -> str:
    return " ".join(value.split()).casefold()


def _key(entity_type: str, value: str) -> str:
    return hashlib.sha256(f"{entity_type}:{_norm(value)}".encode()).hexdigest()


def _tesseract_available(cmd: str) -> bool:
    import pytesseract

    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    try:
        pytesseract.get_tesseract_version()
    except pytesseract.TesseractNotFoundError:
        return False
    return True


def _build_analyzer(spacy_model: str, phone_regions: list[str]) -> Any:
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_analyzer.predefined_recognizers import PhoneRecognizer

    nlp = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": spacy_model}],
        }
    ).create_engine()
    analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en"])
    analyzer.registry.remove_recognizer("PhoneRecognizer")
    analyzer.registry.add_recognizer(PhoneRecognizer(supported_regions=phone_regions))
    return analyzer


def _build_image_engine(analyzer: Any) -> Any:
    from presidio_image_redactor import ImageAnalyzerEngine, ImageRedactorEngine

    return ImageRedactorEngine(ImageAnalyzerEngine(analyzer_engine=analyzer))


class Redactor:
    """Replaces PII with `<TYPE_n>` placeholders. The same value in the same session always maps
    to the same placeholder; the mapping on disk is keyed by a hash, never the raw value."""

    def __init__(
        self,
        store: SessionStore,
        settings: Settings,
        analyzer: Any = None,
        image_engine: Any = None,
    ):
        self.store = store
        self.enabled = settings.PRESIDIO_ENABLED
        self.spacy_model = settings.PRESIDIO_SPACY_MODEL
        self.entities = [e.strip() for e in settings.PRESIDIO_ENTITIES.split(",") if e.strip()]
        self.threshold = settings.PRESIDIO_SCORE_THRESHOLD
        self.phone_regions = [
            r.strip() for r in settings.PRESIDIO_PHONE_REGIONS.split(",") if r.strip()
        ]
        self.tesseract_cmd = settings.TESSERACT_CMD
        self._analyzer = analyzer
        self._image_engine = image_engine
        self._ocr_ok: bool | None = True if image_engine is not None else None
        self._maps: dict[str, dict[str, str]] = {}
        self._map_lock = threading.Lock()
        self._build_lock = threading.Lock()

    def status(self) -> str:
        if not self.enabled:
            return "off"
        return "on" if self._ocr_available() else "text-only"

    def warm_up(self) -> None:
        """Load spaCy and probe Tesseract at startup instead of on the first request."""
        if self.enabled:
            self._get_analyzer()
            self._ocr_available()

    def text(self, session_id: str, s: str | None) -> str | None:
        if not self.enabled or not s:
            return s
        found = self._get_analyzer().analyze(
            text=s, language="en", entities=self.entities, score_threshold=self.threshold
        )
        taken = [m.span() for m in _PLACEHOLDER.finditer(s)]
        spans = []
        for r in sorted(found, key=lambda r: (-r.score, -(r.end - r.start), r.start)):
            if not any(r.start < end and start < r.end for start, end in taken):
                taken.append((r.start, r.end))
                spans.append(r)
        spans.sort(key=lambda r: r.start)
        names = [self._placeholder(session_id, r.entity_type, s[r.start : r.end]) for r in spans]
        for r, name in reversed(list(zip(spans, names, strict=True))):
            s = s[: r.start] + name + s[r.end :]
        return s

    def event(self, session_id: str, d: dict) -> dict:
        if not self.enabled:
            return d
        out = dict(d)
        for name in ("entity", "before", "after"):
            if isinstance(out.get(name), str):
                out[name] = self.text(session_id, out[name])
        if isinstance(out.get("fields"), dict):
            out["fields"] = {
                label: self.text(session_id, v) if isinstance(v, str) else v
                for label, v in out["fields"].items()
            }
        return out

    def image(self, session_id: str, data: bytes) -> bytes:
        if not self.enabled or not self._ocr_available():
            return data
        from PIL import Image

        with Image.open(io.BytesIO(data)) as img:
            redacted = self._get_image_engine().redact(
                img.convert("RGB"),
                fill=(0, 0, 0),
                entities=self.entities,
                score_threshold=self.threshold,
            )
        out = io.BytesIO()
        redacted.convert("RGB").save(out, format="JPEG")
        return out.getvalue()

    def _ocr_available(self) -> bool:
        with self._build_lock:
            if self._ocr_ok is None:
                self._ocr_ok = _tesseract_available(self.tesseract_cmd)
                if not self._ocr_ok:
                    log.warning("Tesseract not found: frames are stored unredacted, text only")
            return self._ocr_ok

    def _get_analyzer(self) -> Any:
        with self._build_lock:
            if self._analyzer is None:
                self._analyzer = _build_analyzer(self.spacy_model, self.phone_regions)
            return self._analyzer

    def _get_image_engine(self) -> Any:
        analyzer = self._get_analyzer()
        with self._build_lock:
            if self._image_engine is None:
                self._image_engine = _build_image_engine(analyzer)
            return self._image_engine

    def _placeholder(self, session_id: str, entity_type: str, value: str) -> str:
        key = _key(entity_type, value)
        with self._map_lock:
            mapping = self._load(session_id)
            if key not in mapping:
                prefix = f"<{entity_type}_"
                n = 1 + sum(1 for p in mapping.values() if p.startswith(prefix))
                mapping[key] = f"{prefix}{n}>"
                self._save(session_id, mapping)
            return mapping[key]

    def _path(self, session_id: str) -> Path:
        return self.store.session_dir(session_id) / MAP_FILE

    def _load(self, session_id: str) -> dict[str, str]:
        if session_id not in self._maps:
            path = self._path(session_id)
            self._maps[session_id] = (
                json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            )
        return self._maps[session_id]

    def _save(self, session_id: str, mapping: dict[str, str]) -> None:
        path = self._path(session_id)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(mapping), encoding="utf-8")
        os.replace(tmp, path)
