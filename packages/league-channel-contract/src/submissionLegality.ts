// LEGALITÀ DI UN INVIO — la formazione che si vuole mandare contro le
// impostazioni che la lega ha davvero dichiarato.
//
// IL BUCO CHE CHIUDE. Il pacchetto sapeva già descrivere due cose e non
// sapeva confrontarle: da una parte `ObservedLeagueSettings` — che cosa la
// lega dichiara di sé, `allowedModules`, `maxSubstitutions`, `sameRoleOnly`,
// … — dall'altra `LineupSubmission`, che cosa stiamo per mandare. In mezzo non
// c'era nulla, e il vuoto lo riempiva chi scrive: un elenco di moduli scritto a
// mano, cioè una **costante al posto di un'osservazione**. Una costante non
// sbaglia mai in silenzio finché la lega le dà ragione; il giorno in cui la
// lega dichiara un elenco diverso, quella costante mente, e la formazione parte
// lo stesso — respinta dalla piattaforma, o peggio accettata storta.
// `validateSubmissionAgainstSettings` è quel confronto, e non ha costanti di
// merito da nessuna parte: ogni vincolo che applica viene o dall'invio stesso o
// da ciò che è stato osservato, e lo dichiara con `observed`.
//
// CHE COSA GARANTISCE. Che l'invio sia coerente **con sé stesso** — un portiere
// e uno solo, dieci di movimento nel numero che il modulo richiede, nessun
// giocatore schierato due volte fra titolari, panchina e porta, giornata intera
// e positiva, la stessa competizione dichiarata dall'invio e dalla formazione —
// e che sia coerente **con ciò che è stato letto della lega**: il modulo
// dentro l'elenco dichiarato, gli id dentro la rosa quando la rosa è stata
// passata, la panchina abbastanza lunga da coprire le sostituzioni dichiarate.
//
// I RUOLI ARRIVANO DA FUORI, E SOLO SE QUALCUNO LI PASSA. Un invio porta id
// opachi e nient'altro: da solo non dice chi è difensore. Per questo la
// composizione dei reparti — quanti D, quanti C, quanti A fra i dieci di
// movimento, contro `moduleShape` — si verifica **solo** con `options.roles`,
// la mappa id -> ruolo che `rolesByPlayerId` costruisce dalla rosa osservata.
// Un undici con cinque difensori dentro un 4-4-2 si ferma qui, non sulla
// piattaforma. Senza quella mappa la funzione non deduce nulla e lo dichiara:
// `composizione_non_verificabile`.
//
// UN RUOLO MANCANTE NON SI DEDUCE, E NON SI ARROTONDA IL CONTROLLO. Se un id
// dell'invio non compare in `roles`, è un buco dell'osservazione, non
// un'illegalità: esce un avvertimento dedicato, e sul **reparto** di quel
// giocatore la funzione non si pronuncia. Concretamente: un reparto viene
// dichiarato sbagliato solo quando lo è **con certezza** — i ruoli noti sono
// già più di quelli richiesti, oppure non bastano nemmeno assegnando ogni
// ruolo ignoto a quel reparto. In mezzo c'è il caso indecidibile, e lì si tace.
// La ragione è la stessa che governa tutto il file: un controllo fatto a metà
// che si presenta come completo è peggio di un controllo assente, perché
// produce una fiducia che nessuno ha guadagnato.
//
// CHE COSA NON GARANTISCE, e va detto prima che qualcuno ci conti sopra. Non
// garantisce che la piattaforma accetti: la piattaforma è l'unica autorità su
// sé stessa, e l'unica prova di un invio riuscito resta la rilettura
// (`outcomeFromReadBack`). Non garantisce la composizione dei reparti quando
// `roles` non è passata, né il reparto dei giocatori il cui ruolo non è stato
// osservato — nei due casi lo **dichiara**, non lo suppone. Non garantisce che
// una sostituzione sarà possibile: §10 vuole lo stesso ruolo, ma chi entra al
// posto di chi si decide a giornata in corso, non qui. Il controllo sulla
// giornata è **parziale per costruzione**: `ObservedLineup` porta la
// competizione e non la giornata, quindi si verifica che quella dell'invio sia
// intera e positiva, non che l'invio e la formazione parlino della stessa
// giornata — un confronto che oggi non ha due valori da confrontare. E non
// garantisce nulla sul merito: una formazione legale può essere pessima.
//
// PERCHÉ UN'ASSENZA PRODUCE UN AVVERTIMENTO, e non un default né un rifiuto.
// Questo file eredita la regola di `leagueSettings.ts`: `undefined` significa
// «non osservato», mai un valore. Ne discendono due divieti simmetrici, e il
// secondo si dimentica sempre per primo. **Fail-open silenzioso**: se
// `allowedModules` non è stato osservato, dire «allora il modulo va bene» è
// dichiarare una verifica che nessuno ha fatto. **Fail-closed sull'ignoto**: se
// `allowedModules` non è stato osservato, bloccare l'invio è punire la lega per
// una lacuna della lettura — e alla deadline di §16 un blocco vale la
// formazione della giornata precedente, cioè un danno certo per un rischio
// ipotetico. La terza strada è l'unica onesta: la funzione **dichiara** ciò che
// non ha potuto verificare, con un codice suo, severità `avvertimento` e
// `observed: false`. Chi invia decide sapendo; nessuno decide al posto suo.
//
// LA STESSA REGOLA VALE PER CIÒ CHE NON È STATO PASSATO. `options.rosterIds` è
// facoltativo: se c'è, ogni id estraneo è bloccante; se non c'è, la funzione
// **non** produce nulla — né un blocco né un avvertimento. Non aver ricevuto la
// rosa non è un fatto della lega, è un fatto del chiamante, che lo sa già:
// riferirglielo sarebbe rumore in ogni singolo esito.
//
// DUE COMPETIZIONI, E IL FLAG CHE NON LE COPRE. §23 rende reale il caso in cui
// nella stessa giornata si schierano due formazioni, una per il campionato e
// una per la coppa. Il flag «vale per tutte le competizioni» dice che cosa la
// piattaforma farà, non che l'altra partita sia a posto: la formazione resta
// calcolata contro **un** avversario, e l'effetto sull'altra competizione da
// qui non si vede. Per questo `allCompetitions: true` produce un avvertimento
// dedicato invece di un silenzio: si verifica rileggendo l'altra formazione,
// non deducendolo.
//
// NIENTE RETE, NIENTE OROLOGIO. Funzione pura: nessun `fetch`, nessuna `Date`,
// nessun `Math.random`, nessuno stato. A parità di argomenti l'esito è lo
// stesso, elenco compreso: l'ordine è stabile per severità, poi per codice,
// poi per messaggio, e non dipende dall'ordine in cui i controlli girano.

