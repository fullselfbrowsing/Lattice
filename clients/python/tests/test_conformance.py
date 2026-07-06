from __future__ import annotations

import base64
import hashlib

import pytest

from lattice_receipt import (
    PAYLOAD_TYPE,
    KeyEntry,
    build_pae,
    canonicalize_body,
    create_memory_keyset,
    verify,
)

from .conftest import VECTORS_DIR, negative_vectors, positive_vectors


def _sig_hex_to_base64(signature_hex: str) -> str:
    return base64.b64encode(bytes.fromhex(signature_hex)).decode("ascii")


def _envelope_for_vector(vector: dict) -> dict:
    if "envelope" in vector:
        return vector["envelope"]
    return {
        "payloadType": PAYLOAD_TYPE,
        "payload": vector["payloadBase64"],
        "signatures": [
            {
                "keyid": vector["kid"],
                "sig": _sig_hex_to_base64(vector["signatureHex"]),
            }
        ],
    }


def _keyset_for_vector(vector: dict):
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


def test_manifest_hashes_match_committed_vector_files() -> None:
    for line in (VECTORS_DIR / "MANIFEST.sha256").read_text(encoding="utf-8").strip().splitlines():
        expected, rel_path = line.split("  ", 1)
        actual = hashlib.sha256((VECTORS_DIR / rel_path).read_bytes()).hexdigest()
        assert actual == expected


@pytest.mark.parametrize(("name", "vector"), positive_vectors())
def test_positive_vectors_rederive_canonical_bytes_and_pae(name: str, vector: dict) -> None:
    assert canonicalize_body(vector["body"]).hex() == vector["canonicalBytesHex"], name
    assert build_pae(PAYLOAD_TYPE, vector["payloadBase64"]).hex() == vector["paeHex"], name


@pytest.mark.parametrize(("name", "vector"), positive_vectors())
def test_positive_vectors_verify_ok(name: str, vector: dict) -> None:
    result = verify(_envelope_for_vector(vector), _keyset_for_vector(vector))
    assert result.ok is True, name
    assert result.body["kid"] == vector["kid"]


@pytest.mark.parametrize(("name", "vector"), negative_vectors())
def test_negative_vectors_return_exact_error_kind(name: str, vector: dict) -> None:
    result = verify(_envelope_for_vector(vector), _keyset_for_vector(vector))
    assert result.ok is False, name
    assert result.error.kind == vector["expectedResult"]


class ExplodingKeySet:
    def lookup(self, kid: str):  # pragma: no cover - should never be reached
        raise AssertionError(f"lookup should not run for downgrade vector {kid}")


@pytest.mark.parametrize(
    ("name", "vector"),
    [
        item
        for item in negative_vectors()
        if item[1]["expectedResult"] == "schema-version-too-low"
    ],
)
def test_downgrade_defense_runs_before_key_lookup(name: str, vector: dict) -> None:
    result = verify(_envelope_for_vector(vector), ExplodingKeySet())
    assert result.ok is False, name
    assert result.error.kind == "schema-version-too-low"

