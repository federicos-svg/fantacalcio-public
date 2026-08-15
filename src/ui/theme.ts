// Shared palette + tiny DOM utility. Extracted from main.ts so devStatic.ts
// and views.ts can reuse the same tokens without duplicating them.

export const C = {
  bg: "oklch(0.19 0.008 270)",
  panel: "oklch(0.24 0.01 270)",
  panelInner: "oklch(0.28 0.012 270)",
  border: "oklch(0.32 0.012 270)",
  accent: "oklch(0.55 0.13 250)",
  accentDim: "oklch(0.35 0.06 250)",
  // Rampa del testo: ogni livello ≥ 4,5:1 (WCAG AA) su ogni sfondo su cui
  // compare davvero. Lo sfondo peggiore è panelInner (0.28), che impone
  // L ≥ 0.6493. Su panelInner: dim 4,69:1, sec 6,33:1, mid 8,36:1,
  // primary 13,00:1. La copia normativa e la motivazione stanno in
  // src/styles/base.css — questi due elenchi si tengono allineati a mano.
  textPrimary: "oklch(0.96 0.005 270)",
  textSec: "oklch(0.74 0.01 270)",
  textMid: "oklch(0.82 0.006 270)",
  textDim: "oklch(0.66 0.01 270)",
  // L'accent come TESTO (5,09:1 su panelInner); `accent` resta il colore di
  // fondi, bordi e focus ring e non cambia.
  textAccent: "oklch(0.68 0.13 250)",
  stopRed: "oklch(0.7 0.19 25)",
  stopRedDark: "oklch(0.5 0.16 25)",
  green: "oklch(0.65 0.15 145)",
  mono: "ui-monospace,'SF Mono',Menlo,Consolas,monospace",
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
 * role appears, instead of ad-hoc plain text per screen. C reuses the
 * app's existing accent blue (no new near-duplicate token). A is red but
 * at a different hue (18) than the STOP badge (hue 25, C.stopRed) — same
 * "role at a glance" convention as most Fantacalcio apps, deliberately not
 * identical to the STOP token so the two stay visually distinct.
 *
 * I FONDI NON SI TOCCANO. La convenzione di hue qui sopra è una decisione di
 * prodotto: A a 18 distinto da STOP a 25, D che riusa il verde, C che riusa
 * l'accent. Restano identici — dimensione, forma e bordo del disco pure.
 * L'unica cosa che è cambiata è IL COLORE DEL GLIFO dentro il disco.
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
  C: { bg: C.accent, text: "white", mutedBg: "oklch(0.42 0.13 250)" },
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

const ROLE_CHIP_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:10px;font-weight:800;line-height:1;flex:none;";

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