import type { Module } from "../../league-gameweek/src/leagueGameweek.js";
import { MODULES, moduleShape } from "../../league-gameweek/src/leagueGameweek.js";
import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";
import type {
  ObservedLeagueSettings,
  ObservedScoringSettings,
} from "./leagueSettings.js";
import type { LineupSubmission } from "./lineupSubmission.js";

/** Quanto pesa una violazione. `bloccante` significa: non si invia così. */
export type SubmissionSeverity = "bloccante" | "avvertimento";

/**
 * Una ragione per cui l'invio non è (o non è dimostrabilmente) legale.
 *
 * `code` è la chiave stabile per la macchina, `message` la ragione per chi
 * legge. `observed` distingue i due mondi che questo file tiene separati: `true`
 * quando il vincolo viene da ciò che la lega ha dichiarato, `false` quando la
 * violazione nasce dall'invio stesso o dall'**assenza** di una dichiarazione.
 */
export interface SubmissionViolation {
  /** Chiave stabile, macchina-leggibile. */
  readonly code: string;
  /** Che cosa non va e perché, in italiano. */
  readonly message: string;
  readonly severity: SubmissionSeverity;
  /** `true` se il vincolo violato viene dalle impostazioni osservate. */
  readonly observed?: boolean;
}

/**
 * I codici che questa funzione può emettere. Elenco chiuso ed esportato perché
 * chi reagisce a una violazione non debba ribattere a mano una stringa: un
 * codice sbagliato in un `if` è un ramo morto che nessun test vede.
 */
