import { describe, expect, test } from "bun:test";
import { readVersion } from "../src/core.js";

describe("core.readVersion (test seam)", () => {
  test("readVersion: existsSync throws → returns '0.0.0' (line 19-20)", () => {
    // Inject a throwing existsSync → the try block throws → catch fires → fallback.
    const result = readVersion({
      existsSync: () => {
        throw new Error("disk on fire");
      },
    });
    expect(result).toBe("0.0.0");
  });

  test("readVersion: readFileSync throws → returns '0.0.0' (line 19-20)", () => {
    const result = readVersion({
      existsSync: () => true,
      readFileSync: () => {
        throw new Error("read failure");
      },
    });
    expect(result).toBe("0.0.0");
  });

  test("readVersion: JSON.parse throws → returns '0.0.0' (line 19-20)", () => {
    const result = readVersion({
      existsSync: () => true,
      readFileSync: () => "not json {",
    });
    expect(result).toBe("0.0.0");
  });

  test("readVersion: no package.json found → returns '0.0.0'", () => {
    const result = readVersion({ existsSync: () => false });
    expect(result).toBe("0.0.0");
  });

  test("readVersion: returns version when found", () => {
    const result = readVersion({
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: "9.9.9" }),
    });
    expect(result).toBe("9.9.9");
  });
});
