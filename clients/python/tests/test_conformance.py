from __future__ import annotations

import base64
import hashlib

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from lattice_receipt import (
    PAYLOAD_TYPE,
    KeyEntry,
    build_pae,
    canonicalize_body,
    create_memory_keyset,
    verify,
)

from .conftest import (
    EXAMPLE_PRIVATE_KEY_JWK,
    VECTORS_DIR,
    negative_vectors,
    positive_vectors,
)


def _sig_hex_to_base64(signature_hex: str) -> str:
    return base64.b64encode(bytes.fromhex(signature_hex)).decode("ascii")


def _set_noncanonical_pad_bits(value: str) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    if value.endswith("=="):
        index = len(value) - 3
    elif value.endswith("="):
        index = len(value) - 2
    else:
        raise AssertionError("test input must contain base64 padding")
    replacement = alphabet[alphabet.index(value[index]) + 1]
    return f"{value[:index]}{replacement}{value[index + 1:]}"


def _legacy_pae(payload_type: str, payload_base64: str) -> bytes:
    return (
        f"DSSEv1 {len(payload_type)} {payload_type} "
        f"{len(payload_base64)} {payload_base64}"
    ).encode("utf-8")


def _private_key() -> Ed25519PrivateKey:
    value = EXAMPLE_PRIVATE_KEY_JWK["d"]
    padding = "=" * ((4 - len(value) % 4) % 4)
    raw = base64.urlsafe_b64decode((value + padding).encode("ascii"))
    return Ed25519PrivateKey.from_private_bytes(raw)


def _signed_envelope(body: dict, *, legacy: bool = False) -> dict:
    canonical = canonicalize_body(body)
    payload = base64.b64encode(canonical).decode("ascii")
    pae = _legacy_pae(PAYLOAD_TYPE, payload) if legacy else build_pae(PAYLOAD_TYPE, canonical)
    signature = _private_key().sign(pae)
    return {
        "payloadType": PAYLOAD_TYPE,
        "payload": payload,
        "signatures": [
            {
                "keyid": body["kid"],
                "sig": base64.b64encode(signature).decode("ascii"),
            }
        ],
    }


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
    assert _legacy_pae(PAYLOAD_TYPE, vector["payloadBase64"]).hex() == vector["paeHex"], name
    assert build_pae(PAYLOAD_TYPE, bytes.fromhex(vector["canonicalBytesHex"])).hex() != vector[
        "paeHex"
    ], name


@pytest.mark.parametrize(("name", "vector"), positive_vectors())
def test_positive_vectors_verify_ok(name: str, vector: dict) -> None:
    result = verify(_envelope_for_vector(vector), _keyset_for_vector(vector))
    assert result.ok is True, name
    assert result.body["kid"] == vector["kid"]
    assert result.verification_profile == "lattice-legacy-base64-pae"
    assert result.deprecated is True


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


def test_strict_policy_rejects_valid_legacy_vector() -> None:
    vector = positive_vectors()[0][1]
    result = verify(
        _envelope_for_vector(vector),
        _keyset_for_vector(vector),
        legacy_policy="reject",
    )
    assert result.ok is False
    assert result.error.kind == "legacy-profile-rejected"


def test_standard_v14_verifies_with_current_profile() -> None:
    vector = positive_vectors()[0][1]
    body = dict(vector["body"])
    body["version"] = "lattice-receipt/v1.4"
    body["signatureProfile"] = "dsse-v1"

    result = verify(
        _signed_envelope(body),
        _keyset_for_vector(vector),
        legacy_policy="reject",
    )
    assert result.ok is True
    assert result.verification_profile == "dsse-v1"
    assert result.deprecated is False


def test_v14_legacy_signature_cannot_fall_back() -> None:
    vector = positive_vectors()[0][1]
    body = dict(vector["body"])
    body["version"] = "lattice-receipt/v1.4"
    body["signatureProfile"] = "dsse-v1"

    result = verify(_signed_envelope(body, legacy=True), _keyset_for_vector(vector))
    assert result.ok is False
    assert result.error.kind == "signature-invalid"


@pytest.mark.parametrize("profile", [None, "other"])
def test_v14_requires_exact_signed_profile(profile: str | None) -> None:
    vector = positive_vectors()[0][1]
    body = dict(vector["body"])
    body["version"] = "lattice-receipt/v1.4"
    if profile is None:
        body.pop("signatureProfile", None)
    else:
        body["signatureProfile"] = profile

    result = verify(_signed_envelope(body), _keyset_for_vector(vector))
    assert result.ok is False
    assert result.error.kind == "signature-profile-mismatch"


def test_historical_body_with_corrected_marker_is_rejected() -> None:
    vector = positive_vectors()[0][1]
    body = dict(vector["body"])
    body["signatureProfile"] = "dsse-v1"

    result = verify(_signed_envelope(body), _keyset_for_vector(vector))
    assert result.ok is False
    assert result.error.kind == "signature-profile-mismatch"


def test_noncanonical_payload_pad_bits_are_rejected_before_verification() -> None:
    vector = positive_vectors()[0][1]
    body = dict(vector["body"])
    for suffix_length in range(3):
        body["transportPad"] = "x" * suffix_length
        envelope = _signed_envelope(body)
        if envelope["payload"].endswith("="):
            break
    else:  # pragma: no cover - three consecutive byte lengths cover every remainder
        raise AssertionError("could not construct padded payload")

    envelope["payload"] = _set_noncanonical_pad_bits(envelope["payload"])
    result = verify(envelope, _keyset_for_vector(vector))

    assert result.ok is False
    assert result.error.kind == "envelope-malformed"
    assert "canonical standard base64" in result.error.message


def test_noncanonical_signature_pad_bits_are_rejected_before_verification() -> None:
    vector = positive_vectors()[0][1]
    envelope = _signed_envelope(dict(vector["body"]))
    envelope["signatures"][0]["sig"] = _set_noncanonical_pad_bits(
        envelope["signatures"][0]["sig"]
    )

    result = verify(envelope, _keyset_for_vector(vector))

    assert result.ok is False
    assert result.error.kind == "envelope-malformed"
    assert "canonical standard base64" in result.error.message


def test_unhashable_version_value_returns_typed_mismatch() -> None:
    vector = positive_vectors()[0][1]
    body = dict(vector["body"])
    body["version"] = []

    result = verify(_signed_envelope(body), _keyset_for_vector(vector))

    assert result.ok is False
    assert result.error.kind == "version-mismatch"
