from fastapi.testclient import TestClient

from apprentice.main import app


def test_web_app_on_another_domain_may_call_the_api():
    with TestClient(app) as client:
        r = client.options(
            "/health",
            headers={
                "Origin": "https://apprentice.vercel.app",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] in ("*", "https://apprentice.vercel.app")
