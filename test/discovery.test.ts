import { describe, expect, test } from "bun:test";
import {
  CONTEXT7_BASE,
  type DiscoveryResult,
  lookupDocsHttp,
  searchSkillsHttp,
} from "../src/discovery/context7.js";

/** Build a minimal Response-like object so we never touch the network. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe("discovery/context7 (HTTP via fetch)", () => {
  test("requires approval before any network call", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const out = await searchSkillsHttp("pdf", { fetchFn });
    expect(out.approvalRequired).toBe(true);
    expect(called).toBe(false);
  });

  test("(a) a normal search response parses into experimental skill results", async () => {
    const fetchFn = (async (url: string) => {
      expect(url.startsWith(`${CONTEXT7_BASE}/api/v2/libs/search`)).toBe(true);
      expect(url).toContain("query=pdf");
      return jsonResponse({
        results: [{ name: "pdf-reader", description: "reads pdf files" }],
      });
    }) as unknown as typeof fetch;
    const out = await searchSkillsHttp("pdf", { approved: true, fetchFn });
    expect(out.ok).toBe(true);
    const first = out.results[0] as DiscoveryResult;
    expect(first.title).toBe("pdf-reader");
    // (d) discovery results are forced experimental, never verified.
    expect(first.status).toBe("experimental");
    expect(first.name).toBe("pdf-reader");
  });

  test("docs lookup searches then fetches context and parses docs results", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      // Step 1: search for library to get real ID
      if (url.includes("/api/v2/libs/search")) {
        return jsonResponse({ results: [{ id: "/facebook/react", title: "React" }] });
      }
      // Step 2: fetch context with the resolved ID
      return jsonResponse({ results: [{ title: "React Hooks", snippet: "useState docs" }] });
    }) as unknown as typeof fetch;
    const out = await lookupDocsHttp("react", { approved: true, fetchFn });
    expect(out.ok).toBe(true);
    expect(urls[0]).toContain("/libs/search");
    expect(urls[1]).toContain("/api/v2/context");
    expect(urls[1]).toContain("%2Ffacebook%2Freact");
    expect(out.results[0]?.title).toBe("React Hooks");
    expect(out.results[0]?.kind).toBe("docs");
  });

  test("(b) offline / thrown fetch fails gracefully without throwing", async () => {
    const fetchFn = (async () => {
      throw new Error("getaddrinfo ENOTFOUND context7.com");
    }) as unknown as typeof fetch;
    const out = await searchSkillsHttp("pdf", { approved: true, fetchFn });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("context7");
    expect(out.results).toEqual([]);
  });

  test("a non-2xx response is reported as a failed outcome, not a throw", async () => {
    const fetchFn = (async (url: string) => {
      if (url.includes("/libs/search")) {
        return jsonResponse({ results: [{ id: "/facebook/react" }] });
      }
      return jsonResponse({}, { ok: false, status: 503 });
    }) as unknown as typeof fetch;
    const out = await lookupDocsHttp("react", { approved: true, fetchFn });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("503");
  });

  test("(c) a malicious skill name is sanitized away so it can never become a path", async () => {
    const fetchFn = (async () =>
      jsonResponse({
        results: [
          { name: "../../etc/passwd", description: "evil" },
          { name: "Bad Name", description: "evil2" },
          { name: "good-reader", description: "fine" },
        ],
      })) as unknown as typeof fetch;
    const out = await searchSkillsHttp("anything", { approved: true, fetchFn });
    expect(out.ok).toBe(true);
    // Only the regex-valid name keeps a usable `name`; unsafe ones are nulled out.
    const names = out.results.map((r) => r.name).filter(Boolean);
    expect(names).toEqual(["good-reader"]);
    for (const r of out.results) {
      if (r.name) expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.name)).toBe(true);
    }
  });

  test("a bounded timeout is requested so discovery never hangs", async () => {
    let sawSignal = false;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return jsonResponse({ results: [] });
    }) as unknown as typeof fetch;
    await searchSkillsHttp("x", { approved: true, fetchFn, timeoutMs: 1000 });
    expect(sawSignal).toBe(true);
  });

  test("an API key is sent as a Bearer header when provided", async () => {
    let auth: string | undefined;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      auth = headers.get("authorization") ?? undefined;
      return jsonResponse({ results: [] });
    }) as unknown as typeof fetch;
    await searchSkillsHttp("x", { approved: true, fetchFn, apiKey: "secret-token" });
    expect(auth).toBe("Bearer secret-token");
  });
});
