"""Copy and restore consistent SQLite snapshots while preserving decimal and audit data."""

import argparse
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import NamedTemporaryFile

from .db import database_path, migrate


def copy_database(source: Path, destination: Path, *, upgrade: bool = False) -> None:
    if not source.is_file():
        raise ValueError(f"Source database does not exist: {source}")
    if source.resolve() == destination.resolve():
        raise ValueError("Source and destination must be different files")
    if any(
        Path(str(destination) + suffix).exists()
        for suffix in ("-wal", "-shm", "-journal")
    ):
        raise ValueError(
            "Close destination database connections and checkpoint its journal before restoring"
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=destination.parent, suffix=".sqlite3", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with (
            closing(
                sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
            ) as original,
            closing(sqlite3.connect(temporary_path)) as snapshot,
        ):
            original.backup(snapshot)
            if snapshot.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Database integrity check failed")
            if snapshot.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise ValueError("Database foreign key check failed")
        if upgrade:
            migrate(temporary_path)
        # Publish only a complete, checked database on the destination filesystem.
        with temporary_path.open("rb") as file:
            os.fsync(file.fileno())
        os.replace(temporary_path, destination)
        directory = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["backup", "restore"])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    if arguments.operation == "restore" and arguments.source is None:
        parser.error("restore requires --source")
    source = arguments.source if arguments.source is not None else database_path()
    copy_database(source, arguments.output, upgrade=arguments.operation == "restore")
    print(f"{arguments.operation.capitalize()} verified at {arguments.output}")


if __name__ == "__main__":
    main()
