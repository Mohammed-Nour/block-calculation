"""Export the live API schema using JSON syntax, which is also valid YAML."""

import argparse
import json
from pathlib import Path

from .app import app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    content = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
    if arguments.check:
        if arguments.output.read_text() != content:
            parser.exit(1, "OpenAPI snapshot differs from the application schema\n")
    else:
        arguments.output.write_text(content)


if __name__ == "__main__":
    main()
