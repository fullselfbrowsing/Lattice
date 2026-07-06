# lattice-receipt

Python reference client for the Lattice receipt protocol.

This package is intentionally small: it verifies DSSE receipt envelopes, recomputes replay
`outputHash` values, and mints receipts from local JWK OKP Ed25519 keys. It has no network
code and is not published in v1.5.

```python
from lattice_receipt import KeyEntry, create_memory_keyset, verify

keyset = create_memory_keyset([
    KeyEntry(kid="spec-example-key-v0", public_key_jwk=public_jwk, state="active")
])

result = verify(envelope_dict, keyset)
if result.ok:
    print(result.body["receiptId"])
else:
    print(result.error.kind)
```

