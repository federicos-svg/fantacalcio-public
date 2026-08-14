/**
 * The on-disk form of the anagrafica age index, and its fail-closed parser —
 * PURE, no I/O.
 *
 * The governed Wikidata pilot writes this block; the Phase 4 backtest, the
 * fitted-model path and the point-in-time serving snapshot all read it. It
 * travels INSIDE the private dataset artifact rather than beside it, which is
 * the property that makes the whole T3 package-identity machinery keep
 * working: the dataset fingerprint already covers every byte of that artifact,
 * so a different anagrafica is a different dataset, and
 * `decidePhase4Publication`/`selectPhase4Package` resolve packages by
 * (dataset, configHash) without needing to learn about a third dimension.
 *
 * What it deliberately does NOT carry: QIDs, birth dates, names, statements,
 * provenance or anything else from the source. Only `playerKey -> age at that
 * season's start`, an integer this repository can hold without holding any
 * Wikidata payload at all. The identity join, the precision gate and the
 * historical age arithmetic all happened upstream in
 * `packages/wikidata-identity-contract`, and their audit trail stays in the
 * pilot's own report — outside the repository.
 */

export const ANAGRAFICA_INDEX_VERSION = "wikidata-anagrafica-index-v1" as const;

export interface SerializedAnagraficaIndex {
  readonly anagraficaVersion: typeof ANAGRAFICA_INDEX_VERSION;
  /** Which `resolveAnagraficaBatch` produced it — the upstream policy version. */
  readonly resolutionVersion: string;
  /** Always SEASON_START_DATE for this feature; recorded so a reader never has to assume it. */
  readonly referenceDateType: "SEASON_START_DATE";
  /** season -> playerKey -> age at that season's start. */
  readonly ageBySeason: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** A plausible human age range for a professional footballer, used only to reject nonsense. */
const MIN_AGE = 14;
const MAX_AGE = 60;

function fail(detail: string): never {
  throw new Error(`ANAGRAFICA_INDEX_SCHEMA: ${detail}`);
}

/**
 * Validates and converts the serialized block into the in-memory index.
 *
 * Every rejection is explicit. An age that is not a finite integer inside a
 * plausible range is refused rather than clamped or coerced: the alternative
 * is a model silently trained on a `-1` or a `0` that a broken upstream join
 * produced, which is exactly the class of failure the whole pipeline is built
 * to make impossible.
 */
export function parseAnagraficaIndex(value: unknown): ReadonlyMap<string, ReadonlyMap<string, number>> {
  if (typeof value !== "object" || value === null) fail("not an object");
  const record = value as Record<string, unknown>;
  if (record.anagraficaVersion !== ANAGRAFICA_INDEX_VERSION) {
    fail(`unsupported anagraficaVersion (expected ${ANAGRAFICA_INDEX_VERSION})`);
  }
  if (typeof record.resolutionVersion !== "string" || record.resolutionVersion === "") {
    fail("resolutionVersion missing");
  }
  if (record.referenceDateType !== "SEASON_START_DATE") {
    fail("referenceDateType must be SEASON_START_DATE for age_at_season_start");
  }
  const ageBySeason = record.ageBySeason;
  if (typeof ageBySeason !== "object" || ageBySeason === null || Array.isArray(ageBySeason)) {
    fail("ageBySeason must be an object");
  }

  const index = new Map<string, ReadonlyMap<string, number>>();
  for (const [season, byPlayer] of Object.entries(ageBySeason as Record<string, unknown>)) {
    if (season === "") fail("empty season key");
    if (typeof byPlayer !== "object" || byPlayer === null || Array.isArray(byPlayer)) {
      fail(`ageBySeason['${season}'] must be an object`);
    }
    const entries = new Map<string, number>();
    for (const [playerKey, age] of Object.entries(byPlayer as Record<string, unknown>)) {
      if (playerKey === "") fail(`empty playerKey in season '${season}'`);
      if (typeof age !== "number" || !Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
        fail(`age for a player in season '${season}' is not an integer in [${MIN_AGE}, ${MAX_AGE}]`);
      }
      entries.set(playerKey, age);
    }
    index.set(season, entries);
  }
  return index;
}

/**
 * Reads the optional `anagrafica` block off a private dataset artifact.
 * Absent is a legitimate state (a dataset built before the pilot ran), and
 * produces `undefined` — the feature is then `NaN` everywhere and the Phase 4
 * coverage floor refuses the run with its own explicit reason code, which is a
 * far more useful failure than a schema error here would be. Present but
 * malformed is never tolerated.
 */
export function readAnagraficaFromDataset(
  dataset: unknown,
): ReadonlyMap<string, ReadonlyMap<string, number>> | undefined {
  if (typeof dataset !== "object" || dataset === null) return undefined;
  const block = (dataset as Record<string, unknown>).anagrafica;
  if (block === undefined || block === null) return undefined;
  return parseAnagraficaIndex(block);
}

/** Total `(season, playerKey)` pairs held by an index — the only size that matters for a read-back check. */
export function countAnagraficaEntries(index: ReadonlyMap<string, ReadonlyMap<string, number>>): number {
  let total = 0;
  for (const byPlayer of index.values()) total += byPlayer.size;
  return total;
}

/**
 * Fails closed unless `candidate` contains every `(season, playerKey) -> age`
 * of `base`, with the identical age.
 *
 * The governed pilot's deposit GROWS across authorized slices: one artifact per
 * dataset fingerprint, extended with the subjects a later run resolves. Growth
 * is only safe if it can never subtract, so the write path asserts this before
 * it persists anything and again on the bytes it reads back. A changed age for
 * a subject that was already resolved is not "an update" — the birth date it
 * derives from is static, so a disagreement means one of the two resolutions is
 * wrong, and silently keeping either would put an unexplained value into the
 * model.
 */
export function assertAnagraficaSuperset(
  base: ReadonlyMap<string, ReadonlyMap<string, number>>,
  candidate: ReadonlyMap<string, ReadonlyMap<string, number>>,
  label: string,
): void {
  for (const [season, byPlayer] of base) {
    const candidateSeason = candidate.get(season);
    if (candidateSeason === undefined) {
      throw new Error(`ANAGRAFICA_INDEX_NOT_A_SUPERSET: ${label} lost season '${season}'`);
    }
    for (const [playerKey, age] of byPlayer) {
      const found = candidateSeason.get(playerKey);
      if (found === undefined) {
        throw new Error(`ANAGRAFICA_INDEX_NOT_A_SUPERSET: ${label} lost a player of season '${season}'`);
      }
      if (found !== age) {
        throw new Error(`ANAGRAFICA_INDEX_AGE_CONFLICT: ${label} changed an age in season '${season}'`);
      }
    }
  }
}

/**
 * Union of two indexes, asserted to be a genuine superset of both.
 *
 * Deterministic by construction: the result is a plain union, and
 * `serializeAnagraficaIndex` imposes the stable ordering, so the bytes do not
 * depend on which entries were resolved first or in which run.
 */
export function mergeAnagraficaIndexes(
  base: ReadonlyMap<string, ReadonlyMap<string, number>>,
  addition: ReadonlyMap<string, ReadonlyMap<string, number>>,
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const merged = new Map<string, Map<string, number>>();
  for (const source of [base, addition]) {
    for (const [season, byPlayer] of source) {
      const target = merged.get(season) ?? new Map<string, number>();
      for (const [playerKey, age] of byPlayer) {
        const existing = target.get(playerKey);
        if (existing !== undefined && existing !== age) {
          throw new Error(`ANAGRAFICA_INDEX_AGE_CONFLICT: two ages for a player in season '${season}'`);
        }
        target.set(playerKey, age);
      }
      merged.set(season, target);
    }
  }
  assertAnagraficaSuperset(base, merged, "merge");
  assertAnagraficaSuperset(addition, merged, "merge");
  return merged;
}

/** Every subject key already carrying an age in at least one season — i.e. already resolved. */
export function resolvedSubjectKeys(index: ReadonlyMap<string, ReadonlyMap<string, number>>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const byPlayer of index.values()) for (const playerKey of byPlayer.keys()) keys.add(playerKey);
  return keys;
}

/** The inverse, for the pilot that writes the block. Seasons and players are sorted so the bytes are stable. */
export function serializeAnagraficaIndex(
  index: ReadonlyMap<string, ReadonlyMap<string, number>>,
  resolutionVersion: string,
): SerializedAnagraficaIndex {
  const ageBySeason: Record<string, Record<string, number>> = {};
  for (const season of [...index.keys()].sort()) {
    const byPlayer = index.get(season)!;
    ageBySeason[season] = Object.fromEntries([...byPlayer.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
  return {
    anagraficaVersion: ANAGRAFICA_INDEX_VERSION,
    resolutionVersion,
    referenceDateType: "SEASON_START_DATE",
    ageBySeason,
  };
}
