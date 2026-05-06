export const config = {
  // Forces the highly efficient Edge runtime
  runtime: 'edge',
};

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

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Configuration Error: ME_TAR missing.", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    
    // url.pathname will be exactly what the client asks for (e.g., /netme)
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const outHeaders = new Headers();
    let clientIp = null;

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
      ...(hasBody && { body: req.body, duplex: "half" }),
    };

    const upstream = await fetch(targetUrl, fetchOpts);

    const resHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      resHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
    
  } catch (err) {
    console.error("Relay error:", err);
    return new Response("Bad Gateway", { status: 502 });
  }
}
