// Shared palette + tiny DOM utility. Extracted from main.ts so devStatic.ts
// and views.ts can reuse the same tokens without duplicating them.

export const C = {
  // LA DIREZIONE «LAVAGNA» (Pico, 31/10/2026) — copia letterale dei token di
  // src/styles/base.css, dove stanno le misure di contrasto e la motivazione.
  // I due elenchi si tengono allineati a mano.
  bg: "#0d1a19",
  panel: "#152422",
  panelInner: "#1d2e2c",
  border: "#304140",
  // La menta: fondo, bordo e testo (10,64 / 9,60 / 8,48 :1 su bg / panel /
  // panelInner). Sopra la menta, il testo è `onAccent`.
  accent: "#63dbcd",
  onAccent: "#041a18",
  accentDim: "#1b4a45",
  // Rampa del testo: ogni livello ≥ 4,5:1 (WCAG AA) su ogni sfondo su cui
  // compare davvero. Lo sfondo peggiore è panelInner. Su panelInner: dim
  // 4,98:1, sec 7,16:1, mid 9,82:1, primary 12,32:1.
  textPrimary: "#f1efe6",
  textSec: "#adbbb9",
  textMid: "#d3d8d2",
  textDim: "#8e9c9a",
  // Come `accent`: il nome resta perché il codice lo usa già.
  textAccent: "#63dbcd",
  // STOP e verde: identici a prima, per scelta di Pico.
  stopRed: "oklch(0.7 0.19 25)",
  stopRedDark: "oklch(0.5 0.16 25)",
  green: "oklch(0.65 0.15 145)",
  // La monospaziata di prima, identica: numeri e identificativi dell'Asta.
  mono: "ui-monospace,'SF Mono',Menlo,Consolas,monospace",
  // Il testo, e i titoli/etichette/numeri grandi.
  font: "'Barlow',system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  display: "'Barlow Condensed','Barlow',system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
};

/**
 * DEV-shell marker colors. The panel border stays RED + DASHED (signals
 * "provisional", same family as STOP so it still reads as "pay attention")
 * — but the chip/badge/note use an AMBER accent, not red, so the "DEV
 * STATICO" label can never be mistaken for the "STOP" badge at a glance:
 * different hue (75 = amber vs 25 = red), not just a different border
 * style. STOP means "auction plan infeasible, act now"; DEV STATICO means
 * "not implemented yet, informational only".
 */
