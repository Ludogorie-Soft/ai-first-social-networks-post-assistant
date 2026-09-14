/**
 * The Prisma CLI connection policy, pinned.
 *
 * `prisma.config.ts` decides which database URL every Prisma subcommand gets:
 * schema work must use DIRECT_URL, everything else keeps the pooled DATABASE_URL.
 * That rule is invisible at runtime and its failure mode is delayed and nasty — a
 * migration run through pgbouncer can orphan a session advisory lock and fail
 * EVERY later migration with P1002 — so it is tested rather than trusted.
 *
 * Each case runs the real config file in a SUBPROCESS, because the policy's
 * inputs are `process.argv` and `process.env` and its failure path calls
 * `process.exit(1)`. Neither can be exercised in-process.
 *
 * `DOTENV_CONFIG_PATH` is pointed at a file that does not exist, so `dotenv/config`
 * inside the config loads nothing and each case controls the environment
 * completely. No real .env file is read, written, or needed, and no database
 * connection is ever made — the config is imported, not executed by the CLI.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const POOLED = "postgresql://u:p@ep-test-pooler.eu-central-1.aws.neon.tech/db";
const DIRECT = "postgresql://u:p@ep-test.eu-central-1.aws.neon.tech/db";

/**
 * A probe that loads the real config and reports which host it resolved to.
 *
 * The namespace import plus manual unwrap is load-bearing, not stylistic. This
 * project has no `"type": "module"` in package.json, so tsx compiles a plain
 * `.ts` file to CommonJS; a bare `import cfg from "…"` on such a module binds
 * `cfg` to the WHOLE `module.exports` object (`{ default: <config>, __esModule:
 * true }`), not to the config itself — confirmed with a two-line reproduction
 * file, so it is a general fact about this environment, not a `prisma.config.ts`
 * defect. The real Prisma CLI is unaffected: it loads config files through its
 * own loader, which already performs this unwrap (proven by `npm run db:status`
 * correctly reporting the direct host in production use). This is the identical
 * "unwrap a possibly-double-wrapped default" dance every config-loading tool
 * (vite, tsup, jiti…) does for exactly this reason.
 */
const PROBE = `
import * as mod from "../prisma.config.ts";
const raw = (mod as { default: unknown }).default;
const cfg = raw && typeof raw === "object" && "default" in raw
  ? (raw as { default: unknown }).default
  : raw;
const url = (cfg as { datasource: { url: string } }).datasource.url;
console.log("RESOLVED:" + (url.includes("-pooler") ? "pooled" : "direct"));
`;

interface Outcome {
  status: number;
  resolved: "pooled" | "direct" | null;
  stderr: string;
  stdout: string;
}

