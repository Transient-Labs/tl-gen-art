# TL GEN ART

Guidance for working in this repo. The overriding goal is **deterministic generative art**: the same mint inputs must always produce the exact same output.

## Project

A small, dependency-free JavaScript library that derives a reproducible random seed from on-chain mint data and exposes a seeded PRNG. It runs inside the token's HTML render context (Art Blocks / fxhash / Highlight style) and is renderer-agnostic — it feeds p5.js, three.js, or raw canvas.

## Core file

- `art.js` — defines the global `$art` (IIFE that sets `window.$art`). No build step. Load via `<script>` **before** the sketch. The IIFE reads URL params and seeds synchronously at load, so `$art` is ready by the time `setup()` / your render code runs.

## Mint inputs (URL params)

Read once at load from `window.location.search`. Each falls back to a random value so the script runs locally without a query string.

- `tokenId` — provides uniqueness. Always part of the seed.
- `blockhash` — provides unpredictability. Always part of the seed.
- `txHash` — optional.
- `minter` — optional.
- `gasPrice` — optional.
- `gasUsed` — optional.
- `seed` — optional **curated override**. When present it is the complete seed verbatim and fully replaces the field composition (the contract injects it for collector-curated drops). Absent locally, seeding composes from the fields. Recorded on `$art.mint.seed` (or `null`).

Local testing: open with a query string, e.g. `index.html?tokenId=42&blockhash=0xabc...&minter=0x01...`. To explore variations, vary the URL (`?seed=...` or `?tokenId=...`) and reload the iframe.

## Seeding API (p5-style)

- `$art.seedFrom(...fields)` — compose the seed. `tokenId` + `blockhash` are ALWAYS included; pass any of `"minter"`, `"txHash"`, `"gasPrice"`, `"gasUsed"` to add them. Resets the random stream. Call once at the top of the sketch. Unknown field names throw (valid extras: `"minter"`, `"txHash"`, `"gasPrice"`, `"gasUsed"`). If a `seed` URL param is present it fully overrides this composition.
- `$art.getSeed()` — returns the exact seed string in use (override or composed). Log it or stamp it into traits when debugging.

## Random API

- `$art.random()` → `[0, 1)`; `random(max)` → `[0, max)`; `random(min, max)` → `[min, max)`. **Exclusive** max.
- `$art.randomInt(max)` → `[0, max]`; `randomInt(min, max)` → `[min, max]`. **Inclusive of both ends** (like lodash `_.random`).
- `$art.randomBool(p = 0.5)` → `true` with probability `p`.
- `$art.randomElement(array)` → uniform pick; works on strings, numbers, or objects. Empty array → `undefined`.
- `$art.mint` → `{ tokenId, blockhash, txHash, minter, gasPrice, gasUsed, seed }` raw values (for traits/metadata). `seed` is the curated override or `null`.

## Snapshot + traits

For Cloudflare's Browser Rendering snapshot API. Both append hidden DOM that survives in the captured HTML; call them **after** the canvas is fully drawn.

- `$art.setTraits({ Palette: "Sunset", Layers: 5 })` — maps a plain `{ name: value }` object to OpenSea attributes `[{ trait_type, value }]` and writes it into a hidden `<script type="application/json" id="art-traits">`. Idempotent (replaces on re-call). Non-object input throws.
- `$art.getTraits()` — returns the current attributes array (or `null`).
- `$art.snapshot(freezeFn?)` — appends a hidden `#art-snapshot-ready` marker. Cloudflare waits on it via `waitForSelector: "#art-snapshot-ready"`. Idempotent. Call last, once traits are set and drawing is done.
  - **Animated pieces:** pass an optional `freezeFn` to stop the animation, e.g. `$art.snapshot(() => noLoop())` or one that cancels your `requestAnimationFrame` loop. It runs **only under the snapshot capture user agent** (Cloudflare sends the `tl-gen-art` sentinel UA — must match the infra config), so the screenshot captures the frame that was live at call time while collectors keep animating. The library does not freeze for you; whether that frame is reproducible is the artist's responsibility — call `snapshot()` at a deterministic point (e.g. a fixed frame count), not on wall-clock time.
- `$art.captureMode` — `true` when running under the snapshot capture user agent. Branch on it if you want a different render path for the thumbnail (e.g. jump straight to a hero frame).

## Determinism rules — do not break these

1. **All randomness must flow through `$art`.** Never use `Math.random()`, `Date.now()`, p5's native `random()`/`noise()`, or `THREE.MathUtils.randFloat()` for anything that affects the output. They are unseeded and will make tokens fail to reproduce.
2. Call `$art.seedFrom(...)` exactly once, before drawing. Only re-seed to intentionally reset the stream (e.g. independent layered passes).
3. The random stream is shared, so **output depends on call order**. Reordering drawing code changes the result. Preserve order when refactoring.
4. Do not change which fields `seedFrom` uses once a collection has minted — it re-rolls every existing token.
   - The `seed` URL param is a verbatim override that wins over field composition; `$art.mint.seed` records it (or `null`).
5. In animation loops, seed structural choices (positions, counts, colors) from `$art`, but drive motion from a frame counter, not wall-clock time, if the animation must be reproducible.

## Renderer notes

- Renderer-agnostic: `$art` random helpers only emit numbers/booleans/picks. No naming collision with p5 globals (`$art` is namespaced) or with `THREE.*`. (`setTraits`/`snapshot` are the exception — they append hidden DOM, so call them after render/draw completes.)
- The `window.$art` global is correct for classic token-HTML setups (Art Blocks / fxhash / Highlight).
- For a bundled three.js project (Vite/webpack with ES `import`s), the global still works if `art.js` loads as a classic script first, but an ES module export is cleaner. Ask before changing the global pattern.

## Verifying determinism

A correct change keeps these true:

- Same URL params → byte-identical output across reloads.
- Changing `tokenId` or `blockhash` → different output.
- `$art.seedFrom(...)` with the same fields → identical random sequence from the start.