export const DEV_BORDER = "oklch(0.62 0.19 25)";
export const DEV_ACCENT = "oklch(0.78 0.15 75)";
export const DEV_ACCENT_TEXT = "oklch(0.2 0.03 75)";

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Uniform role chip palette (P/D/C/A) — one dot+letter look everywhere a
 * role appears, instead of ad-hoc plain text per screen. C è il blu che
 * l'app usava come accento — `oklch(0.55 0.13 250)` — ma NON è più legato
 * all'accento: da quando l'accento è la menta (direzione «Lavagna», Pico
 * 31/10/2026) il colore del ruolo è scritto qui per esteso, identico a
 * prima, e non segue più nessun token. A is red but
 * at a different hue (18) than the STOP badge (hue 25, C.stopRed) — same
 * "role at a glance" convention as most Fantacalcio apps, deliberately not
 * identical to the STOP token so the two stay visually distinct.
 *
 * I FONDI NON SI TOCCANO. La convenzione di hue qui sopra è una decisione di
 * prodotto: A a 18 distinto da STOP a 25, D che riusa il verde, C il blu di
 * sempre (scritto per esteso, non più legato all'accent). Restano identici —
 * forma e bordo del disco pure; la dimensione è identica ovunque tranne dove una
 * schermata la chiede più grande (vedi ROLE_CHIP_STYLE). L'unica cosa che è
 * cambiata nei colori è IL COLORE DEL GLIFO dentro il disco.
 *
 * GLIFO: SCURO, non bianco, dove il disco non regge il bianco. Il chip è
 * testo a 10px — testo normale per WCAG, soglia 4,5:1, nessuna eccezione
 * "large text". Col bianco solo P e C stavano sopra; D e A no:
 *
 *   P  bianco  1,73:1  ->  già scuro dal primo giorno,  9,18:1  (invariata)
 *   C  bianco  4,83:1  ->  invariata, il bianco su questo blu regge
 *   D  bianco  3,02:1  ->  glifo scuro                  5,22:1
 *   A  bianco  4,07:1  ->  glifo scuro                  4,79:1
 *
 * La ricetta del glifo è quella che P usava già: `oklch(L 0.03 <hue del suo
 * disco>)` — un quasi-nero che porta la tinta del proprio disco invece di un
 * nero piatto, così i quattro glifi restano una famiglia sola. D prende
 * esattamente la L di P (0.25). A no, e non è una svista: il suo disco è molto
 * più scuro di quello di P e di quello di D (bianco ci sta a 4,07:1 contro
 * 1,73:1 su P), quindi a L 0.25 il glifo si fermerebbe a 3,96:1 — ancora sotto
 * soglia. Serve L 0.16, ed è la L che il suo disco impone, non una scelta
 * estetica: è lo stesso ragionamento di --panel-inner che fissa il gradino
 * più basso della rampa in base.css.
 *
 * Misure prese sul DOM vivo (oklch risolto dal browser, luminanza relativa
 * WCAG), non a mano; e2e/text-contrast-aa.spec.ts le rimisura a ogni run su
 * ogni chip a schermo, così un ritorno al bianco diventa rosso.
 */
export const ROLE_COLORS: Record<string, { bg: string; text: string; mutedBg: string }> = {
  P: { bg: "oklch(0.82 0.14 95)", text: "oklch(0.25 0.03 95)", mutedBg: "oklch(0.42 0.14 95)" },
  D: { bg: "oklch(0.65 0.16 145)", text: "oklch(0.25 0.03 145)", mutedBg: "oklch(0.42 0.16 145)" },
  C: { bg: "oklch(0.55 0.13 250)", text: "white", mutedBg: "oklch(0.42 0.13 250)" },
  A: { bg: "oklch(0.62 0.22 18)", text: "oklch(0.16 0.03 18)", mutedBg: "oklch(0.42 0.22 18)" },
};

/**
 * LA PASTIGLIA ARRETRATA — `mutedBg` qui sopra, e questo glifo.
 *
 * Serve a una riga che deve leggersi come già chiusa (in listone: il giocatore
 * è stato assegnato). Prima quella riga arretrava con `opacity: 0.6`, che si
 * applica al layer intero: attenuava il testo — che è il motivo per cui è
 * stata tolta, portava il nome del giocatore a 4,28:1 e il badge a 1,67:1 —
 * ma attenuava anche TUTTO IL RESTO. Tolta l'opacità, il testo risale e il
 * disco della pastiglia torna a piena intensità: misurato sulla riga
 * assegnata, la luminanza del disco passava da 0.2229 a 0.5555 (P), 0.1291 a
 * 0.2972 (D), 0.0802 a 0.1676 (C), 0.0885 a 0.2080 (A) — fra 2,1x e 2,5x. In
 * un listone lungo, le righe che non puoi più comprare diventavano la cosa
 * più accesa a schermo.
 *
 * `mutedBg` rimette il disco al livello che aveva da attenuato SENZA opacità,
 * quindi senza toccare il testo: stesso hue e stesso chroma di sempre — la
 * convenzione dei ruoli non si tocca — con la sola L portata a 0.42. Una L
 * sola per tutti e quattro, non quattro numeri ad hoc: i dischi cadono in una
 * banda stretta (luminanza 0.075..0.086) e ciascuno resta ≤ di quanto era
 * prima (P 34%, D 66%, C 93%, A 90% del vecchio livello attenuato). Mai più
 * forte di prima: è l'unica condizione che questa regola deve rispettare.
 *
 * Il glifo torna BIANCO, e non è un ripensamento sul glifo scuro: su un disco
 * scuro è il bianco a portare il contrasto. Sui quattro dischi attenuati sta
 * fra 7,75:1 e 8,43:1 — molto sopra AA, più di quanto il chip pieno arrivi a
 * fare. La riga arretra e resta leggibile: erano le due cose insieme.
 */
export const ROLE_CHIP_MUTED_TEXT = "white";

/** Pastiglia piena o arretrata. `full` è il default ovunque. */
export type RoleChipVariant = "full" | "muted";

/**
 * Classe di sola IDENTITÀ, senza una regola CSS che la accompagni: non cambia
 * nulla di come il chip appare. Esiste perché la guardia di contrasto possa
 * trovare i chip per quello che SONO e non per il colore che hanno — un
 * selettore basato sul colore smetterebbe di corrispondere proprio quando
 * quel colore torna sbagliato, e il test resterebbe verde sull'app rotta
 * (già successo su questa suite con i token della rampa, vedi helpers.ts).
 */
export const ROLE_CHIP_CLASS = "role-chip";

// DIAMETRO E CORPO DEL DISCO SONO DUE VARIABILI CON UN DEFAULT: 18px e 10px,
// com'era, ovunque nessuno le imposti. Una schermata che vuole il disco più
// grande (il campo della Formazione) le scrive su un contenitore, e a una
// media query basta cambiarle: lo stile in linea non si può battere dal CSS,
// una variabile sì.
const ROLE_CHIP_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;width:var(--chip-d,18px);height:var(--chip-d,18px);border-radius:50%;font-size:var(--chip-f,10px);font-weight:800;line-height:1;flex:none;";

/** Classe e colori di una pastiglia, in una sola funzione: le due varianti
 *  non si scrivono due volte. */
function roleChipFace(
  c: { bg: string; text: string; mutedBg: string },
  variant: RoleChipVariant,
): { className: string; bg: string; fg: string } {
  if (variant === "muted") {
    return {
      className: `${ROLE_CHIP_CLASS} ${ROLE_CHIP_CLASS}--muted`,
      bg: c.mutedBg,
      fg: ROLE_CHIP_MUTED_TEXT,
    };
  }
  return { className: ROLE_CHIP_CLASS, bg: c.bg, fg: c.text };
}

/** HTML-string chip, for embedding inline in existing innerHTML templates. */
export function roleChipHtml(role: string, variant: RoleChipVariant = "full"): string {
  const c = ROLE_COLORS[role];
  if (!c) return escHtml(role);
  const face = roleChipFace(c, variant);
  return `<span class="${face.className}" style="${ROLE_CHIP_STYLE}background:${face.bg};color:${face.fg};">${escHtml(role)}</span>`;
}

/** DOM-element chip, for spots that build nodes via createElement. */
export function renderRoleChip(role: string, variant: RoleChipVariant = "full"): HTMLElement {
  const c = ROLE_COLORS[role];
  const face = c === undefined ? null : roleChipFace(c, variant);
  const span = document.createElement("span");
  span.className = face?.className ?? ROLE_CHIP_CLASS;
  span.textContent = role;
  span.style.cssText = `${ROLE_CHIP_STYLE}background:${face?.bg ?? C.textDim};color:${face?.fg ?? "white"};`;
  return span;
}