export const SUBMISSION_VIOLATION_CODES = {
  /** Il modulo dell'invio non è uno dei sette di §9. */
  moduloSconosciuto: "modulo_sconosciuto",
  /** Il modulo non è nell'elenco che la lega dichiara schierabile. */
  moduloNonAmmesso: "modulo_non_ammesso",
  /** La lega non ha dichiarato l'elenco: la legalità del modulo non è provabile. */
  moduloNonVerificabile: "modulo_non_verificabile",
  /** Nessun portiere dichiarato. */
  portiereMancante: "portiere_mancante",
  /** In porta c'è qualcuno che portiere non è. */
  portiereRuoloErrato: "portiere_ruolo_errato",
  /** I titolari di movimento non sono quanti il modulo ne richiede. */
  titolariNumeroErrato: "titolari_numero_errato",
  /** I difensori fra i titolari non sono quanti il modulo ne richiede. */
  difensoriNumeroErrato: "difensori_numero_errato",
  /** I centrocampisti fra i titolari non sono quanti il modulo ne richiede. */
  centrocampistiNumeroErrato: "centrocampisti_numero_errato",
  /** Gli attaccanti fra i titolari non sono quanti il modulo ne richiede. */
  attaccantiNumeroErrato: "attaccanti_numero_errato",
  /** Nessuna mappa dei ruoli: la composizione dei reparti non è verificabile. */
  composizioneNonVerificabile: "composizione_non_verificabile",
  /** Il ruolo di un id dell'invio non è stato osservato: non si deduce. */
  ruoloNonOsservato: "ruolo_non_osservato",
  /** Lo stesso id compare più di una volta fra porta, titolari e panchina. */
  idRipetuto: "id_ripetuto",
  /** Un id dell'invio non appartiene alla rosa passata dal chiamante. */
  idFuoriRosa: "id_fuori_rosa",
  /** Giornata non intera o non positiva. */
  giornataNonValida: "giornata_non_valida",
  /** Invio e formazione dichiarano competizioni diverse. */
  competizioneIncoerente: "competizione_incoerente",
  /** «Vale per tutte le competizioni»: l'effetto sull'altra non si vede da qui. */
  competizioneEstesaNonVerificabile: "competizione_estesa_non_verificabile",
  /** La panchina è più corta delle sostituzioni che la lega concede. */
  panchinaPiuCortaDelleSostituzioni: "panchina_piu_corta_delle_sostituzioni",
} as const;

const SEVERITY_RANK: Readonly<Record<SubmissionSeverity, number>> = {
  bloccante: 0,
  avvertimento: 1,
};

/**
 * I ruoli per id, nelle due forme in cui è naturale averli: la mappa che
 * `rolesByPlayerId` produce dalla rosa osservata, oppure un oggetto piano per
 * chi arriva da JSON. Entrambe si leggono, nessuna si modifica.
 */
export type ObservedRoles = ReadonlyMap<string, Role> | Readonly<Record<string, Role>>;

/** Ciò che il chiamante può aggiungere all'invio per farlo verificare meglio. */
export interface SubmissionLegalityOptions {
  /** Gli id schierabili. Senza, l'appartenenza alla rosa non si controlla. */
  readonly rosterIds?: readonly string[];
  /** I ruoli per id. Senza, la composizione dei reparti non si verifica. */
  readonly roles?: ObservedRoles;
}

/**
 * Il ruolo di un id, `undefined` se non è stato osservato. Sull'oggetto piano
 * si guarda solo ciò che l'oggetto possiede davvero: senza `Object.hasOwn` un
 * id come `constructor` risponderebbe qualcosa che nessuno ha osservato.
 */