/** Loads prisma.config.ts as `prisma <args>` would, under a controlled env. */
function runConfig(args: string[], env: Record<string, string | undefined>): Outcome {
  const dir = mkdtempSync(join(tmpdir(), "prisma-policy-"));
  const probe = join(dir, "probe.mts");
  writeFileSync(probe, PROBE.replace("../prisma.config.ts", pathToConfig()));

  try {
    // A single command-line STRING, not an argv array, because `shell: true`
    // with a separate args array is deprecated as of Node 24 (DEP0190: the
    // array is concatenated unescaped anyway, so the array form buys nothing).
    //
    // `npx` and `tsx` are left UNQUOTED: `npx` is a `.cmd` shim on Windows, and
    // quoting the executable name itself confuses its internal npm-prefix
    // lookup (confirmed — quoting it breaks module resolution inside the shim
    // with MODULE_NOT_FOUND). Only the probe path is quoted, since a temp
    // directory can in principle contain spaces; every argv value after it is
    // our own literal (a bare subcommand word or flag, never untrusted input),
    // so plain concatenation matches how the command would actually be typed.
    const commandLine = `npx tsx "${probe}" ${args.join(" ")}`.trim();
    const result = spawnSync(commandLine, {
      encoding: "utf8",
      shell: true,
      env: {
        ...process.env,
        // Nonexistent, so dotenv contributes nothing and the cases below are
        // the entire environment. Never touches the real .env.
        DOTENV_CONFIG_PATH: join(dir, "no-such-.env"),
        DATABASE_URL: undefined,
        DIRECT_URL: undefined,
        ...env,
      } as NodeJS.ProcessEnv,
    });

    const stdout = result.stdout ?? "";
    const match = /RESOLVED:(pooled|direct)/.exec(stdout);
    return {
      status: result.status ?? 1,
      resolved: match ? (match[1] as "pooled" | "direct") : null,
      stderr: result.stderr ?? "",
      stdout,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A `file://` URL to the real config, valid as an ESM import specifier on every
 * platform.
 *
 * A bare filesystem path is NOT enough here, and this is a Windows-specific trap:
 * `C:/Users/.../prisma.config.ts` parses as a URL whose scheme is `C`, so Node's
 * ESM loader rejects it with ERR_UNSUPPORTED_ESM_URL_SCHEME the moment the probe
 * tries to import it — every case in this file failed with that one error before
 * this fix, all of them for the same reason. `pathToFileURL` is the platform-
 * correct escape hatch (`file:///C:/...` on Windows, `file:///Users/...` on
 * POSIX), and it is what makes this test file portable rather than merely
 * "written on Windows, tested on Windows."
 */
function pathToConfig(): string {
  return pathToFileURL(join(process.cwd(), "prisma.config.ts")).href;
}

const BOTH = { DATABASE_URL: POOLED, DIRECT_URL: DIRECT };
const POOLED_ONLY = { DATABASE_URL: POOLED };

// ─── Schema commands require DIRECT_URL ──────────────────────────────────────

describe("schema commands use DIRECT_URL", () => {
  const SCHEMA_INVOCATIONS = [
    ["migrate", "deploy"],
    ["migrate", "dev"],
    ["migrate", "status"],
    ["migrate", "reset"],
    ["migrate", "resolve", "--applied", "x"],
    ["migrate", "diff"],
    ["db", "push"],
    ["db", "pull"],
    ["db", "execute"],
  ];

  for (const argv of SCHEMA_INVOCATIONS) {
    it(`\`prisma ${argv.join(" ")}\` resolves to the direct host`, () => {
      const r = runConfig(argv, BOTH);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.resolved, "direct");
    });
  }

  // `migrate status` is read-only and would be safe on the pooler. It is held to
  // the same rule anyway so migration tooling has ONE connection policy — a
  // status that inspects a different connection from the deploy that follows it
  // is precisely the discrepancy nobody notices until it matters.
  it("holds `migrate status` to the same policy as `migrate deploy`", () => {
    assert.equal(runConfig(["migrate", "status"], BOTH).resolved, "direct");
  });
});

// ─── The hardening: no fallback, no connection ───────────────────────────────

describe("schema commands FAIL when DIRECT_URL is missing", () => {
  const CASES = [
    ["migrate", "deploy"],
    ["migrate", "dev"],
    ["migrate", "status"],
    ["db", "push"],
    ["db", "execute"],
  ];

  for (const argv of CASES) {
    it(`\`prisma ${argv.join(" ")}\` exits non-zero rather than using the pooled URL`, () => {
      const r = runConfig(argv, POOLED_ONLY);

      assert.equal(r.status, 1, "must fail, not proceed");
      // The whole point: it must NOT have silently fallen back.
      assert.equal(r.resolved, null, "no URL may be resolved at all");
      assert.ok(!r.stdout.includes("pooled"), "must not fall back to DATABASE_URL");
    });
  }

  it("says what is wrong and exactly how to fix it", () => {
    const r = runConfig(["migrate", "deploy"], POOLED_ONLY);
    assert.match(r.stderr, /DIRECT_URL is not set/);
    assert.match(r.stderr, /migrate deploy/, "names the refused command");
    assert.match(r.stderr, /-pooler/, "explains which host to use");
    assert.match(r.stderr, /No database connection was attempted/);
  });

  it("never prints a connection string from the environment", () => {
    const r = runConfig(["migrate", "deploy"], POOLED_ONLY);
    assert.ok(!r.stderr.includes(POOLED), "must not echo DATABASE_URL");
    assert.ok(!r.stderr.includes("u:p@"), "must not echo credentials");
  });
});

// ─── Non-schema commands are unaffected ──────────────────────────────────────

describe("non-schema commands keep DATABASE_URL", () => {
  const POOLED_INVOCATIONS = [["generate"], ["validate"], ["studio"], ["format"], []];

  for (const argv of POOLED_INVOCATIONS) {
    it(`\`prisma ${argv.join(" ") || "(no args)"}\` resolves to the pooled host`, () => {
      const r = runConfig(argv, BOTH);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.resolved, "pooled");
    });
  }

  it("works with no DIRECT_URL at all — it is not required here", () => {
    const r = runConfig(["generate"], POOLED_ONLY);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.resolved, "pooled");
  });

  it("treats `--help` as a non-schema invocation", () => {
    const r = runConfig(["--help"], POOLED_ONLY);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.resolved, "pooled");
  });

  // Seeding writes application DATA, not schema, so it is ordinary traffic and
  // must not be made to require DIRECT_URL.
  it("treats `db seed` as data traffic, not schema work", () => {
    const r = runConfig(["db", "seed"], POOLED_ONLY);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.resolved, "pooled");
  });
});

// ─── Misconfiguration warning ────────────────────────────────────────────────

describe("a DIRECT_URL that is actually pooled", () => {
  it("warns but still runs, since `-pooler` is a Neon-only convention", () => {
    const r = runConfig(["migrate", "deploy"], {
      DATABASE_URL: POOLED,
      DIRECT_URL: POOLED,
    });
    assert.equal(r.status, 0, "a non-Neon setup must not be blocked by a substring");
    assert.match(r.stderr, /DIRECT_URL points at a POOLED host/);
  });
});
