"""Read-only checks for the deployed frontend and its same-origin API."""

import argparse
import base64
import gzip
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Frontend URL, including scheme and port")
    parser.add_argument(
        "--credentials-file",
        type=Path,
        help="Private JSON file with username and password",
    )
    arguments = parser.parse_args()
    base = arguments.url.rstrip("/")
    base_path = urlsplit(base).path
    credentials = (
        json.loads(arguments.credentials_file.read_text())
        if arguments.credentials_file
        else None
    )
    authorization = None
    if credentials:
        authorization = (
            "Basic "
            + base64.b64encode(
                f"{credentials['username']}:{credentials['password']}".encode()
            ).decode()
        )

    def get(
        path: str,
        *,
        method: str = "GET",
        data: bytes | None = None,
        authenticated: bool = True,
        invalid_credentials: bool = False,
        accept_encoding: str = "identity",
    ):
        headers = {"Content-Type": "application/json"} if data else {}
        headers["Accept-Encoding"] = accept_encoding
        if authenticated and authorization:
            headers["Authorization"] = authorization
        if invalid_credentials:
            headers["Authorization"] = "Basic aW52YWxpZDppbnZhbGlk"
        request = Request(
            base + path,
            method=method,
            data=data,
            headers=headers,
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

    if credentials:
        for path in ("/", "/api/settings", "/docs", "/openapi.json"):
            assert get(path, authenticated=False)[0] == 401, (
                f"Public route lacks its login gate: {path}"
            )
        assert get("/api/settings", invalid_credentials=True)[0] == 401, (
            "Invalid login was accepted"
        )

    status, headers, index = get("/")
    assert status == 200 and b'<div id="root">' in index, "Missing application shell"
    assert "no-cache" in headers.get("Cache-Control", ""), (
        "HTML must refresh on release"
    )
    for path in ("/settings", "/projects", "/projects/new", "/projects/123/edit"):
        status, _, body = get(path)
        assert status == 200 and body == index, f"SPA reload failed: {path}"

    asset = re.search(rb'src="(/[^\"]*assets/[^\"]+\.js)"', index)
    assert asset is not None, "Missing built JavaScript"
    asset_path = asset[1].decode()
    assert asset_path.startswith(base_path + "/assets/"), (
        "Built asset prefix differs from deployment URL"
    )
    if credentials:
        assert get(asset_path[len(base_path) :], authenticated=False)[0] == 401
    status, headers, script = get(asset_path[len(base_path) :])
    assert status == 200 and "immutable" in headers.get("Cache-Control", "")
    status, headers, compressed = get(
        asset_path[len(base_path) :], accept_encoding="gzip"
    )
    assert status == 200 and headers.get("Content-Encoding") == "gzip", (
        "Built JavaScript must be compressed for public delivery"
    )
    assert "accept-encoding" in headers.get("Vary", "").lower()
    assert gzip.decompress(compressed) == script, "Compressed asset differs"
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
    actual_schema = json.loads(body)
    if base_path:
        assert actual_schema.pop("servers", None) == [{"url": base_path}]
        assert (base_path + "/openapi.json").encode() in get("/docs")[2]
    assert status == 200 and actual_schema == json.loads(schema.read_text())
    print(
        "PASS: health, SPA reloads, assets/cache, API queries/errors, and OpenAPI parity"
    )


if __name__ == "__main__":
    main()