function roleOf(roles: ObservedRoles, id: string): Role | undefined {
  if (roles instanceof Map) return roles.get(id) as Role | undefined;
  const record = roles as Readonly<Record<string, Role>>;
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/**
 * Il valore di un'impostazione per la competizione dell'invio.
 *
 * `leagueSettings.ts` è esplicito: nel blocco per competizione l'assenza di un
 * campo significa «questa competizione non dichiara una regola propria», non
 * «non è stata letta». Quindi il blocco della competizione vince quando dichiara
 * il campo, e altrimenti si legge il blocco generale — senza che l'assenza nel
 * blocco per competizione cancelli la dichiarazione di lega.
 */
function resolveSetting<K extends keyof ObservedScoringSettings>(
  settings: ObservedLeagueSettings,
  competitionId: string,
  key: K,
): ObservedScoringSettings[K] {
  const block = settings.perCompetition?.find(
    (candidate) => candidate.competitionId === competitionId,
  );
  const own = block?.settings[key];
  return own !== undefined ? own : settings[key];
}

function isKnownModule(module: Module): boolean {
  return MODULES.includes(module);
}

/** Il modulo, e se l'elenco dichiarato dalla lega lo ammette. */
function moduleViolations(
  submission: LineupSubmission,
  settings: ObservedLeagueSettings,
): readonly SubmissionViolation[] {
  const violations: SubmissionViolation[] = [];
  const module = submission.lineup.module;

  if (!isKnownModule(module)) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.moduloSconosciuto,
      message: `modulo «${String(module)}» fuori dai sette di §9: non è schierabile in questa lega`,
      severity: "bloccante",
      observed: false,
    });
    return violations;
  }

  const allowed = resolveSetting(settings, submission.competitionId, "allowedModules");
  if (allowed === undefined) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.moduloNonVerificabile,
      message:
        `la lega non ha dichiarato i moduli schierabili: la legalità di «${module}» non è ` +
        "verificabile da qui, e non viene supposta da un elenco scritto a mano",
      severity: "avvertimento",
      observed: false,
    });
    return violations;
  }

  if (!allowed.includes(module)) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.moduloNonAmmesso,
      message:
        `modulo «${module}» fuori dall'elenco dichiarato dalla lega ` +
        `(${allowed.join(", ")}): l'invio verrebbe respinto`,
      severity: "bloccante",
      observed: true,
    });
  }
  return violations;
}

/** L'undici: un portiere, e tanti di movimento quanti il modulo ne chiede. */
function elevenViolations(submission: LineupSubmission): readonly SubmissionViolation[] {
  const violations: SubmissionViolation[] = [];
  const lineup = submission.lineup;

  if (lineup.goalkeeperId.length === 0) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.portiereMancante,
      message: "nessun portiere dichiarato: l'undici non è completo",
      severity: "bloccante",
      observed: false,
    });
  }

  if (isKnownModule(lineup.module)) {
    const shape = moduleShape(lineup.module);
    const expected = shape.defenders + shape.midfielders + shape.strikers;
    if (lineup.starterIds.length !== expected) {
      violations.push({
        code: SUBMISSION_VIOLATION_CODES.titolariNumeroErrato,
        message:
          `il modulo «${lineup.module}» richiede ${expected} titolari di movimento ` +
          `(${shape.defenders} difensori, ${shape.midfielders} centrocampisti, ` +
          `${shape.strikers} attaccanti), l'invio ne porta ${lineup.starterIds.length}`,
        severity: "bloccante",
        observed: false,
      });
    }
  }

  return violations;
}

/** Tutti gli id dell'invio, in ordine di comparsa: porta, titolari, panchina. */
function submittedIds(submission: LineupSubmission): readonly string[] {
  const lineup = submission.lineup;
  const ids = lineup.goalkeeperId.length === 0 ? [] : [lineup.goalkeeperId];
  return [...ids, ...lineup.starterIds, ...lineup.benchIds];
}

/**
 * I REPARTI CONTRO IL MODULO, e il portiere che deve essere un portiere.
 *
 * Un reparto si dichiara sbagliato **solo quando lo è con certezza**: o i ruoli
 * noti sono già più di quelli richiesti, o non bastano nemmeno assegnando ogni
 * ruolo ignoto a quel reparto. Nel mezzo il caso è indecidibile e la funzione
 * tace sul merito, avendo già detto a voce alta — un avvertimento per id — che
 * quei ruoli non li ha osservati.
 */
