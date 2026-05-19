
const FALLBACK_PAGE = "https://ir-netlify.github.io/NETLIFY/new/new.html";

const BLOCKED_HEADERS = [
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"
];

const constructDestUrl = (domain, path, query) => {
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    return `${domain}${path}${query}`;
  }
  const isHttps = !domain.includes(':') || domain.includes(':443') || /^s\d+\./.test(domain);
  return `${isHttps ? 'https://' : 'http://'}${domain}${path}${query}`;
};

export default async (req, ctx) => {
  try {
    const parsedUrl = new URL(req.url);
    const destHost = req.headers.get("x-host");

    // Handle root path fallback
    if (parsedUrl.pathname === "/" && !destHost) {
      const wsCheck = (req.headers.get("upgrade") || "").toLowerCase();
      if (wsCheck !== "websocket") {
        const fallbackRes = await fetch(FALLBACK_PAGE);
        return new Response(await fallbackRes.text(), {
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }
    }

    if (!destHost) {
      return new Response("Invalid Request: Missing target host.", { status: 400 });
    }

    const finalUrl = constructDestUrl(destHost, parsedUrl.pathname, parsedUrl.search);
    const proxyHeaders = new Headers();
    let clientAddress = null;

    req.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (BLOCKED_HEADERS.includes(lowerKey) || lowerKey.startsWith("x-nf-") || lowerKey.startsWith("x-netlify-") || lowerKey === "x-host") {
        return;
      }
      
      if (lowerKey === "x-real-ip") {
        clientAddress = value;
        return;
      }
      if (lowerKey === "x-forwarded-for") {
        if (!clientAddress) clientAddress = value;
        return;
      }
      proxyHeaders.set(lowerKey, value);
    });

    if (clientAddress) {
      proxyHeaders.set("x-forwarded-for", clientAddress);
    }

    const reqMethod = req.method;
    const fetchConfig = {
      method: reqMethod,
      headers: proxyHeaders,
      redirect: "manual",
      body: (reqMethod === "GET" || reqMethod === "HEAD") ? undefined : req.body,
    };

    const serverRes = await fetch(finalUrl, fetchConfig);
    const responseHeaders = new Headers();
    
    serverRes.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "transfer-encoding") {
        responseHeaders.set(key, value);
      }
    });

    return new Response(serverRes.body, {
      status: serverRes.status,
      headers: responseHeaders,
    });

  } catch (err) {
    return new Response("Gateway Error: Connection Failed", { status: 502 });
  }
};
