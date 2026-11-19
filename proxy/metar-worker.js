/**
 * Optional METAR proxy for the HOT 26-27 app (Cloudflare Worker, free tier is plenty).
 *
 * Why: aviationweather.gov (worldwide, current METARs) does not send CORS headers, so a browser app
 * cannot call it directly. This worker forwards a single request and adds CORS.
 *
 * Deploy: Cloudflare dashboard → Workers & Pages → Create → "Hello World" worker → paste this file → Deploy.
 * Then in the app: Info tab → METAR source → paste the worker URL (e.g. https://hot-metar.<you>.workers.dev).
 *
 * Request:  GET https://<worker>/?ids=KORD     (1–10 comma-separated ICAO ids)
 * Response: aviationweather.gov /api/data/metar JSON array (passed through unchanged)
 */
const ALLOWED_ORIGINS = ["*"]; // optionally restrict, e.g. ["https://tmgolfkid359.github.io"]

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "*";
    const allow = ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS.includes(origin) ? origin : "null";
    const cors = { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const ids = (new URL(request.url).searchParams.get("ids") || "").toUpperCase();
    if (!/^[A-Z][A-Z0-9]{3}(,[A-Z][A-Z0-9]{3}){0,9}$/.test(ids)) {
      return new Response(JSON.stringify({ error: "ids must be 1-10 ICAO identifiers" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const upstream = `https://aviationweather.gov/api/data/metar?format=json&ids=${ids}`;
    const res = await fetch(upstream, { headers: { "User-Agent": "hot-2627-metar-proxy" }, cf: { cacheTtl: 60 } });
    const body = await res.text();
    return new Response(body || "[]", {
      status: res.status === 204 ? 200 : res.status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "max-age=60" },
    });
  },
};