function compositionViolations(
  submission: LineupSubmission,
  roles: ObservedRoles | undefined,
): readonly SubmissionViolation[] {
  const lineup = submission.lineup;

  if (roles === undefined) {
    return [
      {
        code: SUBMISSION_VIOLATION_CODES.composizioneNonVerificabile,
        message:
          "i ruoli non sono stati passati: la composizione dei reparti contro il modulo " +
          `«${String(lineup.module)}» non è verificabile da qui, e non viene supposta`,
        severity: "avvertimento",
        observed: false,
      },
    ];
  }

  const violations: SubmissionViolation[] = [];
  const seen = new Set<string>();
  for (const id of submittedIds(submission)) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (roleOf(roles, id) === undefined) {
      violations.push({
        code: SUBMISSION_VIOLATION_CODES.ruoloNonOsservato,
        message:
          `il ruolo di «${id}» non è stato osservato: non viene dedotto, e il suo reparto ` +
          "resta fuori dal conto",
        severity: "avvertimento",
        observed: false,
      });
    }
  }

  const goalkeeperRole =
    lineup.goalkeeperId.length === 0 ? undefined : roleOf(roles, lineup.goalkeeperId);
  if (goalkeeperRole !== undefined && goalkeeperRole !== "P") {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.portiereRuoloErrato,
      message:
        `in porta c'è «${lineup.goalkeeperId}», che è di ruolo ${goalkeeperRole}: ` +
        "il portiere deve essere un portiere (P)",
      severity: "bloccante",
      observed: true,
    });
  }

  if (!isKnownModule(lineup.module)) return violations;
  const shape = moduleShape(lineup.module);

  const counts: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  let unknown = 0;
  for (const id of lineup.starterIds) {
    const role = roleOf(roles, id);
    if (role === undefined) {
      unknown += 1;
      continue;
    }
    counts[role] += 1;
  }

  const departments = [
    {
      role: "D",
      expected: shape.defenders,
      label: "difensori",
      code: SUBMISSION_VIOLATION_CODES.difensoriNumeroErrato,
    },
    {
      role: "C",
      expected: shape.midfielders,
      label: "centrocampisti",
      code: SUBMISSION_VIOLATION_CODES.centrocampistiNumeroErrato,
    },
    {
      role: "A",
      expected: shape.strikers,
      label: "attaccanti",
      code: SUBMISSION_VIOLATION_CODES.attaccantiNumeroErrato,
    },
  ] as const;

  for (const department of departments) {
    const found = counts[department.role];
    const head =
      `il modulo «${lineup.module}» richiede ${department.expected} ${department.label} ` +
      `fra i titolari, l'invio ne porta ${found}`;
    if (found > department.expected) {
      violations.push({
        code: department.code,
        message: head,
        severity: "bloccante",
        observed: true,
      });
      continue;
    }
    if (found + unknown < department.expected) {
      violations.push({
        code: department.code,
        message:
          unknown === 0
            ? head
            : `${head} più ${unknown} di ruolo non osservato: non bastano comunque`,
        severity: "bloccante",
        observed: true,
      });
    }
  }

  return violations;
}

/**
 * Nessuno due volte. Il controllo è unico e attraversa porta, titolari e
 * panchina insieme: separarli avrebbe lasciato passare proprio il caso che
 * conta — lo stesso giocatore titolare **e** in panchina, che a valle diventa
 * una sostituzione con sé stesso.
 */
function duplicateViolations(submission: LineupSubmission): readonly SubmissionViolation[] {
  const counts = new Map<string, number>();
  for (const id of submittedIds(submission)) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const violations: SubmissionViolation[] = [];
  for (const [id, count] of counts) {
    if (count > 1) {
      violations.push({
        code: SUBMISSION_VIOLATION_CODES.idRipetuto,
        message: `«${id}» compare ${count} volte fra porta, titolari e panchina`,
        severity: "bloccante",
        observed: false,
      });
    }
  }
  return violations;
}

/**
 * La rosa, **solo se è stata passata**. Senza `rosterIds` non c'è né controllo
 * né avvertimento: la funzione non finge di aver verificato ciò che non ha
 * ricevuto, e non rinfaccia al chiamante una scelta che è sua.
 */
function rosterViolations(
  submission: LineupSubmission,
  rosterIds: readonly string[] | undefined,
): readonly SubmissionViolation[] {
  if (rosterIds === undefined) return [];
  const roster = new Set(rosterIds);
  const violations: SubmissionViolation[] = [];
  const seen = new Set<string>();
  for (const id of submittedIds(submission)) {
    if (seen.has(id) || roster.has(id)) continue;
    seen.add(id);
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.idFuoriRosa,
      message: `«${id}» non appartiene alla rosa osservata: non è schierabile`,
      severity: "bloccante",
      observed: true,
    });
  }
  return violations;
}

/**
 * Giornata e competizione. La giornata della formazione non esiste come campo —
 * `ObservedLineup` porta la competizione, non la giornata — quindi qui c'è ciò
 * che l'invio dichiara e nient'altro; la coerenza fra le due, se un domani la
 * formazione porterà la sua, si controlla in questo punto.
 */
