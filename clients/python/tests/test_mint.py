from __future__ import annotations

import copy

import pytest

from lattice_receipt import (
    PAYLOAD_TYPE,
    KeyEntry,
    MintError,
    build_pae,
    create_memory_keyset,
    mint,
    verify,
)

from .conftest import EXAMPLE_PRIVATE_KEY_JWK, positive_vectors


def _vec00() -> dict:
    return dict(positive_vectors()[0][1])


def _v14_body() -> dict:
    vector = _vec00()
    body = copy.deepcopy(vector["body"])
    body["version"] = "lattice-receipt/v1.4"
    body["signatureProfile"] = "dsse-v1"
    return body


def test_build_pae_uses_raw_payload_bytes_and_utf8_lengths() -> None:
    assert build_pae(PAYLOAD_TYPE, b"{}").endswith(b" 2 {}")
    assert build_pae("text/\u03c0", b"\x00\xff") == (
        b"DSSEv1 7 text/\xcf\x80 2 \x00\xff"
    )
    with pytest.raises(TypeError, match="payload_bytes must be bytes"):
        build_pae(PAYLOAD_TYPE, "e30=")  # type: ignore[arg-type]


def test_mint_uses_standard_raw_byte_pae_deterministically() -> None:
    body = _v14_body()
    result = mint(body, EXAMPLE_PRIVATE_KEY_JWK)
    repeated = mint(body, EXAMPLE_PRIVATE_KEY_JWK)

    canonical = bytes.fromhex(result.canonical_hex)
    assert result.pae_hex == build_pae(PAYLOAD_TYPE, canonical).hex()
    assert result.signature_hex == repeated.signature_hex
    assert result.body["version"] == "lattice-receipt/v1.4"
    assert result.body["signatureProfile"] == "dsse-v1"


def test_mint_round_trip_verifies_with_public_key() -> None:
    vector = _vec00()
    body = _v14_body()
    minted = mint(body, EXAMPLE_PRIVATE_KEY_JWK)
    keyset = create_memory_keyset(
        [
            KeyEntry(
                kid=vector["kid"],
                public_key_jwk=vector["publicKeyJwk"],
                state="active",
            )
        ]
    )

    verified = verify(minted.envelope, keyset)
    assert verified.ok is True
    assert verified.body == body
    assert verified.verification_profile == "dsse-v1"
    assert verified.deprecated is False


@pytest.mark.parametrize(
    ("version", "profile"),
    [
        ("lattice-receipt/v1.1", None),
        ("lattice-receipt/v1.2", None),
        ("lattice-receipt/v1.3", None),
        ("lattice-receipt/v1.4", None),
        ("lattice-receipt/v1.4", "other"),
    ],
)
def test_mint_rejects_every_non_current_version_profile_matrix(
    version: str, profile: str | None
) -> None:
    body = _v14_body()
    body["version"] = version
    if profile is None:
        body.pop("signatureProfile", None)
    else:
        body["signatureProfile"] = profile

    with pytest.raises(MintError):
        mint(body, EXAMPLE_PRIVATE_KEY_JWK)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda body: body["usage"].__setitem__("promptTokens", 1.5),
        lambda body: body["usage"].__setitem__("completionTokens", True),
        lambda body: body["route"].__setitem__("attemptNumber", 9_007_199_254_740_992),
        lambda body: body.__setitem__("stepIndex", 1.25),
        lambda body: body["usage"].__setitem__("costUsd", 0.001),
    ],
)
def test_mint_rejects_non_ijson_numeric_fields(mutate) -> None:
    body = _v14_body()
    mutate(body)

    with pytest.raises(MintError):
        mint(body, EXAMPLE_PRIVATE_KEY_JWK)
