from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
VECTORS_DIR = REPO_ROOT / "conformance" / "vectors"

EXAMPLE_PRIVATE_KEY_JWK: dict[str, Any] = {
    "key_ops": ["sign"],
    "ext": True,
    "alg": "Ed25519",
    "crv": "Ed25519",
    "d": "U0lQtD0LB_4s1248jIAPfXB6_WDu6HOaaSvALETgFNg",
    "x": "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
    "kty": "OKP",
}


def load_vector(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _profile_vectors(
    profile: str, outcome: str
) -> list[tuple[str, dict[str, Any]]]:
    directory = VECTORS_DIR / profile / outcome
    return [
        (path.name, load_vector(path))
        for path in sorted(directory.glob("*.json"))
    ]


def legacy_positive_vectors() -> list[tuple[str, dict[str, Any]]]:
    return _profile_vectors("legacy", "positive")


def legacy_negative_vectors() -> list[tuple[str, dict[str, Any]]]:
    return _profile_vectors("legacy", "negative")


def standard_positive_vectors() -> list[tuple[str, dict[str, Any]]]:
    return _profile_vectors("standard", "positive")


def standard_negative_vectors() -> list[tuple[str, dict[str, Any]]]:
    return _profile_vectors("standard", "negative")
