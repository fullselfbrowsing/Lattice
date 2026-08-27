from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from lattice_receipt import (
    PAYLOAD_TYPE,
    KeyEntry,
    build_pae,
    canonicalize_body,
    create_memory_keyset,
    verify,
)

from .conftest import (
    VECTORS_DIR,
    legacy_negative_vectors,
    legacy_positive_vectors,
    standard_negative_vectors,
    standard_positive_vectors,
)

FROZEN_LEGACY_MANIFEST_HASH = (
    "4b3b7c7558298d7286de66a25f8ffa55bf5c7bbf532bbbd67ec227fbc3af0aca"
)
MANIFEST_LINE = re.compile(r"^([0-9a-f]{64})  (.+)$")


def _manifest_entries(path: Path) -> list[tuple[str, str]]:
    content = path.read_text(encoding="utf-8")
    assert content.endswith("\n") and "\r" not in content
    entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    for line in content[:-1].split("\n"):
        match = MANIFEST_LINE.fullmatch(line)
        assert match is not None, line
        digest, relative = match.groups()
        assert relative not in seen, relative
        assert "\\" not in relative
        assert not relative.startswith("/")
        assert all(part not in ("", ".", "..") for part in relative.split("/"))
        seen.add(relative)
        entries.append((digest, relative))
    assert [relative for _, relative in entries] == sorted(seen)
    return entries


def _envelope_for_vector(vector: dict[str, Any]) -> dict[str, Any]:
    if "envelope" in vector:
        return vector["envelope"]
    return {
        "payloadType": PAYLOAD_TYPE,
        "payload": vector["payloadBase64"],
        "signatures": [
            {
                "keyid": vector["kid"],
                "sig": base64.b64encode(
                    bytes.fromhex(vector["signatureHex"])
                ).decode("ascii"),
            }
        ],
    }


def _keyset_for_vector(vector: dict[str, Any]):
    if vector["expectedResult"] == "key-not-found":
        return create_memory_keyset([])
    return create_memory_keyset(
        [
            KeyEntry(
                kid=vector["kid"],
                public_key_jwk=vector["publicKeyJwk"],
                state=vector.get("verifyKeyState", "active"),
            )
        ]
    )


def _legacy_pae(payload_type: str, payload_base64: str) -> bytes:
    type_bytes = payload_type.encode("utf-8")
    transport_bytes = payload_base64.encode("utf-8")
    return b"".join(
        [
            b"DSSEv1 ",
            str(len(type_bytes)).encode("ascii"),
            b" ",
            type_bytes,
            b" ",
            str(len(transport_bytes)).encode("ascii"),
            b" ",
            transport_bytes,
        ]
    )


def _public_key(vector: dict[str, Any]) -> Ed25519PublicKey:
    value = vector["publicKeyJwk"]["x"]
    padding = "=" * ((4 - len(value) % 4) % 4)
    raw = base64.urlsafe_b64decode((value + padding).encode("ascii"))
    return Ed25519PublicKey.from_public_bytes(raw)


def test_aggregate_and_nested_manifests_have_exact_coverage() -> None:
    aggregate = _manifest_entries(VECTORS_DIR / "MANIFEST.sha256")
    actual = sorted(
        [
            path.relative_to(VECTORS_DIR).as_posix()
            for profile in ("legacy", "standard")
            for path in (VECTORS_DIR / profile).rglob("*.json")
        ]
        + ["legacy/MANIFEST.sha256"]
    )
    assert [relative for _, relative in aggregate] == actual
    assert len(aggregate) == 28
    for expected, relative in aggregate:
        path = VECTORS_DIR / relative
        assert not path.is_symlink()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected

    nested_path = VECTORS_DIR / "legacy" / "MANIFEST.sha256"
    nested = _manifest_entries(nested_path)
    nested_actual = sorted(
        path.relative_to(VECTORS_DIR / "legacy").as_posix()
        for path in (VECTORS_DIR / "legacy").rglob("*.json")
    )
    assert [relative for _, relative in nested] == nested_actual
    assert hashlib.sha256(nested_path.read_bytes()).hexdigest() == (
        FROZEN_LEGACY_MANIFEST_HASH
    )
    for expected, relative in nested:
        assert hashlib.sha256(
            (VECTORS_DIR / "legacy" / relative).read_bytes()
        ).hexdigest() == expected


def test_retired_flat_corpus_paths_have_no_json() -> None:
    for outcome in ("positive", "negative"):
        assert list((VECTORS_DIR / outcome).glob("*.json")) == []


