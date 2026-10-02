import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/shared/api/api-error";
import { ApiNetworkError } from "../src/shared/api/api-network-error";
import { apiClient } from "../src/shared/api/client";
import { queryErrorDescription } from "../src/shared/components/app-state-page";

afterEach(() => vi.unstubAllGlobals());

describe("API client failures", () => {
  it("normalizes network failures without exposing fetch internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(apiClient("/test")).rejects.toBeInstanceOf(ApiNetworkError);
    expect(queryErrorDescription(new ApiNetworkError())).toBe(
      "We couldn't connect to Schedlane. Check your connection and try again.",
    );
  });

  it("preserves AbortError for normal query cancellation", async () => {
    const aborted = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
    await expect(apiClient("/test")).rejects.toBe(aborted);
  });

  it("uses safe rate-limit copy and retains a support reference", () => {
    const error = new ApiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "plugin detail",
      requestId: "request-123",
    });
    expect(queryErrorDescription(error)).toBe(
      "Too many requests. Please wait a moment and try again.",
    );
    expect(error.requestId).toBe("request-123");
  });
});
