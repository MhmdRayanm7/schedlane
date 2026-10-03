import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../public/_worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("Pages API proxy", () => {
  it("forwards authenticated writes and query strings only to the configured API", async () => {
    const response = new Response(null, {
      status: 302,
      headers: {
        location: "https://web.example/app",
        "set-cookie": "session=example; Secure; HttpOnly; SameSite=Lax",
      },
    });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);
    const request = new Request(
      "https://web.example/api/auth/sign-in/email?x=1",
      {
        method: "POST",
        headers: {
          origin: "https://web.example",
          cookie: "session=example",
          "content-type": "application/json",
        },
        body: '{"email":"test@example.com"}',
      },
    );
    expect(
      await worker.fetch(request, { API_ORIGIN: "https://api.example" }),
    ).toBe(response);
    const forwarded = fetch.mock.calls[0][0];
    expect(forwarded.url).toBe(
      "https://api.example/api/auth/sign-in/email?x=1",
    );
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("origin")).toBe("https://web.example");
    expect(forwarded.headers.get("cookie")).toBe("session=example");
    expect(await forwarded.text()).toBe('{"email":"test@example.com"}');
    expect(forwarded.redirect).toBe("manual");
  });

  it("serves nested web routes through Pages assets", async () => {
    const response = new Response("app");
    const assets = vi.fn().mockResolvedValue(response);
    const request = new Request("https://web.example/booking/manage");
    expect(await worker.fetch(request, { ASSETS: { fetch: assets } })).toBe(
      response,
    );
    expect(assets).toHaveBeenCalledWith(request);
  });

  it.each([
    undefined,
    "http://api.example",
    "https://web.example",
    "https://user:password@api.example",
    "https://api.example/path",
    "https://api.example?url=other",
  ])("fails closed for invalid API configuration: %s", async (API_ORIGIN) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await worker.fetch(
      new Request("https://web.example/api/organizations"),
      { API_ORIGIN },
    );
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
