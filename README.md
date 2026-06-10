# TL Gen Art

A tiny, dependency-free JavaScript library for **deterministic generative art**. It derives a reproducible random seed from on-chain mint data and exposes a seeded PRNG plus a few helpers for traits and snapshots.

The contract: **the same mint inputs always produce the exact same output.** Reload the token a thousand times, render it on a server, render it in a collector's wallet — pixel for pixel identical.

It's renderer-agnostic. The library only emits numbers, booleans, and array picks, so it feeds p5.js, three.js, or a raw `<canvas>` equally well.

- **One file:** `art.js` (~7 KB, no build step, no dependencies)
- **One global:** `window.$art`, ready synchronously at load
- **Reproducible:** seeded with [xmur3](https://github.com/bryc/code/blob/master/jshash/PRNG.md) → [sfc32](https://github.com/bryc/code/blob/master/jshash/PRNG.md)

---

## Quick start

Load `art.js` **before** your sketch. It reads the mint params from the URL and seeds itself at load, so `$art` is ready by the time your code runs.

```html
<!doctype html>
<html>
  <head>
    <!--
      Load order is determinism-critical:
        1. your renderer (p5, three, ...) — optional
        2. art.js — sets window.$art and seeds synchronously
        3. your sketch — consumes $art, which is already ready
    -->
    <script src="p5.min.js"></script>
    <script src="art.js"></script>
  </head>
  <body>
    <script>
      function setup() {
        $art.seedFrom("minter");          // seed once, before drawing
        createCanvas(800, 800);
        noLoop();
      }

      function draw() {
        background(20);
        const n = $art.randomInt(4, 9);   // inclusive both ends
        for (let i = 0; i < n; i++) {
          fill($art.randomElement(["#ff6b6b", "#ffd93d", "#0fa3b1"]));
          circle($art.random(width), $art.random(height), $art.random(20, 120));
        }

        // after the canvas is drawn:
        $art.setTraits({ Shapes: n });
        $art.snapshot();                  // last — signals the render is done
      }
    </script>
  </body>
</html>
```

A complete working sketch lives in [`p5js-example.html`](./p5js-example.html).

### Run it locally

The library falls back to random values for every mint param, so it runs with no query string at all. To pin a specific output, pass params in the URL:

```
index.html?tokenId=42&blockhash=0xabc...&minter=0x01...
```

Open it from a local server (e.g. `npx serve` or `python3 -m http.server`) and vary the URL to explore variations — change `?tokenId=` or `?seed=` and reload.

---

## How seeding works

### Mint inputs (URL params)

Read once at load from `window.location.search`. Each falls back to a random value when absent.

| Param       | Role                                              | In seed              |
| ----------- | ------------------------------------------------- | -------------------- |
| `tokenId`   | uniqueness                                        | **always**           |
| `blockhash` | unpredictability                                  | **always**           |
| `minter`    | the collector's address                           | opt-in               |
| `txHash`    | the mint transaction hash                         | opt-in               |
| `gasPrice`  | gas price (wei)                                    | opt-in               |
| `gasUsed`   | gas used                                          | opt-in               |
| `seed`      | curated full-seed **override**                    | replaces everything  |

`tokenId` and `blockhash` are always part of the seed. Everything else is opt-in via `seedFrom(...)`.

### `$art.seedFrom(...fields)`

Composes the seed and resets the random stream. Call it **once**, at the top of your sketch, before drawing.

```js
$art.seedFrom();                      // tokenId + blockhash (the default)
$art.seedFrom("minter");              // + the collector's address
$art.seedFrom("txHash", "gasUsed");   // + extra entropy
```

Valid extra fields are `"minter"`, `"txHash"`, `"gasPrice"`, `"gasUsed"`. Anything else throws.

> ⚠️ **Don't change which fields you pass after a collection mints.** The seed is composed from those fields, so changing them re-rolls every token that already exists.

### The `seed` override

When a `seed` URL param is present, it **is** the complete seed verbatim and fully replaces the field composition. This is how contracts inject a curated seed for collector-curated drops. Locally it's absent, so seeding composes from the fields as usual. `$art.mint.seed` records the override (or `null`).

### `$art.getSeed()`

Returns the exact seed string in use (override or composed). Log it while debugging, or stamp it into your traits.

```js
$art.seedFrom("minter");
console.log("$art seed:", $art.getSeed());
// tid:42|blk:0xabc...|min:0x01...
```

---

## Random API

All randomness for your output **must** flow through these. Never use `Math.random()`, `Date.now()`, p5's native `random()`/`noise()`, or `THREE.MathUtils.*` — they're unseeded and break reproduction.

| Call                          | Range                          | Notes                          |
| ----------------------------- | ------------------------------ | ------------------------------ |
| `$art.random()`               | `[0, 1)`                       | exclusive max                  |
| `$art.random(max)`            | `[0, max)`                     | exclusive max                  |
| `$art.random(min, max)`       | `[min, max)`                   | exclusive max                  |
| `$art.randomInt(max)`         | `[0, max]`                     | **inclusive** both ends        |
| `$art.randomInt(min, max)`    | `[min, max]`                   | **inclusive** both ends        |
| `$art.randomBool(p = 0.5)`    | `true` with probability `p`    |                                |
| `$art.randomElement(array)`   | uniform pick                   | empty array → `undefined`      |
| `$art.mint`                   | raw mint values                | for traits/metadata            |

```js
$art.random();              // 0.5234...
$art.random(360);           // a hue in [0, 360)
$art.randomInt(1, 6);       // a die roll, 1..6 inclusive
$art.randomBool(0.82);      // true 82% of the time
$art.randomElement(palette);
$art.mint;                  // { tokenId, blockhash, txHash, minter, gasPrice, gasUsed, seed }
```

---

## Determinism rules

Break any of these and tokens will fail to reproduce:

1. **All randomness flows through `$art`.** No `Math.random()`, `Date.now()`, p5 `random()`/`noise()`, or `THREE.MathUtils.*` for anything that affects the output.
2. **Seed once, before drawing.** Only re-seed to intentionally reset the stream (e.g. independent layered passes).
3. **Output depends on call order.** The random stream is shared, so reordering your drawing code changes the result. Preserve order when refactoring.
4. **Don't change `seedFrom`'s fields after mint.** It re-rolls every existing token.
5. **Drive motion from a frame counter, not wall-clock time.** Seed structural choices (positions, counts, colors) from `$art`; if an animation must be reproducible, advance it with a frame index, not `Date.now()`.

A correct change keeps all of these true:

- Same URL params → byte-identical output across reloads.
- Changing `tokenId` or `blockhash` → different output.
- `seedFrom(...)` with the same fields → identical sequence from the start.

---

## Traits & snapshots

These two helpers append **hidden DOM** that survives in the captured HTML. Call them **after** the canvas is fully drawn.

### `$art.setTraits({ ... })`

Maps a plain `{ name: value }` object to OpenSea-style attributes and writes them into a hidden `<script type="application/json" id="art-traits">`. Idempotent — calling again replaces the previous traits.

```js
$art.setTraits({ Palette: "Sunset", Layers: 5 });
// writes: [{ "trait_type": "Palette", "value": "Sunset" },
//          { "trait_type": "Layers",  "value": 5 }]

$art.getTraits(); // -> the attributes array (or null)
```

### `$art.snapshot(freezeFn?)`

Appends a hidden `#art-snapshot-ready` marker so a headless renderer knows the canvas is finished. Idempotent. **Call it last**, once traits are set and drawing is done.

```js
$art.setTraits(chosen);
$art.snapshot(); // the renderer waits on #art-snapshot-ready
```

#### Animated pieces

A still piece never changes after `draw()`, so the screenshot is whatever is on the canvas. An **animated** piece keeps moving, and a headless renderer grabs pixels at some unpredictable moment — so the captured frame isn't stable.

Pass `snapshot()` an optional **freeze callback** to stop the animation at the moment you call it. It runs **only under the snapshot capture user agent** (Cloudflare is configured to send a UA containing `tl-gen-art`), so collectors keep their live animation while the capture sees a held frame:

```js
// p5: stop the draw loop
$art.snapshot(() => noLoop());

// raw canvas / three.js: cancel your own loop
$art.snapshot(() => cancelAnimationFrame(rafId));
```

The library does **not** freeze for you, and a held frame is not automatically reproducible — that's on you. Call `snapshot()` at a deterministic point (e.g. a fixed frame count), not on wall-clock time, so the same token always yields the same thumbnail.

`$art.captureMode` is `true` under that same capture user agent if you'd rather branch your render path (e.g. jump straight to a hero frame) instead of freezing in place.

---

## Snapshotting with Cloudflare Browser Rendering

To mint metadata you need two artifacts: a **preview image** and the **traits**. The library is designed so a single Cloudflare [Browser Rendering `/snapshot`](https://developers.cloudflare.com/browser-run/quick-actions/snapshot/) call produces both — the snapshot returns the rendered screenshot *and* the final HTML, and your hidden `#art-traits` JSON rides along inside that HTML.

### Why it composes so well

1. Your sketch calls `$art.setTraits({...})` → traits live in a hidden `<script id="art-traits">` in the DOM.
2. Your sketch calls `$art.snapshot()` → a hidden `#art-snapshot-ready` marker appears once drawing finishes.
3. Cloudflare waits for that marker, then captures both the screenshot and the rendered HTML.
4. You decode the screenshot for the preview and parse `#art-traits` from the returned HTML for the metadata. One call, both artifacts, fully deterministic.

### The endpoint

```
POST https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/snapshot
Authorization: Bearer <apiToken>     # token needs "Browser Rendering — Edit"
Content-Type: application/json
```

The response contains both pieces:

```json
{
  "success": true,
  "result": {
    "screenshot": "<base64 PNG>",
    "content": "<html>... your fully-rendered token, including #art-traits ...</html>"
  }
}
```

### Example call

Render the token at its mint URL, wait for the ready marker, and capture:

```bash
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/snapshot' \
  -H 'Authorization: Bearer <apiToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://your-token-host.example/index.html?tokenId=42&blockhash=0xabc...&minter=0x01...",
    "userAgent": "Mozilla/5.0 (compatible; tl-gen-art/1; +snapshot)",
    "viewport": { "width": 800, "height": 800, "deviceScaleFactor": 2 },
    "waitForSelector": { "selector": "#art-snapshot-ready", "timeout": 30000 }
  }'
```

The `userAgent` must contain the `tl-gen-art` sentinel (substring match) — that's what makes `$art.snapshot(freezeFn)` engage the freeze and what `$art.captureMode` keys off. Omit it and the capture still works for still pieces; animated pieces just won't freeze.

You can also pass the token HTML inline with `"html": "<!doctype html>..."` instead of `"url"` — useful when you don't want to host a page per token.

### Turning the response into mint metadata

```js
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/snapshot`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: tokenUrl,
      userAgent: "Mozilla/5.0 (compatible; tl-gen-art/1; +snapshot)",
      viewport: { width: 800, height: 800, deviceScaleFactor: 2 },
      waitForSelector: { selector: "#art-snapshot-ready", timeout: 30000 },
    }),
  }
).then((r) => r.json());

