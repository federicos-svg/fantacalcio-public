import { describe, it, expect } from "vitest";
import { nomiPerIdentificativo, LISTONE_CHIAVE_IDENTIFICATIVO } from "./formazioneNomiListone.js";
import type { ListonePlayer } from "./ui/listone.js";

// FIXTURE SINTETICHE. Nessun giocatore reale: nomi inventati, identificativi
// inventati. La forma è quella che il parser dell'anagrafica produce —
// l'identificativo di piattaforma non è un campo «core», quindi vive fra gli
// `extra` — e questa suite misura solo l'aggancio, mai un dato vero.

function riga(
  name: string,
  id: number | string | undefined,
  role: ListonePlayer["role"] = "C",
): ListonePlayer {
  return {
    name,
    role,
    club: "Squadra Sintetica",
    ...(id === undefined ? {} : { extra: { [LISTONE_CHIAVE_IDENTIFICATIVO]: id } }),
  };
}

describe("i nomi che l'anagrafica conosce, per identificativo", () => {
  it("aggancia il nome all'identificativo, e lo rende in una scala sola", () => {
    // L'anagrafica porta l'identificativo come NUMERO, la lega identifica i
    // giocatori con una STRINGA opaca: se la conversione non avvenisse qui,
    // l'aggancio fallirebbe su ogni riga senza che niente diventasse rosso —
    // la mappa sarebbe semplicemente vuota, e la pagina mostrerebbe numeri
    // esattamente come prima.
    const mappa = nomiPerIdentificativo([riga("Alfa Sintetico", 4896)]);
    expect(mappa.get("4896")).toBe("Alfa Sintetico");
  });

  it("una riga senza identificativo non entra: non si indovina", () => {
    const mappa = nomiPerIdentificativo([riga("Beta Sintetico", undefined)]);
    expect(mappa.size).toBe(0);
  });

  it("una riga senza nome utilizzabile non entra: uno spazio non è un nome", () => {
    expect(nomiPerIdentificativo([riga("   ", 12)]).size).toBe(0);
  });

  it("lo STESSO identificativo con due nomi diversi non entra AFFATTO", () => {
    // È la riga che protegge dal danno peggiore che questo modulo possa fare:
    // non una pagina rotta, ma una pagina sbagliata e credibile, col nome di
    // un altro sul gettone. «L'ultimo vince» sceglierebbe in silenzio.
    const mappa = nomiPerIdentificativo([
      riga("Gamma Sintetico", 700),
      riga("Delta Sintetico", 700),
    ]);
    expect(mappa.has("700")).toBe(false);
  });

  it("lo stesso identificativo con lo STESSO nome resta: non è un'ambiguità", () => {
    const mappa = nomiPerIdentificativo([
      riga("Epsilon Sintetico", 701),
      riga("Epsilon Sintetico", 701),
    ]);
    expect(mappa.get("701")).toBe("Epsilon Sintetico");
  });

  it("un'anagrafica vuota dà una mappa vuota, e non è un guasto", () => {
    expect(nomiPerIdentificativo([]).size).toBe(0);
  });
});
