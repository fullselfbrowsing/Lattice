from __future__ import annotations

import base64
import copy
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Literal, Mapping, Protocol

import rfc8785
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

PAYLOAD_TYPE = "application/vnd.lattice.receipt+json"
SAFE_INTEGER_MAX = 9_007_199_254_740_991

VerifyErrorKind = Literal[
    "key-not-found",
    "key-revoked",
    "canonicalization-mismatch",
    "signature-invalid",
    "envelope-malformed",
    "version-mismatch",
    "schema-version-too-low",
    "signature-profile-mismatch",
    "legacy-profile-rejected",
]
KeyState = Literal["active", "retired", "revoked"]
ReceiptSignatureProfile = Literal["dsse-v1"]
VerificationProfile = Literal["dsse-v1", "lattice-legacy-base64-pae"]
LegacyReceiptPolicy = Literal["allow", "reject"]

_ACCEPTED_OR_TOO_LOW_VERSIONS = {
    "lattice-receipt/v1",
    "lattice-receipt/v1.1",
    "lattice-receipt/v1.2",
    "lattice-receipt/v1.3",
    "lattice-receipt/v1.4",
}


class VerifyError(Exception):
    def __init__(self, kind: VerifyErrorKind, message: str) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message

    def __str__(self) -> str:
        return f"{self.kind}: {self.message}"


class MintError(ValueError):
    pass


@dataclass(frozen=True)
class VerifyOk:
    body: dict[str, Any]
    key_state: KeyState
    verification_profile: VerificationProfile
    deprecated: bool
    ok: Literal[True] = True


@dataclass(frozen=True)
class VerifyFail:
    error: VerifyError
    ok: Literal[False] = False


VerifyResult = VerifyOk | VerifyFail


@dataclass(frozen=True)
class KeyEntry:
    kid: str
    public_key_jwk: Mapping[str, Any]
    state: KeyState = "active"


class KeySet(Protocol):
    def lookup(self, kid: str) -> KeyEntry | Mapping[str, Any] | None:
        ...


class MemoryKeySet:
    def __init__(self, entries: list[KeyEntry] | tuple[KeyEntry, ...]) -> None:
        self._by_kid = {entry.kid: entry for entry in entries}

    def lookup(self, kid: str) -> KeyEntry | None:
        return self._by_kid.get(kid)


@dataclass(frozen=True)
class ReplayResult:
    match: bool
    expected_hash: str | None
    actual_hash: str | None
    verification: VerifyOk


@dataclass(frozen=True)
class MintResult:
    envelope: dict[str, Any]
    canonical_hex: str
    payload_base64: str
    pae_hex: str
    signature_hex: str
    body: dict[str, Any]


@dataclass(frozen=True)
class _DecodedSignature:
    keyid: str
    sig: bytes


@dataclass(frozen=True)
class _DecodedEnvelope:
    payload_base64: str
    payload_bytes: bytes
    signatures: list[_DecodedSignature]


def create_memory_keyset(entries: list[KeyEntry] | tuple[KeyEntry, ...]) -> MemoryKeySet:
    return MemoryKeySet(entries)


def canonicalize_body(body: Mapping[str, Any]) -> bytes:
    return rfc8785.dumps(body)


def build_pae(payload_type: str, payload_bytes: bytes) -> bytes:
    if not isinstance(payload_bytes, bytes):
        raise TypeError("payload_bytes must be bytes")
    payload_type_bytes = payload_type.encode("utf-8")
    return b"".join(
        [
            b"DSSEv1 ",
            str(len(payload_type_bytes)).encode("ascii"),
            b" ",
            payload_type_bytes,
            b" ",
            str(len(payload_bytes)).encode("ascii"),
            b" ",
            payload_bytes,
        ]
    )


