import { describe, expect, it } from "vitest";
import { redactUrl } from "./http.ts";

describe("redactUrl", () => {
  it("redacts credential-like query parameters", () => {
    const url = "https://api.example.test/x?subscription-key=abc123&apiKey=zzz&token=t&page=2";
    const redacted = redactUrl(url);
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("zzz");
    expect(redacted).not.toContain("=t&");
    expect(redacted).toContain("page=2");
  });

  it("leaves URLs without credentials unchanged", () => {
    const url = "https://services-eu1.arcgis.com/a/FeatureServer/0/query?where=1%3D1&f=json";
    expect(redactUrl(url)).toBe(url);
  });
});
