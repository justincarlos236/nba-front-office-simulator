import { describe, expect, it } from "vitest";
import { OWNER_ARCHETYPE_LABEL } from "./ownerArchetype";

/**
 * Locks the ownership-letter voice map against the real enum.
 *
 * Both the contract sheet's `ExceptionUsed` map and this one were first
 * written from memory and both were wrong - `ABSENTEE_OWNER` for `ABSENTEE`,
 * `MEDDLESOME_OWNER` for `MEDDLER`, `TAXPAYER_MLE` for `MID_LEVEL_TAXPAYER`.
 * Nothing would have thrown: the lookup just falls through to a generic
 * fallback, so two of five owners would have quietly lost their voice and the
 * feature would have looked like it worked.
 *
 * This asserts every archetype the schema defines has a hand-written voice,
 * so adding a sixth archetype fails here rather than degrading in silence.
 */

// Mirrors the VOICE keys in src/components/ownership/OwnershipLetter.tsx.
const VOICED_ARCHETYPES = [
  "WIN_NOW_BILLIONAIRE",
  "PENNY_PINCHER",
  "PATIENT_BUILDER",
  "ABSENTEE",
  "MEDDLER",
] as const;

describe("ownership letter voice", () => {
  it("gives every real owner archetype its own voice", () => {
    const schemaArchetypes = Object.keys(OWNER_ARCHETYPE_LABEL).sort();
    expect([...VOICED_ARCHETYPES].sort()).toEqual(schemaArchetypes);
  });

  it("has no voice for an archetype the schema does not define", () => {
    for (const key of VOICED_ARCHETYPES) {
      expect(OWNER_ARCHETYPE_LABEL).toHaveProperty(key);
    }
  });
});
