import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_TOKEN_STORAGE_KEY,
  clearApiToken,
  getApiToken,
  hasApiToken,
  health,
  healthSnapshot,
  setApiToken,
} from "./api";

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe("API token session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ summary: {} })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("omits Authorization when no session token exists", async () => {
    await health();

    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: { "Content-Type": "application/json" },
    });
    expect((vi.mocked(fetch).mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("adds a bearer token to health and health snapshot requests", async () => {
    window.sessionStorage.setItem(API_TOKEN_STORAGE_KEY, "secret-token");

    await health();
    await healthSnapshot();

    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init).toMatchObject({
        headers: { Authorization: "Bearer secret-token" },
      });
    }
  });

  it("stores, reports, and clears the current session token", () => {
    expect(setApiToken(" secret-token ")).toBe(true);
    expect(getApiToken()).toBe("secret-token");
    expect(hasApiToken()).toBe(true);

    expect(clearApiToken()).toBe(true);
    expect(getApiToken()).toBe("");
    expect(hasApiToken()).toBe(false);
  });

  it("falls back safely when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(getApiToken()).toBe("");
    expect(setApiToken("secret-token")).toBe(false);
    expect(clearApiToken()).toBe(false);
    expect(hasApiToken()).toBe(false);
  });
});
