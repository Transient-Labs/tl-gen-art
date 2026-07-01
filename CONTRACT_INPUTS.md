# TL Gen Art — Render Inputs (contract-side reference)

The art renderer (`art.js`) reads all mint inputs from the **URL query string** of the
token HTML (`window.location.search`). The contract's job is to inject these query params
into each token's render URI. Param names are **exact and case-sensitive**.

## Parameters

| Param | Required | Format the renderer expects | Role |
|---|---|---|---|
| `tokenId` | **Yes** | Decimal string, no leading zeros (`"0"` is valid) | Uniqueness — distinguishes tokens within a collection |
| `blockhash` | **Yes** | `0x` + 64 hex chars (32 bytes), full width | Unpredictability — can't be known before mint |
| `txHash` | No | `0x` + 64 hex chars | Optional extra entropy |
| `minter` | No | `0x` + 40 hex chars (20-byte address) | Optional extra entropy |
| `gasPrice` | No | Decimal string (wei) | Optional extra entropy |
| `gasUsed` | No | Decimal string | Optional extra entropy |
| `seed` | No | Arbitrary string | **Curated full override** (see below) |

Example URI:

```
index.html?tokenId=42&blockhash=0xabc…(64 hex)&minter=0x01…(40 hex)
```

## How the seed is built

The renderer composes a seed **string** from selected fields, e.g.:

```
tid:42|blk:0xabc…|min:0x01…
```

`tokenId` + `blockhash` are **always** included. The other four are opt-in *on the
artist's side* (`seedFrom("minter", …)`) — but the contract should still inject every
field it has, because the artist chooses which to consume and that choice may differ per
collection.

## Determinism rules the contract MUST honor

These are the things that break reproducibility — the whole point of the system is that a
given token always renders identically.

1. **Values are frozen at mint, forever.** Once a token is minted, the params injected for
   it must never change. The seed string is hashed verbatim, so changing *any* injected
   value re-rolls that token into a completely different output.

2. **Formatting must be canonical and stable**, because the seed is built from the *string
   representation*, not the numeric value. The renderer lowercases hex (so case is safe),
   but it does **not** normalize anything else. In particular:
   - `tokenId`: decimal, no leading zeros. `"42"` ≠ `"042"` → different art.
   - `blockhash` / `txHash`: keep the `0x` prefix and the full 64 hex chars. **Do not
     strip leading-zero bytes** — `0x0abc…` ≠ `0xabc…`.
   - `minter`: `0x` + 40 hex. Don't trim to a checksummed/short form inconsistently (case
     is fine; length/prefix is not).
   - `gasPrice` / `gasUsed`: plain decimal wei, no unit suffixes, no hex.
   - Pick one format per field and use it for every token, every time.

3. **Don't change which fields exist for a collection mid-flight.** If the artist seeds
   from `minter`, that field must be present and stable for all tokens. Adding/removing/
   altering it re-rolls existing tokens.

## The `seed` override (curated drops)

- When `seed` is present, it becomes the **complete seed verbatim** and fully replaces the
  field composition above. `tokenId`/`blockhash` are ignored for seeding.
- Use this only for collector-curated drops where the contract picks the exact seed.
- If you use it, that `seed` value is the thing that must be frozen forever. The renderer
  records it on `$art.mint.seed` (and `null` when absent).
- Don't inject `seed` for normal algorithmic mints — leave it out so the deterministic
  field composition is used.

## Things that are NOT the contract's concern

- The PRNG algorithm, warm-up, and call-order are all renderer-side and fixed.
- Traits/snapshot metadata are emitted by the renderer into the HTML at render time; the
  contract doesn't supply them.
- Local-dev fallbacks: if a param is missing the renderer invents a random one (for local
  testing only). **Production must always supply at least `tokenId` and `blockhash`** —
  never rely on the fallback on-chain.
