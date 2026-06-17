/**
 * Nyara Stays — Cloudflare Pages "_worker.js" (Advanced Mode)
 *
 * Handles /api/booking/* on the production deploy. Static assets fall through
 * to env.ASSETS.fetch() so the existing HTML/CSS/JS deploys unchanged.
 *
 * Required env vars (Cloudflare Pages → Settings → Environment Variables):
 *   STRIPE_SECRET_KEY        sk_test_... or sk_live_...
 *   STRIPE_PUBLISHABLE_KEY   pk_test_... or pk_live_...
 *
 * Optional:
 *   STRIPE_WEBHOOK_SECRET    whsec_... (only if you wire a webhook later)
 *
 * Pricing logic mirrors /app/backend/payments.py — keep them in sync.
 */

// ----- Pricing (mirror of payments.py) ---------------------------------------
const STAYS = {
  yume:  { name: "Yume by Nyara", loc: "Uluwatu · Bali", base_usd_per_night: 320.0 },
  nyara: { name: "Nyara Villas",  loc: "Uluwatu · Bali", base_usd_per_night: 680.0 },
  penthouse: { name: "Penthouse by Nyara", loc: "Aldea Zama · Tulum", base_usd_per_night: 450.0 },
};
const SEASON_BY_MONTH = {
  0: "high", 6: "high", 7: "high", 11: "high",
  4: "mid",  5: "mid",  8: "mid",
  1: "low",  2: "low",  3: "low",  9: "low", 10: "low",
};
const SEASON_MULT = { low: 1.00, mid: 1.25, high: 1.60 };
const FX = { USD: 1.0, EUR: 0.92, AUD: 1.52, IDR: 15600.0, GBP: 0.79 };
const ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW", "VND", "CLP"]);
const DEPOSIT_PCT = 0.30;