// 1. preview image
const pngBuffer = Buffer.from(res.result.screenshot, "base64");

// 2. traits — parse the hidden JSON out of the returned HTML
const match = res.result.content.match(
  /<script[^>]*id="art-traits"[^>]*>([\s\S]*?)<\/script>/
);
const attributes = match ? JSON.parse(match[1]) : [];

// 3. assemble metadata
const metadata = {
  name: `Token #${tokenId}`,
  image: "ipfs://...",   // after you pin pngBuffer
  attributes,            // straight from #art-traits
};
```

> **Why `waitForSelector` and not a fixed timeout or `networkidle`?** `$art.snapshot()` appends `#art-snapshot-ready` only after your canvas is fully drawn, so gating the capture on that selector is the one reliable signal that the render is complete — you never snapshot a half-drawn canvas, and you don't pad every capture with a guessed delay. That's exactly what the `snapshot()` helper exists for.

---

## Renderer notes

- **`$art` is namespaced** — no collision with p5 globals or `THREE.*`. The random helpers only emit numbers/booleans/picks.
- **`setTraits` / `snapshot` touch the DOM** — they're the exception; call them after render/draw completes.
- **`window.$art`** is correct for classic token-HTML setups (Art Blocks / fxhash / Highlight style).
- For a **bundled three.js project** (Vite/webpack with ES `import`s), the global still works if `art.js` loads as a classic script first, but an ES-module export is cleaner. Open an issue / ask before changing the global pattern.

---

## License

See [LICENSE](./LICENSE).
