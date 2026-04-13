from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class SearchPreset:
    name: str
    query: str
    max_results: int = 20
    project_page_id: str | None = None
    opportunity_types: list[str] = field(default_factory=list)
    capital_band: str = "0-50U"
    certainty: str = "中"
    recommendation_score: int = 3
    status: str = "待核验"

def load_env_file(path: str | Path = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_search_presets(path: str | Path) -> list[SearchPreset]:
    preset_path = Path(path)
    payload = json.loads(preset_path.read_text(encoding="utf-8"))
    return [SearchPreset(**item) for item in payload]