@pytest.mark.parametrize(("name", "vector"), legacy_positive_vectors())
def test_legacy_positive_profile(name: str, vector: dict[str, Any]) -> None:
    canonical = canonicalize_body(vector["body"])
    historical_pae = _legacy_pae(PAYLOAD_TYPE, vector["payloadBase64"])
    assert canonical.hex() == vector["canonicalBytesHex"], name
    assert historical_pae.hex() == vector["paeHex"], name
    _public_key(vector).verify(bytes.fromhex(vector["signatureHex"]), historical_pae)

    allowed = verify(_envelope_for_vector(vector), _keyset_for_vector(vector))
    assert allowed.ok is True, name
    assert allowed.body["kid"] == vector["kid"]
    assert allowed.verification_profile == "lattice-legacy-base64-pae"
    assert allowed.deprecated is True

    rejected = verify(
        _envelope_for_vector(vector),
        _keyset_for_vector(vector),
        legacy_policy="reject",
    )
    assert rejected.ok is False, name
    assert rejected.error.kind == "legacy-profile-rejected"


@pytest.mark.parametrize(("name", "vector"), standard_positive_vectors())
def test_standard_positive_profile(name: str, vector: dict[str, Any]) -> None:
    assert vector["corpusProfile"] == "standard"
    assert vector["schema"] == "spec/schema/v1.4.json"
    assert vector["expectedSchemaResult"] == "valid"
    assert vector["expectedVerificationProfile"] == "dsse-v1"
    assert vector["expectedDeprecated"] is False
    assert vector["expectedResult"] == "ok"

    canonical = canonicalize_body(vector["body"])
    pae = build_pae(PAYLOAD_TYPE, canonical)
    assert canonical.hex() == vector["canonicalBytesHex"], name
    assert base64.b64decode(vector["payloadBase64"], validate=True) == canonical
    assert pae.hex() == vector["paeHex"], name
    _public_key(vector).verify(bytes.fromhex(vector["signatureHex"]), pae)
    expected_cid = f"sha256:{hashlib.sha256(canonical).hexdigest()}"
    assert expected_cid.startswith("sha256:") and len(expected_cid) == 71

    result = verify(
        _envelope_for_vector(vector),
        _keyset_for_vector(vector),
        legacy_policy="reject",
    )
    assert result.ok is True, name
    assert result.verification_profile == "dsse-v1"
    assert result.deprecated is False
    assert result.body["version"] == "lattice-receipt/v1.4"
    assert result.body["signatureProfile"] == "dsse-v1"
    assert result.body["kid"] == vector["kid"]


@pytest.mark.parametrize(("name", "vector"), legacy_negative_vectors())
def test_legacy_negative_exact_error(name: str, vector: dict[str, Any]) -> None:
    result = verify(_envelope_for_vector(vector), _keyset_for_vector(vector))
    assert result.ok is False, name
    assert result.error.kind == vector["expectedResult"]


@pytest.mark.parametrize(("name", "vector"), standard_negative_vectors())
def test_standard_negative_exact_error(name: str, vector: dict[str, Any]) -> None:
    assert vector["corpusProfile"] == "standard"
    assert vector["expectedResult"] != "ok"
    assert vector["expectedVerificationProfile"] is None
    assert vector["expectedDeprecated"] is None
    result = verify(
        _envelope_for_vector(vector),
        _keyset_for_vector(vector),
        legacy_policy="reject",
    )
    assert result.ok is False, name
    assert result.error.kind == vector["expectedResult"]


def test_v14_historical_pae_never_falls_back() -> None:
    vector = next(
        vector
        for _, vector in standard_negative_vectors()
        if vector["adversarialAxis"] == "legacy-pae-on-v1.4"
    )
    for policy in ("allow", "reject"):
        result = verify(
            _envelope_for_vector(vector),
            _keyset_for_vector(vector),
            legacy_policy=policy,
        )
        assert result.ok is False
        assert result.error.kind == "signature-invalid"


@pytest.mark.parametrize(
    "axis",
    ["payload-base64-noncanonical", "signature-base64-noncanonical"],
)
def test_noncanonical_base64_is_envelope_malformed(axis: str) -> None:
    vector = next(
        vector
        for _, vector in standard_negative_vectors()
        if vector["adversarialAxis"] == axis
    )
    result = verify(_envelope_for_vector(vector), _keyset_for_vector(vector))
    assert result.ok is False
    assert result.error.kind == "envelope-malformed"


class ExplodingKeySet:
    def lookup(self, kid: str):  # pragma: no cover - must not be reached
        raise AssertionError(f"lookup should not run for downgrade vector {kid}")


@pytest.mark.parametrize(
    ("name", "vector"),
    [
        item
        for item in legacy_negative_vectors()
        if item[1]["expectedResult"] == "schema-version-too-low"
    ],
)
def test_downgrade_defense_precedes_key_lookup(
    name: str, vector: dict[str, Any]
) -> None:
    result = verify(_envelope_for_vector(vector), ExplodingKeySet())
    assert result.ok is False, name
    assert result.error.kind == "schema-version-too-low"
