import { describe, expect, it } from "vitest";

import { formatUtcPlus8Time } from "./time";

describe("formatUtcPlus8Time", () => {
  it("converts utc timestamps to utc+8 with second precision", () => {
    expect(formatUtcPlus8Time("2026-04-13T00:49:06.123456+00:00")).toBe("2026-04-13 08:49:06 UTC+8");
  });

  it("returns the provided fallback for empty values", () => {
    expect(formatUtcPlus8Time(undefined, "PENDING")).toBe("PENDING");
    expect(formatUtcPlus8Time("", "PENDING")).toBe("PENDING");
  });

  it("does not throw on invalid strings", () => {
    expect(formatUtcPlus8Time("not-a-time")).toBe("not-a-time UTC+8");
  });

  it("keeps already formatted values stable enough for display", () => {
    expect(formatUtcPlus8Time("2026-04-13 04:49:06")).toBe("2026-04-13 04:49:06 UTC+8");
  });
});
