"""Check proxy throttling on an isolated or operator-only loopback endpoint."""

import argparse
import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--credentials-file", type=Path)
    parser.add_argument("--private", action="store_true")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    assert urlsplit(base).hostname in {"127.0.0.1", "localhost", "::1"}, (
        "Forwarded-address fixtures require an operator-only loopback endpoint"
    )
    credentials = (
        json.loads(args.credentials_file.read_text()) if args.credentials_file else None
    )

    def get(path, client, *, authorized=False, sequence=0):
        # Only the final address from the trusted proxy may select the bucket.
        headers = {"X-Forwarded-For": f"198.51.100.{sequence % 200 + 1}, {client}"}
        if credentials:
            password = credentials["password"] if authorized else "wrong-password"
            token = base64.b64encode(
                f"{credentials['username']}:{password}".encode()
            ).decode()
            headers["Authorization"] = "Basic " + token
        try:
            response = urlopen(Request(base + path, headers=headers), timeout=10)
        except HTTPError as error:
            response = error
        with response:
            response.read()
            return response.status

    if args.private:
        with ThreadPoolExecutor(max_workers=12) as pool:
            statuses = list(
                pool.map(
                    lambda i: get("/api/settings", "192.0.2.40", sequence=i), range(400)
                )
            )
        assert set(statuses) == {200}, "Private profile unexpectedly throttled"
        print("PASS: private profile remains unthrottled")
        return

    assert credentials, "The public profile needs a private credentials file"
    paths = ("/", "/api/settings", "/docs", "/assets/missing.js")
    for client, other in (
        ("192.0.2.41", "192.0.2.42"),
        ("2001:db8::41", "2001:db8::42"),
    ):
        with ThreadPoolExecutor(max_workers=12) as pool:
            statuses = list(
                pool.map(
                    lambda i, client=client: get(
                        paths[i % len(paths)], client, sequence=i
                    ),
                    range(400),
                )
            )
        assert set(statuses) == {401, 429}, (
            "Bad logins must be rejected and share one budget across routes/headers",
            {status: statuses.count(status) for status in set(statuses)},
        )
        assert get("/api/settings", other, authorized=True) == 200, (
            "A different client inherited the exhausted budget"
        )
        assert get("/health", client) == 200, "Throttling broke health probes"
        time.sleep(1)
        assert get("/api/settings", client, authorized=True) == 200, (
            "The client did not recover when its rate dropped"
        )
    print(
        "PASS: bad-login throttling, shared route budget, IPv4/IPv6 client isolation, "
        "forwarded-chain handling, health exemption, and recovery"
    )


if __name__ == "__main__":
    main()
