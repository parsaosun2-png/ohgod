export const config = {
  // Force the Edge Runtime to keep costs and CPU limits near zero
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
    
    // THE FIX: We manually strip the /api prefix before talking to the VPS.
    // If the request is /api/netme/1234, it becomes /netme/1234.
    let cleanPath = url.pathname;
    if (cleanPath.startsWith('/api')) {
      cleanPath = cleanPath.substring(4); 
    }
    if (!cleanPath) cleanPath = '/';

    // The target is now perfectly mapped: https://split.mirela.ir:8443/netme/...
    const targetUrl = TARGET_BASE + cleanPath + url.search;

    const outHeaders = new Headers();
    let clientIp = null;

    for (const [key, val] of req.headers.entries()) {
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
      // 'duplex: half' is required by Web Streams for request bodies
      ...(hasBody && { body: req.body, duplex: "half" }),
    };

    // Ping the X-UI VPS
    const upstream = await fetch(targetUrl, fetchOpts);

    const resHeaders = new Headers();
    for (const [k, v] of upstream.headers.entries()) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      resHeaders.set(k, v);
    }

    // Pipe the response back to the client
    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
    
  } catch (err) {
    console.error("Relay error:", err);
    return new Response("Bad Gateway", { status: 502 });
  }
}
