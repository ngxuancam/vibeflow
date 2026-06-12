/**
 * Polyfill Bun.* APIs for Node.js runtime.
 * Uses require() to avoid TypeScript overload resolution issues.
 * Imported first in cli.ts — installs on globalThis.Bun if not already present.
 *
 * Supports: spawn, spawnSync, which, file, write, serve
 */

// Install polyfill only when NOT running under Bun
if (typeof globalThis.Bun === "undefined") {
  // Lazy-require Node.js modules — safe under both runtimes
  const cp = require("node:child_process");
  const fs = require("node:fs");
  const http = require("node:http");

  globalThis.Bun = {
    which(cmd) {
      const isWin = process.platform === "win32";
      const r = cp.spawnSync(
        isWin ? "where.exe" : "sh",
        isWin ? [cmd] : ["-c", `command -v ${cmd}`],
        { encoding: "utf8" },
      );
      if (r.status !== 0) return null;
      for (const line of (r.stdout ?? "").split(/\r?\n/)) {
        const t = line.trim();
        if (t) return t;
      }
      return null;
    },

    spawnSync(cmd, opts) {
      const stdin = opts?.stdin;
      const input = stdin instanceof Buffer ? stdin.toString() : undefined;
      const r = cp.spawnSync(cmd[0], cmd.slice(1), {
        input,
        encoding: "utf8",
        stdio: input ? ["pipe", "pipe", "pipe"] : undefined,
      });
      return {
        exitCode: r.status ?? 1,
        stdout: {
          toString() {
            return r.stdout ?? "";
          },
        },
        stderr: {
          toString() {
            return r.stderr ?? "";
          },
        },
      };
    },

    spawn(cmd, opts) {
      const child = cp.spawn(cmd[0], cmd.slice(1), {
        stdio: ["pipe", "pipe", "pipe"],
        env: opts?.env,
      });
      return {
        stdin: child.stdin
          ? {
              write(d) {
                child.stdin.write(d);
              },
              end() {
                child.stdin.end();
              },
            }
          : null,
        stdout: streamReader(child.stdout),
        stderr: streamReader(child.stderr),
        kill(sig) {
          child.kill(sig ?? "SIGTERM");
        },
        exited: new Promise((resolve) => {
          child.on("close", (c) => resolve(c ?? 1));
          child.on("error", () => resolve(1));
        }),
      };
    },

    file(path) {
      const resolved = (path?.pathname ?? path ?? "").toString();
      return {
        text() {
          return Promise.resolve(fs.readFileSync(resolved, "utf8"));
        },
        exists() {
          return fs.existsSync(resolved);
        },
        get size() {
          return fs.statSync(resolved, { throwIfNoEntry: false })?.size ?? 0;
        },
      };
    },

    write(path, data) {
      fs.writeFileSync(path, data);
      const len = typeof data === "string" ? Buffer.byteLength(data) : (data?.length ?? 0);
      return Promise.resolve(len);
    },

    serve(opts) {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const h = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") h.set(k, v);
          else if (Array.isArray(v)) for (const x of v) h.append(k, x);
        }
        let body;
        if (req.method !== "GET" && req.method !== "HEAD") {
          body = await new Promise((resolve) => {
            const c = [];
            req.on("data", (x) => c.push(x));
            req.on("end", () => resolve(Buffer.concat(c)));
          });
        }
        const request = new Request(url, { method: req.method, headers: h, body });
        const response = await opts.fetch(request);
        let respBody;
        try {
          respBody = await response.text();
        } catch {
          respBody = "";
        }
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(respBody);
      });
      const hostname = opts.hostname ?? "127.0.0.1";
      server.listen(opts.port ?? 0, hostname);
      return {
        get port() {
          return server.address()?.port ?? opts.port ?? 0;
        },
        stop() {
          server.close();
        },
      };
    },
  };
}

function streamReader(nodeStream) {
  const chunks = [];
  let done = false;
  nodeStream.on("data", (c) => chunks.push(c));
  nodeStream.on("end", () => {
    done = true;
  });
  let pos = 0;
  return {
    getReader() {
      return {
        async read() {
          if (pos < chunks.length) return { done: false, value: chunks[pos++] };
          if (done) return { done: true, value: undefined };
          return new Promise((resolve) => {
            nodeStream.once("data", (c) => resolve({ done: false, value: c }));
            nodeStream.once("end", () => resolve({ done: true, value: undefined }));
          });
        },
      };
    },
  };
}
