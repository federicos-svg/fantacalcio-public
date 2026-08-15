// BENCHMARK — `opportunityRadar()` a dimensioni operative reali.
//
// Perché esiste: il radar è oggi inerte (nessuna superficie lo chiama a ogni
// frame), ma la domanda di T008 è se sia COLLEGABILE a una superficie con
// rendering frequente. «Oggi non lo chiama nessuno» non è una risposta: la
// risposta è un numero, misurato su un listone della sagoma giusta.
//
// Non è un test: si lancia a mano.
//   npx tsx packages/engine/bench/opportunityRadar.bench.ts
//   npx tsx --expose-gc ...   (facoltativo) abilita la colonna heap
//
// Determinismo: lo scenario viene da `perfScenario()`, PRNG seminato, zero
// dati reali. Stessa griglia, stessi numeri, ovunque.

import { opportunityRadar } from "../src/index.js";
import {
  PERF_GRID_ASSETS,
  PERF_GRID_DECLARED,
  perfScenario,
  type PerfPhase,
} from "../tests/perfScenario.js";

const FRAME_BUDGET_MS = 16; // un frame a 60fps
const PERCEPTION_MS = 100; // soglia di latenza percepita in interazione

interface Row {
  label: string;
  assets: number;
  declared: number;
  phase: PerfPhase;
  candidates: number;
  purchased: number;
  reps: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  heapPerCallKb: number | null;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

/** Heap trattenuto da UNA chiamata, con gc esplicito. `null` senza --expose-gc. */
function measureHeap(run: () => unknown): number | null {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc === undefined) return null;
  gc();
  gc();
  const before = process.memoryUsage().heapUsed;
  const kept = run();
  const after = process.memoryUsage().heapUsed;
  // `kept` deve restare vivo fino alla seconda misura, altrimenti si misura zero.
  if ((kept as unknown[]).length < 0) throw new Error("unreachable");
  return (after - before) / 1024;
}

function bench(assets: number, declared: number, phase: PerfPhase, label = ""): Row {
  const scenario = perfScenario(assets, declared, phase);
  const run = (): unknown => opportunityRadar(scenario.input);

  const candidates = (run() as unknown[]).length;
  for (let i = 0; i < 8; i++) run(); // warmup: JIT + shape stabilization

  const samples: number[] = [];
  const deadline = Date.now() + 1500;
  while (samples.length < 200 && (samples.length < 25 || Date.now() < deadline)) {
    const t0 = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);

  return {
    label,
    assets,
    declared,
    phase,
    candidates,
    purchased: scenario.purchased,
    reps: samples.length,
    medianMs: quantile(samples, 0.5),
    p95Ms: quantile(samples, 0.95),
    minMs: samples[0]!,
    heapPerCallKb: measureHeap(run),
  };
}

const f = (n: number, d = 3): string => n.toFixed(d);
const pad = (s: string, w: number): string => s.padStart(w);

function header(): void {
  console.log(
    [
      pad("A", 6),
      pad("D", 6),
      pad("phase", 6),
      pad("cand", 6),
      pad("sold", 5),
      pad("reps", 5),
      pad("median ms", 10),
      pad("p95 ms", 10),
      pad("min ms", 9),
      pad("heap KB", 9),
      "  flag",
    ].join(" "),
  );
}

function print(r: Row): void {
  const flag =
    r.p95Ms > PERCEPTION_MS ? "  >100ms" : r.p95Ms > FRAME_BUDGET_MS ? "  >16ms" : "  ok";
  console.log(
    [
      pad(String(r.assets), 6),
      pad(String(r.declared), 6),
      pad(r.phase, 6),
      pad(String(r.candidates), 6),
      pad(String(r.purchased), 5),
      pad(String(r.reps), 5),
      pad(f(r.medianMs), 10),
      pad(f(r.p95Ms), 10),
      pad(f(r.minMs), 9),
      pad(r.heapPerCallKb === null ? "n/d" : f(r.heapPerCallKb, 1), 9),
      flag + (r.label === "" ? "" : `  ${r.label}`),
    ].join(" "),
  );
}

const rows: Row[] = [];
console.log(`node ${process.version}\n`);

// --- 1. la griglia richiesta: A x D, asta a metà strada --------------------
console.log("## griglia A x D (asta a metà strada)");
header();
for (const assets of PERF_GRID_ASSETS) {
  for (const declared of PERF_GRID_DECLARED) {
    const r = bench(assets, declared, "mid");
    rows.push(r);
    print(r);
  }
}

// --- 2. il caso realistico PIÙ PESANTE ------------------------------------
// Asta appena scaldata + listone intero valutato: mercato intatto, budget
// pieno, quindi l'unico filtro è `surplus > 0` e il loop interno gira sul
// massimo numero di candidati che una lega reale possa produrre.
console.log("\n## caso realistico più pesante (asta appena scaldata, listone intero valutato)");
header();
for (const assets of [500, 600, 1000]) {
  const r = bench(assets, assets, "early", "worst-realistic");
  rows.push(r);
  print(r);
}

// --- 3. sonda di scala: dove si superano 16 ms e 100 ms? -------------------
// Oltre le dimensioni operative, di proposito: serve a LOCALIZZARE le due
// soglie, non a descrivere un caso reale.
console.log("\n## sonda di scala (oltre le dimensioni operative: localizza le soglie)");
header();
for (const assets of [1500, 2000, 3000, 4000, 6000, 8000]) {
  const r = bench(assets, assets, "early", "scale-probe");
  rows.push(r);
  print(r);
}

console.log("\nJSON:");
console.log(JSON.stringify(rows, null, 0));
