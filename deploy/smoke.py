"""Read-only checks for the deployed frontend and its same-origin API."""

import argparse
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Frontend URL, including scheme and port")
    arguments = parser.parse_args()
    base = arguments.url.rstrip("/")

    def get(path: str, *, method: str = "GET", data: bytes | None = None):
        request = Request(
            base + path,
            method=method,
            data=data,
            headers={"Content-Type": "application/json"} if data else {},
        )
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    for attempt in range(45):
        try:
            status, _, body = get("/health")
            if status == 200 and json.loads(body) == {
                "status": "ok",
                "schema_version": 2,
            }:
                break
        except (OSError, URLError, json.JSONDecodeError):
            pass
        time.sleep(1)
    else:
        raise RuntimeError("Frontend proxy and backend did not become healthy")

    status, headers, index = get("/")
    assert status == 200 and b'<div id="root">' in index, "Missing application shell"
    assert "no-cache" in headers.get("Cache-Control", ""), (
        "HTML must refresh on release"
    )
    for path in ("/settings", "/projects", "/projects/new", "/projects/123/edit"):
        status, _, body = get(path)
        assert status == 200 and body == index, f"SPA reload failed: {path}"

    asset = re.search(rb'src="(/assets/[^\"]+\.js)"', index)
    assert asset is not None, "Missing built JavaScript"
    status, headers, _ = get(asset[1].decode())
    assert status == 200 and "immutable" in headers.get("Cache-Control", "")
    assert get("/assets/missing-file.js")[0] == 404, "Missing asset returned the SPA"

    status, _, body = get("/api/settings")
    settings = json.loads(body)
    assert status == 200 and len(settings["mixes"]) == 4, "Settings API unavailable"
    assert get("/api/unknown-route")[0] == 404, "Unknown API returned the SPA"
    status, _, body = get("/api/projects/summaries?status=draft")
    assert status == 200 and isinstance(json.loads(body), list), (
        "API query forwarding failed"
    )

    status, _, body = get(
        "/api/calculations",
        method="POST",
        data=b'{"full_quantity":1,"half_quantity":0,"mix_id":null}',
    )
    assert status == 422 and json.loads(body)["detail"][0]["loc"] == ["body", "mix_id"]
    status, _, body = get("/openapi.json")
    schema = Path(__file__).resolve().parents[1] / "docs/api/openapi.yaml"
    assert status == 200 and json.loads(body) == json.loads(schema.read_text())
    print(
        "PASS: health, SPA reloads, assets/cache, API queries/errors, and OpenAPI parity"
    )


if __name__ == "__main__":
    main()
