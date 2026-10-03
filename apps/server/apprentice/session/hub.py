from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self._sockets: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._sockets.setdefault(session_id, []).append(ws)

    def disconnect(self, session_id: str, ws: WebSocket) -> None:
        socks = self._sockets.get(session_id, [])
        if ws in socks:
            socks.remove(ws)
        if not socks:
            self._sockets.pop(session_id, None)

    async def publish(self, session_id: str, type: str, data) -> None:
        for ws in list(self._sockets.get(session_id, [])):
            try:
                await ws.send_json({"type": type, "data": data})
            except Exception:
                self.disconnect(session_id, ws)
