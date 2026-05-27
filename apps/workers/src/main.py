from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class WorkerRuntime:
    name: str
    database_url: str | None
    redis_url: str | None
    started_at: str


def create_runtime() -> WorkerRuntime:
    return WorkerRuntime(
        name="probis-workers",
        database_url=os.getenv("DATABASE_URL"),
        redis_url=os.getenv("REDIS_URL"),
        started_at=datetime.now(UTC).isoformat(),
    )


def main() -> None:
    runtime = create_runtime()
    print(json.dumps({"level": "info", "event": "worker.ready", **asdict(runtime)}))


if __name__ == "__main__":
    main()
