/**
 * Generative art random helpers with p5-style configurable seeding.
 *
 * Reads mint params from the URL: tokenId, blockhash, txHash, minter
 * (each falls back to a random value so the script runs locally).
 *
 * tokenId + blockhash are ALWAYS part of the seed (uniqueness +
 * unpredictability). minter, txHash, gasPrice, and gasUsed are opt-in.
 * Re-seeding resets the random stream deterministically, like p5's randomSeed().
 *
 *   $art.seedFrom();                       // tokenId + blockhash (default)
 *   $art.seedFrom("minter");               // + minter
 *   $art.seedFrom("gasPrice", "gasUsed");  // + gas fields
 *
 * A `seed` URL param is a curated, full override: when present it becomes the
 * complete seed verbatim and seedFrom(...) defers to it (contract-injected for
 * collector-curated drops). Absent locally, seeding composes from the fields.
 *
 * Snapshot + traits (for Cloudflare Browser Rendering):
 *   $art.setTraits({ Palette: "Sunset", Layers: 5 }); // hidden #art-traits JSON
 *   $art.snapshot();                                  // hidden #art-snapshot-ready marker
 *   $art.snapshot(() => noLoop());                    // + freeze the frame under capture
 *
 * For animated pieces, pass snapshot() a freeze callback. It runs ONLY under the
 * snapshot capture user agent (live collector views never freeze), letting the
 * screenshot grab the frame that was live at call time. Making that frame
 * reproducible is the artist's job: call snapshot() at a deterministic point.
 */
const $art = (function () {
  const params = new URLSearchParams(window.location.search);
  const get = (key, fb) => {
    const v = params.get(key);
    return v === null || v === "" ? fb : v;
  };
  const randHex = (len) =>
    "0x" + Array.from({ length: len }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");

  // Raw mint values (with local-dev fallbacks). "0" tokenId is preserved.
  const mint = {
    tokenId:   get("tokenId", Math.floor(Math.random() * 10000).toString()),
    blockhash: get("blockhash", randHex(64)),
    txHash:    get("txHash", randHex(64)),
    minter:    get("minter", randHex(40)),
    gasPrice:  get("gasPrice", Math.floor(Math.random() * 1e11).toString()),       // ~wei
    gasUsed:   get("gasUsed", (21000 + Math.floor(Math.random() * 1e6)).toString()),
    seed:      get("seed", null), // curated full-seed override; null = compose from fields
  };

  // ---- seed -> PRNG ----
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296; // [0, 1)
    };
  }

  // ---- seed composition ----
  const FIELD_TAGS = {
    tokenId: "tid", blockhash: "blk", txHash: "tx", minter: "min",
    gasPrice: "gp", gasUsed: "gu",
  };
  const REQUIRED = ["tokenId", "blockhash"];

  function composeSeed(extraFields) {
    // required fields first, then opt-ins; de-duplicated, order preserved
    const ordered = [...new Set([...REQUIRED, ...extraFields])];
    return ordered
      .map((f) => {
        if (!(f in FIELD_TAGS)) throw new Error("$art: unknown seed field '" + f + "'");
        return FIELD_TAGS[f] + ":" + String(mint[f]).toLowerCase();
      })
      .join("|");
  }

  // Mutable generator so re-seeding resets the stream (p5 semantics).
  let rand;
  let currentSeed;

  function applySeed(seedString) {
    currentSeed = seedString;
    const next = xmur3(seedString);
    rand = sfc32(next(), next(), next(), next());
    for (let i = 0; i < 15; i++) rand(); // warm-up
  }

  // ---- p5-style seeding ----

  // Curated full-seed override from the `seed` URL param (null when absent).
  const seedOverride = mint.seed;

  // Seed from chosen mint fields (tokenId + blockhash always included).
  // If a `seed` URL param is present it is the complete seed verbatim and
  // wins over the field composition (curated drops). Resets the random stream.
  // Returns the seed string used.
  function seedFrom(...extraFields) {
    const composed = composeSeed(extraFields); // validates fields, may throw
    applySeed(seedOverride !== null ? seedOverride : composed);
    return currentSeed;
  }

  // Default seed on load: the two required fields.
  seedFrom();

  // ---- random helpers (draw from the current stream) ----

  // random() -> [0,1) | random(max) -> [0,max) | random(min,max) -> [min,max)
  function random(...args) {
    let min = 0, max = 1;
    if (args.length === 1) max = args[0];
    else if (args.length >= 2) { min = args[0]; max = args[1]; }
    return min + (max - min) * rand();
  }

  // Inclusive of both ends. randomInt(max) -> [0,max] | randomInt(min,max) -> [min,max]
  function randomInt(...args) {
    let min = 0, max = 1;
    if (args.length === 1) max = args[0];
    else if (args.length >= 2) { min = args[0]; max = args[1]; }
    return Math.floor(random(min, max + 1));
  }

  function randomBool(p = 0.5) {
    return random() < p;
  }

  function randomElement(array) {
    if (!array || array.length === 0) return undefined;
    return array[randomInt(0, array.length - 1)];
  }

  // ---- snapshot + traits (hidden DOM, survives in the HTML snapshot) ----

  // Write a hidden, non-rendered JSON element (idempotent by id).
  function writeHiddenJSON(id, data) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/json"; // not executed, not rendered, survives in HTML
      el.id = id;
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return el;
  }

  let currentTraits = null;

  // { Palette: "Sunset", Layers: 5 } -> OpenSea [{trait_type, value}, ...]
  // Emitted into a hidden #art-traits element for the snapshot HTML.
  function setTraits(traits) {
    if (!traits || typeof traits !== "object" || Array.isArray(traits))
      throw new Error("$art.setTraits: expects a plain object of { name: value }");
    currentTraits = Object.keys(traits).map((k) => ({ trait_type: k, value: traits[k] }));
    writeHiddenJSON("art-traits", currentTraits);
    return currentTraits;
  }

  // Capture environment detection. Cloudflare Browser Rendering is configured to
  // send this sentinel user agent; live collector views never match. Keep in sync
  // with the snapshot infra's userAgent setting.
  const CAPTURE_UA = "tl-gen-art";
  const captureMode =
    typeof navigator !== "undefined" &&
    new RegExp(CAPTURE_UA).test(navigator.userAgent || "");

  // Signal that the canvas is fully drawn: append a hidden marker so Cloudflare's
  // Browser Rendering API can waitForSelector("#art-snapshot-ready"). Idempotent.
  //
  // For animated pieces, pass a freeze callback (e.g. () => noLoop(), or one that
  // cancels your rAF loop). It runs ONLY under the capture user agent, so the
  // screenshot captures the frame live at call time while collectors keep their
  // animation. Reproducibility of that frame is the artist's responsibility.
  function snapshot(onCapture) {
    if (captureMode && typeof onCapture === "function") onCapture();
    let el = document.getElementById("art-snapshot-ready");
    if (!el) {
      el = document.createElement("div");
      el.id = "art-snapshot-ready";
      el.style.display = "none";
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  return {
    mint,
    seedFrom,
    getSeed: () => currentSeed,
    random,
    randomInt,
    randomBool,
    randomElement,
    setTraits,
    getTraits: () => currentTraits,
    snapshot,
    captureMode,
  };
})();

window.$art = $art;
