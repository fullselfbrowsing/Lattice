from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from typing import Any

from ._core import (
    PAYLOAD_TYPE,
    KeyEntry,
    MintError,
    build_pae,
    create_memory_keyset,
    mint,
    verify,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m lattice_receipt")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser(
        "mint-json",
        help="read {'body', 'privateKeyJwk'} from stdin and emit a mint result",
    )
    subparsers.add_parser(
        "verify-json",
        help="read an envelope and public key from stdin and emit a verify result",
    )
    args = parser.parse_args(argv)

    try:
        request = json.load(sys.stdin)
        if args.command == "mint-json":
            output = _mint_json(request)
        elif args.command == "verify-json":
            output = _verify_json(request)
        else:  # pragma: no cover - argparse owns the command set
            return 2
    except (MintError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    json.dump(output, sys.stdout, separators=(",", ":"), sort_keys=True)
    sys.stdout.write("\n")
    return 0


def _mint_json(request: Any) -> dict[str, Any]:
    result = mint(
        _required_object(request, "body"),
        _required_object(request, "privateKeyJwk"),
    )
    canonical = bytes.fromhex(result.canonical_hex)
    return {
        "envelope": result.envelope,
        "canonicalHex": result.canonical_hex,
        "payloadBase64": result.payload_base64,
        "paeHex": result.pae_hex,
        "signatureHex": result.signature_hex,
        "receiptCid": f"sha256:{hashlib.sha256(canonical).hexdigest()}",
    }


def _verify_json(request: Any) -> dict[str, Any]:
    envelope = _required_object(request, "envelope")
    public_key_jwk = _required_object(request, "publicKeyJwk")
    key_state = _optional_choice(
        request, "keyState", ("active", "retired", "revoked"), "active"
    )
    legacy_policy = _optional_choice(
        request, "legacyPolicy", ("allow", "reject"), "allow"
    )
    keyid = _first_keyid(envelope)
    entries = (
        [KeyEntry(kid=keyid, public_key_jwk=public_key_jwk, state=key_state)]
        if keyid is not None
        else []
    )
    result = verify(
        envelope,
        create_memory_keyset(entries),
        legacy_policy=legacy_policy,
    )
    if not result.ok:
        return {"ok": False, "error": result.error.kind}

    payload = envelope.get("payload")
    if not isinstance(payload, str):  # verify success already guarantees this
        raise ValueError("verified envelope payload must be a string")
    canonical = base64.b64decode(payload.encode("ascii"), validate=True)
    output: dict[str, Any] = {
        "ok": True,
        "body": result.body,
        "verificationProfile": result.verification_profile,
        "deprecated": result.deprecated,
        "canonicalHex": canonical.hex(),
        "receiptCid": f"sha256:{hashlib.sha256(canonical).hexdigest()}",
    }
    if result.verification_profile == "dsse-v1":
        output["paeHex"] = build_pae(PAYLOAD_TYPE, canonical).hex()
    return output


def _required_object(value: Any, key: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not isinstance(value.get(key), dict):
        raise ValueError(f"input JSON must contain object field {key!r}")
    return value[key]


def _optional_choice(
    value: Any,
    key: str,
    choices: tuple[str, ...],
    default: str,
) -> Any:
    if not isinstance(value, dict):
        raise ValueError("input JSON must be an object")
    selected = value.get(key, default)
    if selected not in choices:
        raise ValueError(f"input field {key!r} must be one of {choices}")
    return selected


def _first_keyid(envelope: dict[str, Any]) -> str | None:
    signatures = envelope.get("signatures")
    if not isinstance(signatures, list) or len(signatures) == 0:
        return None
    first = signatures[0]
    if not isinstance(first, dict) or not isinstance(first.get("keyid"), str):
        return None
    return first["keyid"]


if __name__ == "__main__":
    raise SystemExit(main())
