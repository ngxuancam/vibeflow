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
    text: async () => JSON.stringify(body),
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

describe("context7 legacy sync API (lookupDocs/searchSkills)", () => {
  test("lookupDocs returns approvalRequired when not approved", async () => {
    const { lookupDocs } = await import("../src/discovery/context7.js");
    const r = lookupDocs("react");
    expect(r.ok).toBe(false);
    expect(r.approvalRequired).toBe(true);
  });

  test("lookupDocs returns notWired when approved but no runner injected (line 215-219)", async () => {
    const { lookupDocs } = await import("../src/discovery/context7.js");
    const r = lookupDocs("react", { approved: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("use lookupDocs");
  });

  test("searchSkills returns approvalRequired when not approved", async () => {
    const { searchSkills } = await import("../src/discovery/context7.js");
    const r = searchSkills("react");
    expect(r.ok).toBe(false);
    expect(r.approvalRequired).toBe(true);
  });

  test("searchSkills returns notWired when approved but no runner injected", async () => {
    const { searchSkills } = await import("../src/discovery/context7.js");
    const r = searchSkills("react", { approved: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("use lookupDocs");
  });

  test("lookupDocs forwards to runner and parses JSON lines", async () => {
    const { lookupDocs } = await import("../src/discovery/context7.js");
    const r = lookupDocs("react", {
      approved: true,
      runner: () => ({
        status: 0,
        stdout: '{"title": "React Hooks", "snippet": "useState"}\n',
      }),
    });
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
  });

  test("lookupDocs returns ok:false when runner exits non-zero", async () => {
    const { lookupDocs } = await import("../src/discovery/context7.js");
    const r = lookupDocs("react", {
      approved: true,
      runner: () => ({ status: 1, stdout: "" }),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("docs lookup failed");
  });
});

describe("context7 HTTP edge branches", () => {
  test("HTTP 4xx/5xx response yields ok:false (line 116-117)", async () => {
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () =>
      new Response("not found", { status: 404 })) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("HTTP 404");
  });

  test("non-JSON markdown body is parsed as markdown (line 122-123)", async () => {
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () =>
      new Response("### React Hooks\nuseState is a hook.\n\n### React Router\nRouting library.\n", {
        headers: { "content-type": "text/markdown" },
      })) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
  });

  test("fetchFn throws → ok:false with the error message (line 124-128)", async () => {
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("network down");
  });

  test("non-throwing non-Error rejected promise → ok:false with String(err)", async () => {
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "string error";
    }) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("string error");
  });

  test("JSON body with no rows keys → empty array (line 95-97)", async () => {
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () =>
      new Response(JSON.stringify({ unrelated: "x" }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(0);
  });

  test("JSON body with results key parses correctly", async () => {
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () =>
      new Response(JSON.stringify({ results: [{ title: "Found", snippet: "x" }] }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
  });
});

describe("context7 internal helpers (test seams)", () => {
  test("parseLines: non-JSON line falls back to text (line 317)", async () => {
    const { parseLines } = await import("../src/discovery/context7.js");
    const out = parseLines('not json\n{"a":"b"}');
    // First line is plain text → catch fires → {text: "not json"}
    expect(out[0]).toEqual({ text: "not json" });
    // Second line is valid JSON
    expect(out[1]).toEqual({ a: "b" });
  });

  test("discoveryAvailable: returns true when fetch is defined (line 69)", () => {
    const { discoveryAvailable } = require("../src/discovery/context7.js");
    // fetch is always defined in bun:test env
    expect(discoveryAvailable()).toBe(true);
  });

  test("ctxPath: joins CTX_DIR with parts (core 172)", () => {
    const { ctxPath } = require("../src/core.js");
    const p = ctxPath("a", "b");
    // Should contain .vibeflow + a/b
    expect(p).toContain(".vibeflow");
    expect(p).toContain("a");
    expect(p).toContain("b");
  });

  test("safeSkillName returns undefined for non-string input (line 69)", async () => {
    const { safeSkillName } = await import("../src/discovery/context7.js");
    // The function accepts `unknown`. Non-strings return undefined.
    expect(safeSkillName(42)).toBeUndefined();
    expect(safeSkillName(null)).toBeUndefined();
    expect(safeSkillName(undefined)).toBeUndefined();
    expect(safeSkillName({ name: "x" })).toBeUndefined();
    expect(safeSkillName(["react"])).toBeUndefined();
  });

  test("safeSkillName returns the string for valid kebab-case", async () => {
    const { safeSkillName } = await import("../src/discovery/context7.js");
    expect(safeSkillName("react-hooks")).toBe("react-hooks");
    expect(safeSkillName("  rust-debugging  ")).toBe("rust-debugging");
  });

  test("safeSkillName returns undefined for invalid kebab-case", async () => {
    const { safeSkillName } = await import("../src/discovery/context7.js");
    expect(safeSkillName("React")).toBeUndefined(); // uppercase
    expect(safeSkillName("react hooks")).toBeUndefined(); // space
    expect(safeSkillName("-leading-dash")).toBeUndefined();
    expect(safeSkillName("trailing-dash-")).toBeUndefined();
  });
});

describe("context7 parseMarkdownContext code-block branches (line 295)", () => {
  test("parses markdown with a code block and strips fences", async () => {
    // Use the public function searchSkillsHttp with markdown body and
    // inspect the rows. The markdown has ```ts\\nblock code\\n``` —
    // exercises the codeMatch branch at line 295.
    const { searchSkillsHttp } = await import("../src/discovery/context7.js");
    const fetchFn = (async () =>
      new Response("### React Hooks\n```ts\nconst x = useState(0);\n```\nMore text.\n", {
        headers: { "content-type": "text/markdown" },
      })) as unknown as typeof fetch;
    const r = await searchSkillsHttp("react", { approved: true, fetchFn });
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    // The snippet should have the code block fences stripped
    expect(r.results[0]?.snippet).toContain("const x = useState(0);");
    expect(r.results[0]?.snippet).not.toContain("```");
  });
});
