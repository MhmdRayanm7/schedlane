import { describe, expect, it } from "vitest";
import { renderVerificationEmail } from "../../../src/modules/auth/verification-email.js";

describe("verification email", () => {
  it("includes a branded HTML action and a plain-text fallback", () => {
    const url =
      "http://localhost:3000/api/auth/verify-email?token=test&callbackURL=local";
    const email = renderVerificationEmail("person@example.test", url);
    expect(email.to).toBe("person@example.test");
    expect(email.subject).toBe("Verify your Schedlane email");
    expect(email.text).toContain(url);
    expect(email.html).toContain(
      'href="http://localhost:3000/api/auth/verify-email?token=test&amp;callbackURL=local"',
    );
    expect(email.html).toContain(">Verify email</a>");
    expect(email.html?.replace(/<[^>]*>/g, "")).not.toContain("token=test");
  });

  it("escapes URL characters that could break out of the link attribute", () => {
    const email = renderVerificationEmail(
      "person@example.test",
      "https://example.test/?value=\"<tag>'&",
    );
    expect(email.html).toContain("value=&quot;&lt;tag&gt;&#039;&amp;");
    expect(email.html).not.toContain("<tag>");
  });
});