function parseIso(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
  if (!m) throw new Error(`Invalid date: ${d}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function quote(stayKey, checkIn, checkOut, currency) {
  currency = (currency || "USD").toUpperCase();
  if (!FX[currency]) throw new Error(`Unsupported currency: ${currency}`);
  if (!STAYS[stayKey]) throw new Error(`Unknown stay: ${stayKey}`);
  const ci = parseIso(checkIn);
  const co = parseIso(checkOut);
  const nights = Math.round((co - ci) / 86400000);
  if (nights <= 0) throw new Error("Check-out must be after check-in");
  if (nights > 60) throw new Error("Maximum 60 nights per booking");

  const stay = STAYS[stayKey];
  let totalUsd = 0;
  const cur = new Date(ci);
  for (let i = 0; i < nights; i++) {
    const tier = SEASON_BY_MONTH[cur.getUTCMonth()] || "low";
    totalUsd += stay.base_usd_per_night * SEASON_MULT[tier];
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  const totalCur = totalUsd * FX[currency];
  const depositCur = totalCur * DEPOSIT_PCT;
  const isZero = ZERO_DECIMAL.has(currency);
  return {
    currency,
    nights,
    total_minor: Math.round(isZero ? totalCur : totalCur * 100),
    deposit_minor: Math.round(isZero ? depositCur : depositCur * 100),
    stay,
  };
}

// ----- Stripe REST helpers (no SDK needed in Workers) -------------------------
async function stripeRequest(env, path, method = "GET", body = null) {
  const key = (env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  const headers = {
    Authorization: "Bearer " + key,
    "Stripe-Version": "2024-06-20",
  };
  let init = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = encodeForm(body);
  }
  const res = await fetch("https://api.stripe.com/v1" + path, init);
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) {
    const msg = parsed?.error?.message || parsed?.raw || res.statusText;
    throw new Error("Stripe error (" + res.status + "): " + msg);
  }
  return parsed;
}

function encodeForm(obj, prefix = "") {
  // Encode nested objects (like metadata, automatic_payment_methods) Stripe-style
  const parts = [];
  const enc = encodeURIComponent;
  function push(k, v) { parts.push(enc(k) + "=" + enc(v)); }
  function walk(value, key) {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof value === "object") {
      for (const k of Object.keys(value)) walk(value[k], `${key}[${k}]`);
    } else {
      push(key, String(value));
    }
  }
  for (const k of Object.keys(obj)) walk(obj[k], prefix ? `${prefix}[${k}]` : k);
  return parts.join("&");
}

// ----- API routes -------------------------------------------------------------
async function apiCreatePaymentIntent(request, env) {
  let payload;
  try { payload = await request.json(); }
  catch { return json({ detail: "Invalid JSON" }, 400); }

  let q;
  try { q = quote(payload.stay, payload.check_in, payload.check_out, payload.currency); }
  catch (e) { return json({ detail: e.message }, 400); }

  const customer = payload.customer || {};
  if (!customer.email || !customer.name || !customer.phone) {
    return json({ detail: "Missing customer name, email or phone" }, 400);
  }
  const guests = payload.guests || { adults: 1, children: 0, infants: 0 };
  const bookingRef = "NYR-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const currencyLc = q.currency.toLowerCase();

  let intent;
  try {
    intent = await stripeRequest(env, "/payment_intents", "POST", {
      amount: q.deposit_minor,
      currency: currencyLc,
      "automatic_payment_methods[enabled]": "true",
      receipt_email: customer.email,
      description: `Nyara Stays · ${q.stay.name} · ${q.nights} nights · Ref ${bookingRef}`,
      metadata: {
        booking_ref: bookingRef,
        stay: payload.stay,
        check_in: payload.check_in,
        check_out: payload.check_out,
        nights: String(q.nights),
        guest_name: customer.name,
        guest_email: customer.email,
        guest_phone: customer.phone,
        adults: String(guests.adults || 1),
        children: String(guests.children || 0),
        infants: String(guests.infants || 0),
        currency: q.currency,
        total_minor: String(q.total_minor),
        deposit_minor: String(q.deposit_minor),
        deposit_pct: String(Math.round(DEPOSIT_PCT * 100)),
        notify_email: "booking@nyarastays.co",
      },
    });
  } catch (e) {
    return json({ detail: e.message }, 502);
  }

  return json({
    client_secret: intent.client_secret,
    payment_intent_id: intent.id,
    publishable_key: env.STRIPE_PUBLISHABLE_KEY || "",
    booking_ref: bookingRef,
    amount_total_minor: q.total_minor,
    amount_deposit_minor: q.deposit_minor,
    currency: q.currency,
    nights: q.nights,
  });
}

async function apiPaymentStatus(request, env, intentId) {
  let intent;
  try { intent = await stripeRequest(env, "/payment_intents/" + encodeURIComponent(intentId)); }
  catch (e) { return json({ detail: e.message }, 404); }
  return json({
    status: intent.status,
    booking_ref: intent.metadata?.booking_ref || null,
    amount_received_minor: intent.amount_received || 0,
    currency: intent.currency,
  });
}

async function apiPublishableKey(env) {
  return json({ publishable_key: env.STRIPE_PUBLISHABLE_KEY || "" });
}

// ----- Image manifest / admin -------------------------------------------------
// Hard-coded catalog of every image referenced on the site. Generated by
// scanning /app/frontend/public for /assets/images/* references. If you add
// new images to the codebase, append them here so they show up in the admin.
const IMAGE_CATALOG = [
  { path: "/assets/images/logo/nyara-logo.jpg",
    locations: ["Site logo · header on every page", "index.html", "stays (locations.html)", "about.html", "contact.html", "journal.html", "booking.html", "locations/yume.html", "locations/nyara-villas.html", "journal/* posts"] },
  { path: "/assets/images/yume/352664100.jpg",
    locations: ["Home hero · index.html", "Booking summary · booking.html"] },
  { path: "/assets/images/yume/352665482.jpg",
    locations: ["Home gallery · index.html", "Stays grid · locations.html", "Yume detail · locations/yume.html", "Journal post · slow-week-at-yume"] },
  { path: "/assets/images/yume/352682722.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html", "Journal feed · journal.html", "Journal post · designing-nyara"] },
  { path: "/assets/images/yume/352682723.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html", "Journal post · designing-nyara"] },
  { path: "/assets/images/yume/352682726.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html"] },
  { path: "/assets/images/yume/352682729.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html", "Journal feed · journal.html", "Booking summary · booking.html", "Journal post · slow-week-at-yume"] },
  { path: "/assets/images/yume/352682733.jpg",
    locations: ["About page hero · about.html"] },
  { path: "/assets/images/yume/352684018.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html", "Journal feed · journal.html", "Journal post · uluwatu-we-love"] },
  { path: "/assets/images/yume/352684021.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html", "Journal post · uluwatu-we-love"] },
  { path: "/assets/images/yume/352684022.jpg",
    locations: ["Home gallery · index.html", "About page · about.html"] },
  { path: "/assets/images/yume/411713773.jpg",
    locations: ["Home gallery · index.html", "Yume detail · locations/yume.html"] },
  { path: "/assets/images/yume/781406037.jpg",
    locations: ["Home gallery · index.html"] },
  { path: "/assets/images/penthouse/ph-living-pool.jpg",
    locations: ["Home stays · index.html", "Stays grid · locations.html", "Penthouse hero & gallery · locations/penthouse.html", "Booking media & destination · booking.html"] },
  { path: "/assets/images/penthouse/ph-dining-pool.jpg",
    locations: ["Penthouse gallery · locations/penthouse.html"] },
  { path: "/assets/images/penthouse/ph-bedroom-tv.jpg",
    locations: ["Penthouse gallery · locations/penthouse.html"] },
  { path: "/assets/images/penthouse/ph-bedroom-kitchen.jpg",
    locations: ["Penthouse gallery · locations/penthouse.html"] },
  { path: "/assets/images/penthouse/ph-bathroom.jpg",
    locations: ["Penthouse gallery · locations/penthouse.html"] },
];

const MANIFEST_KEY = "image-manifest.json";

function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function readManifest(env) {
  if (!env.IMAGES_BUCKET) return { images: {} };
  const obj = await env.IMAGES_BUCKET.get(MANIFEST_KEY);
  if (!obj) return { images: {} };
  try {
    const t = await obj.text();
    const j = JSON.parse(t);
    return { images: (j && j.images) || {} };
  } catch (_e) {
    return { images: {} };
  }
}

async function writeManifest(env, manifest) {
  if (!env.IMAGES_BUCKET) throw new Error("IMAGES_BUCKET binding not configured");
  const body = JSON.stringify({ images: manifest.images || {}, updated_at: new Date().toISOString() });
  await env.IMAGES_BUCKET.put(MANIFEST_KEY, body, {
    httpMetadata: { contentType: "application/json" },
  });
}

async function apiImageManifestPublic(env) {
  const m = await readManifest(env);
  return new Response(JSON.stringify(m), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

async function apiAdminManifestGet(env) {
  const m = await readManifest(env);
  return json(m);
}

async function apiAdminManifestPost(request, env) {
  const m = await readManifest(env);
  let body;
  try { body = await request.json(); } catch (_e) { return json({ detail: "Invalid JSON" }, 400); }

  if (body.clear === true) {
    m.images = {};
  } else if (Array.isArray(body.unset)) {
    body.unset.forEach((k) => { delete m.images[k]; });
  } else if (body.set && typeof body.set === "object") {
    for (const k of Object.keys(body.set)) {
      if (typeof body.set[k] === "string") m.images[k] = body.set[k];
    }
  }
  await writeManifest(env, m);
  return json(m);
}

async function apiAdminUpload(request, env) {
  if (!env.IMAGES_BUCKET) return json({ detail: "IMAGES_BUCKET binding not configured" }, 500);
  const publicBase = (env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!publicBase) return json({ detail: "R2_PUBLIC_URL env var not configured" }, 500);

  let form;
  try { form = await request.formData(); } catch (_e) { return json({ detail: "Invalid multipart form" }, 400); }
  const file = form.get("file");
  const path = String(form.get("path") || "").trim();
  if (!file || typeof file === "string") return json({ detail: "Missing file" }, 400);
  if (!path) return json({ detail: "Missing path" }, 400);

  const ct = file.type || "application/octet-stream";
  if (!/^image\/(jpeg|png|webp|avif)$/.test(ct)) return json({ detail: "Unsupported image type: " + ct }, 400);

  const ext = ct.split("/")[1].replace("jpeg", "jpg");
  const slug = path.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const key = `uploads/${slug}-${rand}.${ext}`;
  const buf = await file.arrayBuffer();
  await env.IMAGES_BUCKET.put(key, buf, {
    httpMetadata: { contentType: ct, cacheControl: "public, max-age=31536000, immutable" },
  });
  const publicUrl = `${publicBase}/${key}`;

  const m = await readManifest(env);
  m.images[path] = publicUrl;
  await writeManifest(env, m);

  return json({ url: publicUrl, key, path });
}

function unauthorized() {
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function serveAdminPage(env) {
  if (!env.ASSETS) return new Response("ASSETS binding missing", { status: 500 });
  const r = await env.ASSETS.fetch(new Request("https://_/__admin_app/index.html"));
  if (!r.ok) return new Response("Admin UI missing", { status: 500 });
  const html = await r.text();
  const inject = `<script>window.__NYARA_CATALOG__ = ${JSON.stringify(IMAGE_CATALOG)};</script>`;
  const next = html.replace("</body>", inject + "\n</body>");
  return new Response(next, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    },
  });
}


// ----- Helpers ----------------------------------------------------------------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// ----- Worker entrypoint ------------------------------------------------------
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const p = url.pathname;

      if (p === "/api/booking/create-payment-intent" && request.method === "POST") {
        return await apiCreatePaymentIntent(request, env);
      }
      if (p.startsWith("/api/booking/payment-status/") && request.method === "GET") {
        const id = decodeURIComponent(p.split("/").pop());
        return await apiPaymentStatus(request, env, id);
      }
      if (p === "/api/booking/publishable-key" && request.method === "GET") {
        return await apiPublishableKey(env);
      }
      if (p === "/api/image-manifest" && request.method === "GET") {
        return await apiImageManifestPublic(env);
      }

      // -------- Secret admin routes (token in URL) --------
      const adminMatch = p.match(/^\/__admin\/([A-Za-z0-9]+)(\/.*)?$/);
      if (adminMatch) {
        const tokenIn = adminMatch[1];
        const sub = adminMatch[2] || "";
        const expected = (env.ADMIN_TOKEN || "").trim();
        if (!expected || !safeEq(tokenIn, expected)) return unauthorized();
        if (sub === "" || sub === "/") return await serveAdminPage(env);
        if (sub === "/api/manifest" && request.method === "GET") return await apiAdminManifestGet(env);
        if (sub === "/api/manifest" && request.method === "POST") return await apiAdminManifestPost(request, env);
        if (sub === "/api/upload" && request.method === "POST") return await apiAdminUpload(request, env);
        return json({ detail: "Not Found" }, 404);
      }

      if (p.startsWith("/api/")) {
        return json({ detail: "Not Found" }, 404);
      }
      // Never let visitors browse the raw admin source.
      if (p.startsWith("/__admin_app")) return unauthorized();

      // Static assets — let Cloudflare Pages serve them
      return env.ASSETS.fetch(request);
    } catch (e) {
      // Last-resort guard so the client always gets a parseable JSON error
      // instead of a Cloudflare 502 HTML page.
      return json({ detail: "Worker error: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
};
