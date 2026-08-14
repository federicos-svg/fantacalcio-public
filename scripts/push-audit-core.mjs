// Push-audit core — PURE logic, NO Node imports (string-only, I/O injected).
// Single source of truth shared by:
//   - .github/workflows/push-audit.yml            (adapter minimo: fa solo I/O)
//   - packages/engine/tests/push_audit.test.ts    (unit test della decisione)
// Stessa forma di guardrails-core.mjs / secret-scan-core.mjs / git-hooks-core.mjs.
//
// Cosa decide (e cosa no): questo modulo stabilisce SE un push su main/production
// vada segnalato e PERCHE'. Non parla con GitHub: le due sole operazioni di rete
// — chiedere le PR associate a un commit e dormire fra un tentativo e l'altro —
// sono iniettate da chi lo chiama. E' quello che rende testabili al 100% i casi
// che contano, retry ed eccezioni comprese.
//
// Regola non negoziabile: MAI silenzio. Un errore dell'API non deve mai
// trasformarsi in "nessun allarme". Se la verifica non riesce, si segnala che
// non e' riuscita — l'unica cosa che non si puo' fare e' tacere, perche' una
// run rossa nella tab Actions non la guarda nessuno (lezione della #253).

export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 15000;

// Esito di un singolo tentativo.
export const ATTEMPT_MERGED = "merged";
export const ATTEMPT_NO_MERGE = "no-merge";
export const ATTEMPT_ERROR = "error";

// Perche' si e' aperto un allarme.
export const CAUSE_NO_PR = "no-pr";
export const CAUSE_API_ERROR = "api-error";

/** SHA corto usato nel titolo dell'issue: e' anche la chiave di dedupe. */
export function shortSha(sha) {
  return String(sha ?? "").slice(0, 12);
}

function errorMessage(error) {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  const status = error && typeof error === "object" && error.status ? `HTTP ${error.status}: ` : "";
  const text = (status + raw).replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/**
 * Normalizza l'esito di UN tentativo.
 *
 * Si richiede che la PR sia MERGED e che la sua base sia proprio il branch
 * pushato: merge commit, squash e rebase merge risultano tutti associati alla
 * PR che li ha prodotti, mentre una PR aperta verso un altro branch — associata
 * al commit solo perche' lo contiene — non e' un merge su QUESTO branch.
 *
 * @param {{branch: string, prs?: Array|null, error?: unknown}} input
 */
export function evaluateAttempt({ branch, prs = null, error = null }) {
  if (error !== null && error !== undefined) {
    return { kind: ATTEMPT_ERROR, message: errorMessage(error) };
  }
  const merged = (prs ?? []).filter(
    (pr) => pr && pr.merged_at && pr.base && pr.base.ref === branch,
  );
  if (merged.length > 0) return { kind: ATTEMPT_MERGED, pr: merged[0] };
  return { kind: ATTEMPT_NO_MERGE };
}

/**
 * Si riprova? Solo se non abbiamo gia' la risposta buona e restano tentativi.
 * Un tentativo fallito per ECCEZIONE conta come tentativo consumato esattamente
 * come uno che ha risposto "nessuna PR": altrimenti un 5xx isolato azzererebbe
 * il retry proprio quando serve di piu'.
 */
export function shouldRetry(attemptNumber, outcome) {
  if (outcome.kind === ATTEMPT_MERGED) return false;
  return attemptNumber < MAX_ATTEMPTS;
}

/**
 * Decisione finale sulla sequenza di tentativi.
 *
 * - un solo tentativo "merged" basta a chiudere in silenzio;
 * - se NESSUN tentativo e' andato a buon fine (tutte eccezioni) la verifica non
 *   e' stata completata: non possiamo affermare che sia un push diretto, ma
 *   nemmeno tacere -> allarme con causa `api-error`;
 * - altrimenti almeno uno sguardo pulito ha detto "nessuna PR mergiata" ->
 *   allarme con causa `no-pr`. Gli eventuali errori restano nel corpo, cosi'
 *   chi legge vede il quadro misto invece di una certezza che non c'e'.
 */
export function decideFromAttempts(attempts) {
  const list = attempts ?? [];
  const merged = list.find((a) => a.kind === ATTEMPT_MERGED);
  if (merged) return { action: "ok", pr: merged.pr, attempts: list.length };

  const errors = list.filter((a) => a.kind === ATTEMPT_ERROR);
  const noneSucceeded = list.length > 0 && errors.length === list.length;
  return {
    action: "alarm",
    cause: noneSucceeded ? CAUSE_API_ERROR : CAUSE_NO_PR,
    attempts: list.length,
    errors: errors.map((e) => e.message),
  };
}

/**
 * Il ciclo di verifica completo, con l'I/O iniettato.
 *
 * Il try/catch sta DENTRO il ciclo: un rate-limit o un 5xx non abortisce lo
 * script a zero retry (era il difetto chiuso qui) — vale come tentativo fallito
 * e si riprova, e se falliscono tutti si esce comunque con un allarme.
 *
 * @param {object} io
 * @param {string} io.branch
 * @param {() => Promise<Array>} io.listAssociatedPullRequests
 * @param {(ms: number) => Promise<void>} io.sleep
 * @param {(n: number, outcome: object) => void} [io.onAttempt]
 */
export async function resolvePushOrigin({
  branch,
  listAssociatedPullRequests,
  sleep,
  onAttempt = null,
}) {
  const attempts = [];
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    let outcome;
    try {
      outcome = evaluateAttempt({ branch, prs: await listAssociatedPullRequests() });
    } catch (error) {
      outcome = evaluateAttempt({ branch, error });
    }
    attempts.push(outcome);
    if (onAttempt) onAttempt(n, outcome);
    if (!shouldRetry(n, outcome)) break;
    await sleep(RETRY_DELAY_MS);
  }
  return decideFromAttempts(attempts);
}

