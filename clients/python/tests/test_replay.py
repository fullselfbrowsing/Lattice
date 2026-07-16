from __future__ import annotations

import copy

import pytest

from lattice_receipt import KeyEntry, VerifyError, create_memory_keyset, mint, output_hash, replay

from .conftest import EXAMPLE_PRIVATE_KEY_JWK, standard_positive_vectors


def _keyset(vector: dict):
    return create_memory_keyset(
        [
            KeyEntry(
                kid=vector["kid"],
                public_key_jwk=vector["publicKeyJwk"],
                state="active",
            )
        ]
    )


def _mint_with_output_hash(outputs):
    vector = standard_positive_vectors()[0][1]
    body = copy.deepcopy(vector["body"])
    body["outputHash"] = output_hash(outputs)
    return vector, mint(body, EXAMPLE_PRIVATE_KEY_JWK)


def test_output_hash_matches_spec_branches() -> None:
    assert output_hash(None) is None
    assert output_hash("hello") == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    assert output_hash(b"hello") == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"


def test_replay_reports_match_after_successful_verification() -> None:
    outputs = "hello"
    vector, minted = _mint_with_output_hash(outputs)

    result = replay(minted.envelope, _keyset(vector), outputs)

    assert result.match is True
    assert result.expected_hash == output_hash(outputs)
    assert result.actual_hash == output_hash(outputs)


def test_replay_reports_mismatch_after_successful_verification() -> None:
    vector, minted = _mint_with_output_hash("hello")

    result = replay(minted.envelope, _keyset(vector), "different")

    assert result.match is False
    assert result.expected_hash == output_hash("hello")
    assert result.actual_hash == output_hash("different")


class UnhashableOutput:
    pass


def test_replay_preserves_verify_first_ordering() -> None:
    vector = standard_positive_vectors()[0][1]
    malformed = {
        "payloadType": "application/json",
        "payload": "not checked first",
        "signatures": [],
    }

    with pytest.raises(VerifyError) as exc:
        replay(malformed, _keyset(vector), UnhashableOutput())

    assert exc.value.kind == "envelope-malformed"
