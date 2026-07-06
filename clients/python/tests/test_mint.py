from __future__ import annotations

import copy

import pytest

from lattice_receipt import KeyEntry, MintError, create_memory_keyset, mint, verify

from .conftest import EXAMPLE_PRIVATE_KEY_JWK, positive_vectors


def _vec00() -> dict:
    return dict(positive_vectors()[0][1])


def test_mint_matches_committed_vector0_intermediates_and_signature() -> None:
    vector = _vec00()
    result = mint(vector["body"], EXAMPLE_PRIVATE_KEY_JWK)

    assert result.canonical_hex == vector["canonicalBytesHex"]
    assert result.payload_base64 == vector["payloadBase64"]
    assert result.pae_hex == vector["paeHex"]
    assert result.signature_hex == vector["signatureHex"]


def test_mint_round_trip_verifies_with_public_key() -> None:
    vector = _vec00()
    minted = mint(vector["body"], EXAMPLE_PRIVATE_KEY_JWK)
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
    assert verified.body == vector["body"]


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
    body = copy.deepcopy(_vec00()["body"])
    mutate(body)

    with pytest.raises(MintError):
        mint(body, EXAMPLE_PRIVATE_KEY_JWK)

