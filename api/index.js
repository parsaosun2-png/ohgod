// app/api/[...path]/route.js

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TARGET_BASE = (process.env.ME_TAR || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

async function relay(req) {
  if (!TARGET_BASE) {
    return new Response("What the fuck: ME_TAR", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const outHeaders = new Headers();
    let clientIp = null;

    // Filter and copy headers
    for (const [key, val] of req.headers) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") { clientIp = val; continue; }
      if (k === "x-forwarded-for") { if (!clientIp) clientIp = val; continue; }
      outHeaders.set(k, val);
    }

    if (clientIp) {
      outHeaders.set("x-forwarded-for", clientIp);
    }

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const fetchOpts = {
      method,
      headers: outHeaders,
      redirect: "manual",
      // 'duplex: half' is mandatory for Edge Web Streams with request bodies
      ...(hasBody && { body: req.body, duplex: "half" }),
    };

    // Forward the request to your X-UI VPS
    const upstream = await fetch(targetUrl, fetchOpts);

    const resHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      resHeaders.set(k, v);
    }

    // Stream the body straight through to the client
    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
    
  } catch (err) {
    console.error("Relay error:", err);
    return new Response("shit went bad: failed", { status: 502 });
  }
}

// Explicitly export all necessary methods for XHTTP and pre-flight checks
export async function GET(req)     { return relay(req); }
export async function POST(req)    { return relay(req); }
export async function PUT(req)     { return relay(req); }
export async function PATCH(req)   { return relay(req); }
export async function DELETE(req)  { return relay(req); }
export async function HEAD(req)    { return relay(req); }
export async function OPTIONS(req) { return relay(req); }