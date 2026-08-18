import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isActionFailure, reportFailures } from "./actionResult";

/**
 * Every refusal a user can trigger has to survive the trip to his screen.
 *
 * Next.js redacts the message of an error thrown out of a server action in a
 * production build. Reported as "I'm unable to sign any free agents": the
 * player had simply held out for more money, and the deployed site said
 * "That didn't go through. Nothing was changed." Every other action reported
 * the same way, so the same silence sat behind trades, the draft, the
 * playoffs, staff hires and the offseason roll.
 */

describe("reportFailures", () => {
  it("returns a value untouched when nothing goes wrong", async () => {
    await expect(reportFailures(async () => ({ done: true }))).resolves.toEqual({ done: true });
  });

  it("returns a thrown refusal instead of letting it escape", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await reportFailures(async () => {
      throw new Error("This trade violates the second apron rule.");
    });
    spy.mockRestore();

    expect(isActionFailure(result)).toBe(true);
    if (!isActionFailure(result)) throw new Error("unreachable");
    // Translated on the server, where the message is still real.
    expect(result.error.summary).toBe("The second apron blocks this deal.");
    expect(result.error.ruling).toBe(true);
  });

  it("still logs an unexpected fault rather than swallowing it", async () => {
    // Next used to log the throw itself. Catching it here would otherwise
    // trade a visible crash for a quiet notice with nothing to diagnose from.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportFailures(async () => {
      throw new TypeError("cannot read properties of undefined");
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("lets a redirect keep travelling", async () => {
    // `redirect()` and `notFound()` signal by throwing. Swallowing one turns a
    // successful action into a silent no-op: the user confirms, nothing
    // happens, and no error appears either. This is the check that makes the
    // wrapper safe to apply to an action whose success path is a redirect.
    const signal = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/leagues/1;307;",
    });
    await expect(
      reportFailures(async () => {
        throw signal;
      }),
    ).rejects.toBe(signal);
  });

  it("lets notFound keep travelling too", async () => {
    const signal = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    await expect(
      reportFailures(async () => {
        throw signal;
      }),
    ).rejects.toBe(signal);
  });

  it("does not mistake an ordinary object for a failure", () => {
    expect(isActionFailure({ done: true })).toBe(false);
    expect(isActionFailure(null)).toBe(false);
    expect(isActionFailure({ ok: true })).toBe(false);
  });
});

/**
 * The wrapper only helps where it is applied, so this holds the wiring: every
 * action reachable from a screen that renders `ErrorNotice` must be wrapped,
 * and every one of those screens must actually check what came back. A wrapped
 * action whose caller ignores the return value is worse than before - the
 * refusal becomes silent rather than merely vague.
 */
const COMPONENT_ROOTS = ["src/components", "src/app"];

function filesUnder(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

/** Screens that show a failure, and the actions they call. */
const SURFACES = COMPONENT_ROOTS.flatMap(filesUnder)
  .map((file) => ({ file, source: readFileSync(file, "utf8") }))
  .filter(({ source }) => source.includes("<ErrorNotice"))
  .map(({ file, source }) => ({
    file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
    source,
    actions: [...new Set(source.match(/\b[a-z][a-zA-Z]*Action\b/g) ?? [])].filter(
      // A shared confirmation primitive, not a server action.
      (name) => name !== "ConfirmAction",
    ),
  }))
  .filter(({ actions }) => actions.length > 0);

const ACTION_SOURCE = readdirSync(path.join(process.cwd(), "src/lib/actions"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => readFileSync(path.join(process.cwd(), "src/lib/actions", f), "utf8"))
  .join("\n");

describe("every failure a user can see is returned, not thrown", () => {
  it("found the screens that display failures", () => {
    expect(SURFACES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(SURFACES.map((s) => [s.file, s] as const))("has %s check what came back", (_f, s) => {
    expect(
      s.source.includes("isActionFailure"),
      `${s.file} renders ErrorNotice and calls ${s.actions.join(", ")}, so it must check ` +
        `isActionFailure(result) - otherwise a returned refusal is silently dropped.`,
    ).toBe(true);
  });

  it("has none of those actions report by throwing", () => {
    // The contract, not one implementation of it. Two forms satisfy it: wrap
    // the body in `reportFailures`, which catches the existing throws on the
    // server and translates them; or write the returns by hand, which
    // `signFreeAgentAction` does because each of its refusals earned a
    // specific sentence. What is banned is a `throw` reaching the boundary.
    const offenders = [...new Set(SURFACES.flatMap((s) => s.actions))]
      .map((name) => {
        const start = ACTION_SOURCE.indexOf(`export async function ${name}(`);
        if (start < 0) return null;
        const rest = ACTION_SOURCE.slice(start);
        const next = rest.indexOf("\nexport ", 1);
        const body = next < 0 ? rest : rest.slice(0, next);
        const wrapped = /\{\s*return reportFailures\(/.test(body);
        const throws = body.match(/throw new Error\(/g) ?? [];
        return wrapped || throws.length === 0 ? null : `${name} (${throws.length} throws)`;
      })
      .filter((v): v is string => v !== null);

    expect(
      offenders,
      "These actions reach a screen that shows failures, but throw instead of returning them - " +
        "Next redacts a thrown message in production. Wrap the body: " +
        "`return reportFailures(() => runX(...))`.",
    ).toEqual([]);
  });
});