function matchdayAndCompetitionViolations(
  submission: LineupSubmission,
): readonly SubmissionViolation[] {
  const violations: SubmissionViolation[] = [];

  if (!Number.isInteger(submission.matchday) || submission.matchday < 1) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.giornataNonValida,
      message: `giornata «${submission.matchday}»: attesa una giornata intera e positiva`,
      severity: "bloccante",
      observed: false,
    });
  }

  if (submission.competitionId !== submission.lineup.competitionId) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.competizioneIncoerente,
      message:
        `invio dichiarato per «${submission.competitionId}» con una formazione calcolata ` +
        `per «${submission.lineup.competitionId}»: è la partita sbagliata`,
      severity: "bloccante",
      observed: false,
    });
  }

  if (submission.lineup.flags.allCompetitions) {
    violations.push({
      code: SUBMISSION_VIOLATION_CODES.competizioneEstesaNonVerificabile,
      message:
        "«vale per tutte le competizioni»: l'effetto sull'altra competizione non è " +
        "verificabile da qui e va accertato rileggendo quella formazione (§23)",
      severity: "avvertimento",
      observed: false,
    });
  }

  return violations;
}

/**
 * Sostituzioni e panchina. §10 lascia la panchina **libera**: una panchina corta
 * è legale, e infatti questo non blocca. Ma con meno panchinari delle
 * sostituzioni concesse le sostituzioni disponibili si riducono di fatto, e nella
 * giornata in cui i senza voto sono tanti quella differenza è il risultato: chi
 * invia deve saperlo prima, non scoprirlo dopo.
 */
function substitutionViolations(
  submission: LineupSubmission,
  settings: ObservedLeagueSettings,
): readonly SubmissionViolation[] {
  const maxSubstitutions = resolveSetting(
    settings,
    submission.competitionId,
    "maxSubstitutions",
  );
  if (maxSubstitutions === undefined) return [];
  const bench = submission.lineup.benchIds.length;
  if (bench >= maxSubstitutions) return [];
  return [
    {
      code: SUBMISSION_VIOLATION_CODES.panchinaPiuCortaDelleSostituzioni,
      message:
        `panchina di ${bench} contro ${maxSubstitutions} sostituzioni dichiarate dalla lega: ` +
        "è legale, ma le sostituzioni realmente disponibili sono meno di quelle concesse",
      severity: "avvertimento",
      observed: true,
    },
  ];
}

function compareViolations(a: SubmissionViolation, b: SubmissionViolation): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}

/**
 * CONFRONTA UN INVIO CON LE IMPOSTAZIONI OSSERVATE DELLA LEGA.
 *
 * Restituisce l'elenco delle violazioni, **vuoto** se l'invio è legale per tutto
 * ciò che si è potuto verificare. Nessun throw: un invio illegale è un fatto da
 * leggere, non un incidente del chiamante — e chi lo riceve deve poter mostrare
 * tutte le ragioni, non la prima.
 *
 * L'esito è ordinato per severità (prima i `bloccante`), poi per codice, poi per
 * messaggio: stabile a parità di argomenti, e indipendente dall'ordine interno
 * dei controlli.
 *
 * `options.rosterIds`, se passato, è l'insieme degli id schierabili: senza di
 * esso l'appartenenza alla rosa **non viene controllata e non viene finta**.
 * `options.roles` è la mappa id -> ruolo (`rolesByPlayerId` la costruisce dalla
 * rosa osservata): senza di essa la composizione dei reparti non viene
 * verificata, e l'esito lo dichiara invece di tacerlo.
 */
export function validateSubmissionAgainstSettings(
  submission: LineupSubmission,
  settings: ObservedLeagueSettings,
  options?: SubmissionLegalityOptions,
): readonly SubmissionViolation[] {
  const violations: SubmissionViolation[] = [
    ...moduleViolations(submission, settings),
    ...elevenViolations(submission),
    ...compositionViolations(submission, options?.roles),
    ...duplicateViolations(submission),
    ...rosterViolations(submission, options?.rosterIds),
    ...matchdayAndCompetitionViolations(submission),
    ...substitutionViolations(submission, settings),
  ];
  return violations.sort(compareViolations);
}
