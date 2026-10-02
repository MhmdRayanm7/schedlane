import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/shared/api/api-error";
import {
  NotFoundPage,
  QueryErrorState,
} from "../src/shared/components/app-state-page";

describe("branded application states", () => {
  it("renders the top-level not-found copy and recovery link", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(html).toContain("Page not found");
    expect(html).toContain(
      "The page you&#x27;re looking for doesn&#x27;t exist or may have moved.",
    );
    expect(html).toContain('href="/"');
    expect(html).toContain("Go to Schedlane");
  });

  it("renders a retry and request reference without raw server details", () => {
    const retry = vi.fn();
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <QueryErrorState
          error={
            new ApiError({
              status: 500,
              code: "INTERNAL_ERROR",
              message: "SQL password leaked from stack",
              requestId: "request-abc",
            })
          }
          onRetry={retry}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).toContain("Reference: request-abc");
    expect(html).not.toMatch(/SQL|password|stack/i);
  });
});