/**
 * Titolo dell'issue. Contiene SEMPRE lo SHA corto, qualunque sia la causa:
 * e' l'invariante su cui si regge il dedupe.
 */
export function alarmTitle({ branch, short, cause }) {
  return cause === CAUSE_API_ERROR
    ? `[push-audit] Verifica non completata su ${branch} — ${short}`
    : `[push-audit] Push diretto senza PR su ${branch} — ${short}`;
}

/** Una sola issue aperta per SHA: ri-run e secondi eventi non moltiplicano gli allarmi. */
export function findDuplicate(openIssues, short) {
  return (
    (openIssues ?? []).find((i) => i && typeof i.title === "string" && i.title.includes(short)) ??
    null
  );
}

/** Corpo dell'issue di allarme. */
export function alarmBody({ owner, repo, branch, ref, sha, short, actor, runId, decision }) {
  const apiError = decision.cause === CAUSE_API_ERROR;
  const head = apiError
    ? `**Verifica non completata** sul push a \`${branch}\`: dopo ${decision.attempts} tentativi l'API GitHub non ha risposto, quindi non e' stato possibile stabilire se il commit venga dal merge di una PR.`
    : `Rilevato un push su \`${branch}\` il cui commit in testa **non risulta il merge di alcuna PR**.`;

  const lines = [
    head,
    "",
    "| | |",
    "|---|---|",
    `| branch | \`${branch}\` |`,
    `| ref | \`${ref}\` |`,
    `| commit | ${sha} |`,
    `| actor | @${actor} |`,
    `| tentativi | ${decision.attempts}/${MAX_ATTEMPTS} |`,
    `| link | https://github.com/${owner}/${repo}/commit/${sha} |`,
    `| run | https://github.com/${owner}/${repo}/actions/runs/${runId} |`,
  ];

  if (decision.errors && decision.errors.length > 0) {
    lines.push("", "Errori API incontrati:", "");
    for (const e of decision.errors) lines.push(`- \`${e}\``);
  }

  lines.push(
    "",
    "Regola: `docs/NO_GO.md` §merge — si passa sempre da una PR",
    "(branch → Draft PR → CI → review → merge). Un push su `production`",
    "è inoltre un deploy Production, sempre fascia C.",
    "",
    "Questo controllo è **post-hoc**: non ha bloccato nulla e non blocca",
    "nulla. La guardia locale è l'hook `pre-push` installato da",
    "`npm run graphify:bootstrap`; se il push è passato, quell'hook non",
    "era installato (clone nuovo, `--no-verify`, o push non da CLI).",
    "",
    apiError
      ? "Da fare: riaprire a mano la verifica sul commit qui sopra. Questa issue segnala che il controllo **non ha potuto** pronunciarsi, non che ci sia stata una violazione."
      : "Da fare: verificare se il contenuto era autorizzato, e se serve un revert. Chiudere questa issue solo dopo la verifica.",
  );

  return lines.join("\n");
}
