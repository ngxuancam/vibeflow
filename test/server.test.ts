import { describe, expect, test } from "bun:test";
import type { Server } from "node:http";
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
      server: Server;
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
      server.close();
    }
  });

  test("POST /api/init empty goal returns 200 and generates minimal state", async () => {
    const { server, url } = (await startServer()) as {
      server: Server;
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
      server.close();
    }
  });

  test("POST /api/init without x-vibeflow-token returns 403", async () => {
    const { server, url } = (await startServer()) as {
      server: Server;
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
      server.close();
    }
  });

  test("POST /api/preflight returns 200 with readiness array", async () => {
    const { server, url } = (await startServer()) as {
      server: Server;
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
      server.close();
    }
  });

  test("GET /state returns 200 with JSON (null when no init)", async () => {
    const { server, url } = (await startServer()) as {
      server: Server;
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
      server.close();
    }
  });

  test("POST /api/discover with valid query returns 200 or 400, does not crash", async () => {
    const { server, url } = (await startServer()) as {
      server: Server;
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
      server.close();
    }
  });
});