def verify(
    envelope: Mapping[str, Any],
    keyset: KeySet | Mapping[str, Any],
    *,
    legacy_policy: LegacyReceiptPolicy = "allow",
) -> VerifyResult:
    try:
        decoded = _decode_envelope(envelope)
    except Exception as exc:
        return _fail("envelope-malformed", str(exc))

    if len(decoded.signatures) == 0:
        return _fail("envelope-malformed", "envelope has no signatures")

    try:
        parsed = json.loads(decoded.payload_bytes.decode("utf-8"))
    except Exception as exc:
        return _fail("envelope-malformed", f"payload is not valid JSON: {exc}")

    if not _is_receipt_body_shape(parsed):
        return _fail(
            "version-mismatch",
            "receipt body is not a supported lattice receipt shape",
        )

    body = parsed
    if "version" not in body or body.get("version") == "lattice-receipt/v1":
        return _fail(
            "schema-version-too-low",
            "Receipt body.version must be lattice-receipt/v1.1 or newer - v1 receipts are not accepted (CRYPTO-01).",
        )

    if not _has_valid_signature_profile(body):
        if body.get("version") == "lattice-receipt/v1.4":
            return _fail(
                "signature-profile-mismatch",
                'lattice-receipt/v1.4 requires signatureProfile "dsse-v1"',
            )
        return _fail(
            "signature-profile-mismatch",
            "historical receipt versions must not declare signatureProfile",
        )

    first_sig = decoded.signatures[0]
    entry = _lookup_key(keyset, first_sig.keyid)
    if entry is None:
        return _fail("key-not-found", f'keySet has no entry for kid "{first_sig.keyid}"')

    entry_kid = _entry_kid(entry)
    entry_state = _entry_state(entry)
    if entry_state == "revoked":
        return _fail("key-revoked", f'key "{entry_kid}" is revoked')

    try:
        re_canonical = canonicalize_body(body)
    except Exception as exc:
        return _fail("canonicalization-mismatch", f"receipt body is not canonicalizable: {exc}")

    if re_canonical != decoded.payload_bytes:
        return _fail(
            "canonicalization-mismatch",
            "re-canonicalized body does not match signed payload bytes",
        )

    standard_pae = build_pae(PAYLOAD_TYPE, decoded.payload_bytes)
    if _verify_ed25519(_entry_public_key_jwk(entry), standard_pae, first_sig.sig):
        mismatch = _kid_mismatch(body, entry_kid)
        if mismatch is not None:
            return mismatch
        return VerifyOk(
            body=body,
            key_state=entry_state,
            verification_profile="dsse-v1",
            deprecated=False,
        )

    if body.get("version") == "lattice-receipt/v1.4":
        return _fail("signature-invalid", "Ed25519 signature does not verify")

    if legacy_policy == "reject":
        return _fail(
            "legacy-profile-rejected",
            "standard DSSE verification failed and legacy receipt verification is disabled",
        )

    legacy_pae = _build_legacy_pae_for_verification(
        PAYLOAD_TYPE, decoded.payload_base64
    )
    if not _verify_ed25519(
        _entry_public_key_jwk(entry), legacy_pae, first_sig.sig
    ):
        return _fail("signature-invalid", "Ed25519 signature does not verify")

    mismatch = _kid_mismatch(body, entry_kid)
    if mismatch is not None:
        return mismatch
    return VerifyOk(
        body=body,
        key_state=entry_state,
        verification_profile="lattice-legacy-base64-pae",
        deprecated=True,
    )


def replay(
    envelope: Mapping[str, Any],
    keyset: KeySet | Mapping[str, Any],
    outputs: Any,
) -> ReplayResult:
    verification = verify(envelope, keyset)
    if not verification.ok:
        raise verification.error

    expected = verification.body.get("outputHash")
    actual = output_hash(outputs)
    return ReplayResult(
        match=expected == actual,
        expected_hash=expected,
        actual_hash=actual,
        verification=verification,
    )


