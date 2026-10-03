/**
 * Keep browser API requests on the Pages origin so auth cookies remain first-party.
 * API_ORIGIN is a runtime Pages variable containing the Northflank HTTPS origin.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    let upstream;
    try {
      upstream = new URL(env.API_ORIGIN);
      if (
        upstream.protocol !== "https:" ||
        upstream.username ||
        upstream.password ||
        upstream.pathname !== "/" ||
        upstream.search ||
        upstream.hash ||
        upstream.origin === url.origin
      ) {
        throw new Error("Invalid API origin");
      }
    } catch {
      return Response.json({ code: "API_UNAVAILABLE" }, { status: 503 });
    }

    upstream.pathname = url.pathname;
    upstream.search = url.search;
    const forwarded = new Request(upstream, request);
    // Auth redirects must go to the browser, never forward credentials to them.
    return fetch(new Request(forwarded, { redirect: "manual" }));
  },
};
