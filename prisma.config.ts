import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * ── The two database URLs, and why there are two ─────────────────────────────
 *
 *   DATABASE_URL — the POOLED Neon endpoint (`...-pooler.<region>.aws.neon.tech`).
 *                  Used by the running application (lib/db/client.ts) for every
 *                  request. Serverless functions open many short-lived
 *                  connections, which is exactly what pgbouncer is for.
 *
 *   DIRECT_URL   — the DIRECT Neon endpoint (the same host without `-pooler`).
 *                  Used for schema work: migrations, introspection, db execute.
 *                  REQUIRED for those commands — see the fail-fast check below.
 *                  There is no fallback to DATABASE_URL, deliberately.
 *
 * ── Why migrations must NOT go through the pooler ────────────────────────────
 *
 * `prisma migrate` takes a SESSION-level advisory lock (pg_advisory_lock) for the
 * duration of the command. Through pgbouncer that lock is held on a SHARED
 * backend, so if the client connection is severed mid-migration the lock is
 * orphaned onto an unrelated idle session and is not released. Every subsequent
 * migration then fails with P1002 (lock timeout), on top of the P1017 that
 * severed the original connection, and it clears only when that backend happens
 * to be recycled. This repo has hit exactly that (see .wolf/buglog.json, bug-183).
 *
 * ── Why this is computed here rather than declared ───────────────────────────
 *
 * This file previously passed a `directUrl` key, which looked correct and did
 * nothing: `@prisma/config`'s `Datasource` type is `{ url?, shadowDatabaseUrl? }`
 * (see node_modules/@prisma/config/dist/index.d.ts) and unknown keys are dropped
 * with no warning. `MigrationsConfigShape` is `{ path?, initShadowDb?, seed? }` —
 * also no connection option — and the CLI reads no `PRISMA_MIGRATE_*_URL` env
 * var. So in Prisma 7.8 there is NO declarative way to give migrations their own
 * URL, and every migration silently ran through the pooler.
 *
 * Selecting the URL from the invoked command is therefore the only way to make
 * the safe path the DEFAULT one. It means a hand-typed `npx prisma migrate
 * deploy` is correct too — not just the npm scripts — so there is no manual
 * override for anyone to forget, and no shell-specific env syntax anywhere.
 *
 * This file is loaded ONLY by the Prisma CLI. The application never imports it
 * (lib/db/client.ts reads `process.env.DATABASE_URL` directly), so nothing here
 * can change runtime connection behaviour.
 */

/**
 * `prisma db <sub>` subcommands that read or write SCHEMA, and so must use the
 * direct connection.
 *
 * `seed` is deliberately absent: it runs a seed script against application DATA,
 * which is ordinary traffic and belongs on the pooled URL like every other
 * request. `pull` is present because introspection is schema tooling — keeping it
 * on the same connection as `push` is what makes the policy one rule rather than
 * a list of exceptions.
 */
const SCHEMA_DB_SUBCOMMANDS = new Set(["push", "pull", "execute"]);

/** The non-flag CLI arguments, i.e. the subcommand path actually invoked. */
function invokedCommand(): { command: string; sub: string } {
  const words = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  return { command: words[0] ?? "", sub: words[1] ?? "" };
}

const { command, sub } = invokedCommand();

/**
 * Whether this invocation needs the direct connection.
 *
 * EVERY `migrate` subcommand qualifies, `status` included. It is read-only, so it
 * would be safe on the pooler — but migration tooling having ONE connection
 * policy is worth more than the exception: a `status` that inspects a different
 * connection from the `deploy` that follows it is exactly the kind of difference
 * nobody notices until it matters.
 */
const requiresDirect =
  command === "migrate" || (command === "db" && SCHEMA_DB_SUBCOMMANDS.has(sub));

/**
 * Schema work REQUIRES DIRECT_URL. There is deliberately no fallback to
 * DATABASE_URL.
 *
 * Falling back looks helpful and is the more dangerous behaviour: it silently
 * restores the exact bug this file exists to prevent, on the one kind of command
 * where the damage outlives the command. A missing DIRECT_URL is a configuration
 * mistake, and the useful response is to say so before touching the database —
 * not to proceed against the pooler and leave an orphaned advisory lock that
 * fails every future migration with P1002.
 *
 * Exits before `defineConfig` is reached, so no connection is attempted at all.
 */
if (requiresDirect && !process.env.DIRECT_URL) {
  const invocation = `prisma ${command}${sub ? ` ${sub}` : ""}`;
  console.error(
    `\n✖ DIRECT_URL is not set — refusing to run \`${invocation}\`.\n\n` +
      `  Schema commands must use the DIRECT database connection, never the pooled one.\n` +
      `  \`prisma migrate\` holds a session-level advisory lock; through pgbouncer that\n` +
      `  lock can be orphaned onto a shared backend, and every later migration then\n` +
      `  fails with P1002 until that backend is recycled.\n\n` +
      `  Fix: set DIRECT_URL in your environment to the same database as DATABASE_URL,\n` +
      `  using the host WITHOUT \`-pooler\`:\n\n` +
      `    DATABASE_URL="postgresql://…@ep-xxx-pooler.<region>.aws.neon.tech/<db>"\n` +
      `    DIRECT_URL="postgresql://…@ep-xxx.<region>.aws.neon.tech/<db>"\n\n` +
      `  See .env.example. No database connection was attempted.\n`
  );
  process.exit(1);
}

const url = requiresDirect ? process.env.DIRECT_URL : process.env.DATABASE_URL;

// DIRECT_URL is set but points at a pooled host — the same trap wearing the right
// name. A warning rather than a hard failure: `-pooler` is a Neon-specific
// convention, and a self-hosted or non-Neon setup must not be blocked by a
// substring match on its hostname.
if (requiresDirect && url?.includes("-pooler")) {
  console.warn(
    "\n⚠  DIRECT_URL points at a POOLED host (it contains `-pooler`).\n" +
      "   Use the same host without `-pooler`, or migrations risk orphaned\n" +
      "   advisory locks and P1002 failures on every later migration.\n"
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: url!,
  },
});