def output_hash(outputs: Any) -> str | None:
    if outputs is None:
        return None
    if isinstance(outputs, str):
        data = outputs.encode("utf-8")
    elif isinstance(outputs, bytes):
        data = outputs
    elif isinstance(outputs, bytearray):
        data = bytes(outputs)
    elif isinstance(outputs, memoryview):
        data = outputs.tobytes()
    else:
        serialized = json.dumps(
            outputs,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
        data = serialized.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def mint(body: Mapping[str, Any], private_key_jwk: Mapping[str, Any]) -> MintResult:
    body_copy = copy.deepcopy(dict(body))
    _validate_mint_body(body_copy)

    canonical = canonicalize_body(body_copy)
    payload_base64 = _base64_encode(canonical)
    pae = build_pae(PAYLOAD_TYPE, canonical)
    private_key = _private_key_from_jwk(private_key_jwk)
    signature = private_key.sign(pae)
    signature_base64 = _base64_encode(signature)

    envelope = {
        "payloadType": PAYLOAD_TYPE,
        "payload": payload_base64,
        "signatures": [
            {
                "keyid": body_copy["kid"],
                "sig": signature_base64,
            }
        ],
    }
    return MintResult(
        envelope=envelope,
        canonical_hex=canonical.hex(),
        payload_base64=payload_base64,
        pae_hex=pae.hex(),
        signature_hex=signature.hex(),
        body=body_copy,
    )


def _fail(kind: VerifyErrorKind, message: str) -> VerifyFail:
    return VerifyFail(VerifyError(kind, message))


def _decode_envelope(envelope: Mapping[str, Any]) -> _DecodedEnvelope:
    if not isinstance(envelope, Mapping):
        raise ValueError("envelope must be an object")
    if envelope.get("payloadType") != PAYLOAD_TYPE:
        raise ValueError(
            f'envelope payloadType mismatch: expected "{PAYLOAD_TYPE}" got "{envelope.get("payloadType")}"'
        )
    payload = envelope.get("payload")
    signatures = envelope.get("signatures")
    if not isinstance(payload, str):
        raise ValueError("envelope payload must be a string")
    if not isinstance(signatures, list):
        raise ValueError("envelope signatures must be an array")

    payload_bytes = _base64_decode(payload)
    decoded_signatures: list[_DecodedSignature] = []
    for entry in signatures:
        if not isinstance(entry, Mapping):
            raise ValueError("envelope signature entry must be an object")
        keyid = entry.get("keyid")
        sig = entry.get("sig")
        if not isinstance(keyid, str):
            raise ValueError("envelope signature keyid must be a string")
        if not isinstance(sig, str):
            raise ValueError("envelope signature sig must be a string")
        decoded_signatures.append(_DecodedSignature(keyid=keyid, sig=_base64_decode(sig)))
    return _DecodedEnvelope(
        payload_base64=payload,
        payload_bytes=payload_bytes,
        signatures=decoded_signatures,
    )


def _is_receipt_body_shape(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if "version" in value and value["version"] not in _ACCEPTED_OR_TOO_LOW_VERSIONS:
        return False
    required_strings = [
        "receiptId",
        "runId",
        "issuedAt",
        "kid",
        "contractVerdict",
        "redactionPolicyId",
    ]
    if any(not isinstance(value.get(key), str) for key in required_strings):
        return False
    if not isinstance(value.get("model"), dict):
        return False
    if not isinstance(value.get("route"), dict):
        return False
    if not isinstance(value.get("usage"), dict):
        return False
    if not isinstance(value.get("inputHashes"), list):
        return False
    if not isinstance(value.get("redactions"), list):
        return False
    return True


def _has_valid_signature_profile(body: Mapping[str, Any]) -> bool:
    if body.get("version") == "lattice-receipt/v1.4":
        return body.get("signatureProfile") == "dsse-v1"
    return "signatureProfile" not in body


def _build_legacy_pae_for_verification(
    payload_type: str, payload_base64: str
) -> bytes:
    return (
        f"DSSEv1 {len(payload_type)} {payload_type} "
        f"{len(payload_base64)} {payload_base64}"
    ).encode("utf-8")


def _kid_mismatch(
    body: Mapping[str, Any], entry_kid: str
) -> VerifyFail | None:
    if body.get("kid") == entry_kid:
        return None
    return _fail(
        "signature-invalid",
        f'body.kid "{body.get("kid")}" does not match envelope keyid "{entry_kid}"',
    )


def _lookup_key(keyset: KeySet | Mapping[str, Any], kid: str) -> KeyEntry | Mapping[str, Any] | None:
    if hasattr(keyset, "lookup"):
        return keyset.lookup(kid)  # type: ignore[union-attr]
    if isinstance(keyset, Mapping):
        return keyset.get(kid)
    return None


def _entry_kid(entry: KeyEntry | Mapping[str, Any]) -> str:
    if isinstance(entry, KeyEntry):
        return entry.kid
    value = entry.get("kid")
    return value if isinstance(value, str) else ""


def _entry_state(entry: KeyEntry | Mapping[str, Any]) -> KeyState:
    if isinstance(entry, KeyEntry):
        return entry.state
    value = entry.get("state", "active")
    return value if value in ("active", "retired", "revoked") else "active"


def _entry_public_key_jwk(entry: KeyEntry | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(entry, KeyEntry):
        return entry.public_key_jwk
    value = entry.get("publicKeyJwk") or entry.get("public_key_jwk")
    return value if isinstance(value, Mapping) else {}


def _verify_ed25519(public_key_jwk: Mapping[str, Any], message: bytes, signature: bytes) -> bool:
    try:
        public_key = _public_key_from_jwk(public_key_jwk)
        public_key.verify(signature, message)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def _public_key_from_jwk(jwk: Mapping[str, Any]) -> Ed25519PublicKey:
    if jwk.get("kty") != "OKP" or jwk.get("crv") != "Ed25519":
        raise ValueError("public key JWK must be OKP Ed25519")
    x = jwk.get("x")
    if not isinstance(x, str):
        raise ValueError("public key JWK missing x")
    raw = _base64url_decode(x)
    if len(raw) != 32:
        raise ValueError("Ed25519 public key x must decode to 32 bytes")
    return Ed25519PublicKey.from_public_bytes(raw)


def _private_key_from_jwk(jwk: Mapping[str, Any]) -> Ed25519PrivateKey:
    if jwk.get("kty") != "OKP" or jwk.get("crv") != "Ed25519":
        raise MintError("private key JWK must be OKP Ed25519")
    d = jwk.get("d")
    if not isinstance(d, str):
        raise MintError("private key JWK missing d")
    raw = _base64url_decode(d)
    if len(raw) != 32:
        raise MintError("Ed25519 private key d must decode to 32 bytes")
    return Ed25519PrivateKey.from_private_bytes(raw)


def _validate_mint_body(body: Mapping[str, Any]) -> None:
    if not _is_receipt_body_shape(body):
        raise MintError("body is not a valid Lattice receipt shape")
    if body.get("version") != "lattice-receipt/v1.4":
        raise MintError("mint body.version must be lattice-receipt/v1.4")
    if body.get("signatureProfile") != "dsse-v1":
        raise MintError('mint body.signatureProfile must be "dsse-v1"')

    usage = body.get("usage")
    route = body.get("route")
    if not isinstance(usage, Mapping) or not isinstance(route, Mapping):
        raise MintError("body usage and route must be objects")

    _require_safe_int(route.get("attemptNumber"), "route.attemptNumber")
    _require_safe_int(usage.get("promptTokens"), "usage.promptTokens")
    _require_safe_int(usage.get("completionTokens"), "usage.completionTokens")
    if "stepIndex" in body:
        _require_safe_int(body.get("stepIndex"), "stepIndex")

    cost_usd = usage.get("costUsd")
    if cost_usd is not None and not isinstance(cost_usd, str):
        raise MintError("usage.costUsd must be a decimal string or null")

    _reject_float_values(body)


def _require_safe_int(value: Any, path: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise MintError(f"{path} must be a JSON integer")
    if value < 0 or value > SAFE_INTEGER_MAX:
        raise MintError(f"{path} must be a safe non-negative integer")


def _reject_float_values(value: Any, path: str = "$") -> None:
    if isinstance(value, float):
        raise MintError(f"{path} contains a float; receipt bodies must be I-JSON")
    if isinstance(value, Mapping):
        for key, child in value.items():
            _reject_float_values(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_float_values(child, f"{path}[{index}]")


def _base64_encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _base64_decode(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"), validate=True)


def _base64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
