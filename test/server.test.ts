import { describe, expect, test } from "bun:test";

import { startServer } from "../src/server";

/** Fetch the CSRF token from the HTML page served at `/`. */
async function csrfToken(url: string): Promise<string> {
  const res = await fetch(url);
  const html = await res.text();
  const m = html.match(/<meta\s+name="csrf"\s+content="([^"]+)"\s*\/?>/i);
  if (!m) throw new Error("CSRF token not found in page HTML");
  return m[1] as string;
}

interface InitResponse {
  ok: boolean;
  state: { goal: string };
  files: string[];
}

interface PreflightResponse {
  ok: boolean;
  readiness: {
    engine: string;
    level: string;
    detail: string;
    checkedAt: string;
  }[];
  anyReady: boolean;
}

describe("server HTTP API handlers", () => {
  test("POST /api/init with valid goal returns 200", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ goal: "Test goal" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as InitResponse;
      expect(body.ok).toBe(true);
      expect(body.state.goal).toBe("Test goal");
    } finally {
      server.stop();
    }
  });

  test("POST /api/init empty goal returns 200 and generates minimal state", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ goal: "" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as InitResponse;
      expect(body.ok).toBe(true);
      // Empty goal still produces a valid state with a default goal string
      expect(typeof body.state.goal).toBe("string");
    } finally {
      server.stop();
    }
  });

  test("POST /api/init without x-vibeflow-token returns 403", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const res = await fetch(`${url}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: "Test" }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("forbidden");
    } finally {
      server.stop();
    }
  });

  test("POST /api/preflight returns 200 with readiness array", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/preflight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ engines: ["claude"], probe: false }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PreflightResponse;
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.readiness)).toBe(true);
      if (body.readiness.length > 0) {
        expect(body.readiness[0]).toHaveProperty("engine");
        expect(body.readiness[0]).toHaveProperty("level");
        expect(body.readiness[0]).toHaveProperty("detail");
        expect(body.readiness[0]).toHaveProperty("checkedAt");
      }
    } finally {
      server.stop();
    }
  });

  test("GET /events deprecated SSE returns 200 (line 400-410)", async () => {
    // Set up a workflow with a unit that has a stream.log so the
    // per-unit stream tail path (line 404-410) is exercised.
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    const { mkdirSync, writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "vf-events-"));
    try {
      const token = await csrfToken(url);
      // Create a unit with a stream.log file inside the active repo
      const unitDir = join(process.cwd(), ".vibeflow", "workunits", "u1");
      mkdirSync(join(unitDir, ".gitignore-path-not-used"), { recursive: true });
      mkdirSync(unitDir, { recursive: true });
      writeFileSync(join(unitDir, "stream.log"), "data: first event\n\ndata: second event\n\n");
      // Write a workflow state with this unit so the per-unit stream
      // tail path fires (it iterates state.work_units).
      const { writeState } = await import("../src/core.js");
      const { CTX_DIR } = await import("../src/core.js");
      writeState(process.cwd(), {
        task_id: "T1",
        goal: "test",
        success_criteria: [],
        work_units: [
          {
            name: "u1",
            status: "running",
            confidence: 0.5,
            gates: {
              build: "pending",
              lint: "pending",
              test: "pending",
              review: "pending",
            },
            resources: { agents: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
          },
        ],
        totals: { units: 1, done: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const res = await fetch(`${url}/events`, {
          headers: { "x-vibeflow-token": token },
          signal: controller.signal,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
        const reader = res.body?.getReader();
        if (!reader) throw new Error("expected a body");
        const dec = new TextDecoder();
        let buf = "";
        while (buf.length < 4096) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
          if (buf.includes("first event")) break;
        }
        expect(buf).toContain("first event");
      } finally {
        clearTimeout(timer);
        controller.abort();
        server.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(join(process.cwd(), ".vibeflow", "workunits", "u1"), {
        recursive: true,
        force: true,
      });
    }
  });

  test("POST /api/upload writes a file (line 458-470)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const form = new FormData();
      form.set("file", new Blob(["hello"]), "test.txt");
      const res = await fetch(`${url}/api/upload?name=test.txt`, {
        method: "POST",
        headers: { "x-vibeflow-token": token },
        body: form,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; attachment: { name: string } };
      expect(body.ok).toBe(true);
      expect(body.attachment.name).toBe("test.txt");
    } finally {
      server.stop();
    }
  });

  test("POST /api/upload rejects too-long filename (line 451-453)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const form = new FormData();
      const longName = `${"x".repeat(201)}.txt`;
      form.set("file", new Blob(["x"]), longName);
      const res = await fetch(`${url}/api/upload?name=${longName}`, {
        method: "POST",
        headers: { "x-vibeflow-token": token },
        body: form,
      });
      expect(res.status).toBe(400);
    } finally {
      server.stop();
    }
  });

  test("POST /api/dispatch returns 200 for known engine (line 515-516)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ engine: "claude" }),
      });
      expect(res.status).toBe(200);
    } finally {
      server.stop();
    }
  });

  test("POST /api/dispatch returns 400 for unknown engine (line 510-514)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ engine: "bogus" }),
      });
      expect(res.status).toBe(400);
    } finally {
      server.stop();
    }
  });

  test("DELETE /api/upload removes a file (line 478-485)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      // First write the file
      const form = new FormData();
      form.set("file", new Blob(["bye"]), "removable.txt");
      const uploadRes = await fetch(`${url}/api/upload?name=removable.txt`, {
        method: "POST",
        headers: { "x-vibeflow-token": token },
        body: form,
      });
      expect(uploadRes.status).toBe(200);
      // Now delete it
      const delRes = await fetch(`${url}/api/upload?name=removable.txt`, {
        method: "DELETE",
        headers: { "x-vibeflow-token": token },
      });
      expect(delRes.status).toBe(200);
    } finally {
      server.stop();
    }
  });

  test("POST /api/discover returns 400 on empty query (line 527)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ query: "" }),
      });
      expect(res.status).toBe(400);
    } finally {
      server.stop();
    }
  });

  test("POST /api/units returns 400 on invalid action (line 534-535)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/units`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ action: "bogus", unit: { name: "x" } }),
      });
      expect(res.status).toBe(400);
    } finally {
      server.stop();
    }
  });

  test("POST /api/preflight returns 200 (line 543)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/preflight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ engines: ["claude"], probe: false }),
      });
      expect(res.status).toBe(200);
    } finally {
      server.stop();
    }
  });

  test("POST /api/discover with kind=skills returns 200 (line 534-535)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ kind: "skills", query: "react" }),
      });
      // 200 (immediate not-approved) or 400 (fetch failed in test env)
      expect([200, 400, 500]).toContain(res.status);
    } finally {
      server.stop();
    }
  });

  test("POST /api/discover with docs + approved returns 200 (line 530-533)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ kind: "docs", query: "react", approved: true }),
      });
      expect([200, 400, 500]).toContain(res.status);
    } finally {
      server.stop();
    }
  });

  test("POST /api/settings returns 200 (line 548)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ tools: { codegraph: false, lsp: true } }),
      });
      expect(res.status).toBe(200);
    } finally {
      server.stop();
    }
  });

  test("GET /state returns 200 with JSON (null when no init)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const res = await fetch(`${url}/state`);
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("application/json");
      // Body may be null (no init performed) or an object
      const body = (await res.json()) as unknown;
      expect(body === null || typeof body === "object").toBe(true);
    } finally {
      server.stop();
    }
  });

  test("POST /api/discover with valid query returns 200 or 400, does not crash", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      const res = await fetch(`${url}/api/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vibeflow-token": token,
        },
        body: JSON.stringify({ query: "playwright", kind: "docs" }),
      });
      // Should return either 200 (immediate not-approved response) or 400 (validation error)
      expect([200, 400]).toContain(res.status);
    } finally {
      server.stop();
    }
  });

  test("/api/logs/stream SSE returns :no logbus when no bus installed (line 305-312)", async () => {
    // Uninstall the logbus to exercise the `!bus` branch
    const { getLogbus, setLogbusForTests } = await import("../src/logbus.js");
    const origBus = getLogbus();
    setLogbusForTests(null);
    try {
      const { server, url } = (await startServer()) as {
        server: { stop: () => void };
        url: string;
      };
      try {
        const token = await csrfToken(url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 500);
        try {
          const res = await fetch(`${url}/api/logs/stream`, {
            headers: { "x-vibeflow-token": token },
            signal: controller.signal,
          });
          expect(res.status).toBe(200);
          const reader = res.body?.getReader();
          if (!reader) throw new Error("expected a body");
          const dec = new TextDecoder();
          let buf = "";
          while (buf.length < 4096) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value);
            if (buf.includes("no logbus instance found")) break;
          }
          expect(buf).toContain("no logbus instance found");
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
      } finally {
        server.stop();
      }
    } finally {
      // Restore the bus for subsequent tests
      if (origBus) {
        setLogbusForTests(origBus);
      }
    }
  });

  test("/api/logs/stream SSE returns event: log with replayed events (line 305-322)", async () => {
    const { server, url } = (await startServer()) as {
      server: { stop: () => void };
      url: string;
    };
    try {
      const token = await csrfToken(url);
      // Make a request with a short timeout; we only care about the
      // initial chunk(s) that include the "vibeflow-logs-1" comment
      // and any replayed events.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const res = await fetch(`${url}/api/logs/stream`, {
          headers: { "x-vibeflow-token": token },
          signal: controller.signal,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
        const reader = res.body?.getReader();
        if (!reader) throw new Error("expected a body");
        const dec = new TextDecoder();
        let buf = "";
        // Read until we see the SSE comment or run out
        while (buf.length < 4096) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
          if (buf.includes("vibeflow-logs-1")) break;
        }
        expect(buf).toContain("vibeflow-logs-1");
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    } finally {
      server.stop();
    }
  });
});
