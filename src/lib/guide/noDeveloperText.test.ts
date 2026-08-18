import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the interface talks to the developer.
 *
 * Three pages ended a user-facing paragraph by pointing at a file in the
 * repository - "See docs/SYSTEMS.md for the exact model" on Standings, and the
 * same on Offseason and Playoffs. A player has no repository. The line read as
 * an internal note left in by accident, which is what it was.
 *
 * The rule is about *rendered* text, so this scans only what ends up on screen:
 * comment bodies are stripped first, because a comment citing an audit document
 * is exactly where that reference belongs. What is left is JSX and string
 * literals, which is what the reader sees.
 *
 * Two escape hatches are deliberate. `import` lines mention paths under
 * `src/lib`, and the guide registry stores `/guide/...` hrefs - neither is
 * prose. Everything else is a real finding.
 */

const ROOTS = ["src/app", "src/components"];

/** A repository path or documentation filename in prose the user will read. */
const BANNED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\b[A-Za-z0-9_/-]+\.mdx?\b/,
    why: "names a documentation file; the player has no repository. Link a /guide topic through HowDoesThisWork instead.",
  },
  {
    pattern: /\bdocs\//,
    why: "points into the docs directory.",
  },
  {
    pattern: /\bsrc\/(lib|app|components)\b/,
    why: "names a source path.",
  },
  {
    pattern: /\b[a-zA-Z0-9_-]+\.tsx?\b/,
    why: "names a source file.",
  },
];

function sourceFilesUnder(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

/**
 * The file with every comment removed, so a documented decision cannot be
 * mistaken for something rendered. Import lines go too - they carry module
 * paths that are not prose.
 */
function renderedTextOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?$/gm, "");
}

const FILES = ROOTS.flatMap(sourceFilesUnder);

describe("the interface never addresses the developer", () => {
  it("finds files to scan, so a broken walk cannot pass vacuously", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it.each(BANNED)("never renders text that $why", ({ pattern, why }) => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const rendered = renderedTextOf(readFileSync(file, "utf8"));
      for (const [index, line] of rendered.split("\n").entries()) {
        if (pattern.test(line)) {
          offenders.push(
            `${path.relative(process.cwd(), file).replace(/\\/g, "/")}:${index + 1}  ${line.trim()}`,
          );
        }
      }
    }
    expect(offenders, `Rendered text ${why}\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
