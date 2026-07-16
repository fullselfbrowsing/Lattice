from __future__ import annotations

import base64
import copy
import importlib.metadata
import tomllib
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from securesystemslib import exceptions
from securesystemslib.dsse import Envelope
from securesystemslib.signer import SSlibKey

from .conftest import REPO_ROOT, standard_positive_vectors


def _transport_envelope(vector: dict[str, Any]) -> dict[str, Any]:
    return {
        "payloadType": "application/vnd.lattice.receipt+json",
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


def _oracle_key(vector: dict[str, Any]) -> SSlibKey:
    value = vector["publicKeyJwk"]["x"]
    padding = "=" * ((4 - len(value) % 4) % 4)
    public_bytes = base64.urlsafe_b64decode((value + padding).encode("ascii"))
    public_key = Ed25519PublicKey.from_public_bytes(public_bytes)
    return SSlibKey.from_crypto(
        public_key,
        keyid=vector["kid"],
        scheme="ed25519",
    )


def test_upstream_hello_world_pae_bytes() -> None:
    envelope = Envelope(
        payload=b"hello world",
        payload_type="http://example.com/HelloWorld",
        signatures={},
    )
    assert envelope.pae() == (
        b"DSSEv1 29 http://example.com/HelloWorld 11 hello world"
    )


@pytest.mark.parametrize(("name", "vector"), standard_positive_vectors())
def test_upstream_accepts_standard_positive(
    name: str, vector: dict[str, Any]
) -> None:
    transport = copy.deepcopy(_transport_envelope(vector))
    envelope = Envelope.from_dict(transport)
    canonical = bytes.fromhex(vector["canonicalBytesHex"])
    key = _oracle_key(vector)

    assert envelope.payload == canonical, name
    assert envelope.pae().hex() == vector["paeHex"], name
    assert envelope.verify([key], 1) == {vector["kid"]: key}


@pytest.mark.parametrize(("name", "vector"), standard_positive_vectors())
def test_upstream_rejects_one_byte_pae_and_signature_mutations(
    name: str, vector: dict[str, Any]
) -> None:
    envelope = Envelope.from_dict(copy.deepcopy(_transport_envelope(vector)))
    key = _oracle_key(vector)
    signature = envelope.signatures[vector["kid"]]

    mutated_pae = bytearray(envelope.pae())
    mutated_pae[-1] ^= 0x01
    with pytest.raises(exceptions.UnverifiedSignatureError):
        key.verify_signature(signature, bytes(mutated_pae))

    mutated_signature = bytearray(bytes.fromhex(vector["signatureHex"]))
    mutated_signature[0] ^= 0x01
    transport = _transport_envelope(vector)
    transport["signatures"][0]["sig"] = base64.b64encode(
        mutated_signature
    ).decode("ascii")
    bad_envelope = Envelope.from_dict(copy.deepcopy(transport))
    with pytest.raises(exceptions.VerificationError):
        bad_envelope.verify([key], 1)


def test_oracle_is_exactly_pinned_in_test_dependencies_only() -> None:
    pyproject_path = Path(REPO_ROOT) / "clients" / "python" / "pyproject.toml"
    project = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))["project"]
    runtime_dependencies = project["dependencies"]
    test_dependencies = project["optional-dependencies"]["test"]

    assert importlib.metadata.version("securesystemslib") == "1.4.0"
    assert "securesystemslib==1.4.0" in test_dependencies
    assert all("securesystemslib" not in item for item in runtime_dependencies)
