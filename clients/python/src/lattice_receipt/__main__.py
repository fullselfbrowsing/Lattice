from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from ._core import MintError, mint


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m lattice_receipt")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("mint-json", help="read {'body', 'privateKeyJwk'} from stdin and emit a mint result")
    args = parser.parse_args(argv)

    if args.command == "mint-json":
        try:
            request = json.load(sys.stdin)
            result = mint(_required_object(request, "body"), _required_object(request, "privateKeyJwk"))
        except (MintError, ValueError, TypeError, json.JSONDecodeError) as exc:
            print(str(exc), file=sys.stderr)
            return 2

        json.dump(
            {
                "envelope": result.envelope,
                "canonicalHex": result.canonical_hex,
                "payloadBase64": result.payload_base64,
                "paeHex": result.pae_hex,
                "signatureHex": result.signature_hex,
            },
            sys.stdout,
            separators=(",", ":"),
        )
        sys.stdout.write("\n")
        return 0

    return 2


def _required_object(value: Any, key: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not isinstance(value.get(key), dict):
        raise ValueError(f"input JSON must contain object field {key!r}")
    return value[key]


if __name__ == "__main__":
    raise SystemExit(main())

