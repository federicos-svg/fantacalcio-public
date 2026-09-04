# `expert-topics-contract` — i topic di partita di un forum di esperti

Contratto dati e **parser puro** dei topic che un forum di esperti apre per la
singola partita di giornata: che cosa è un topic, un post, un autore, un ruolo,
una citazione, e **come un topic si lega alla sua partita**.

Qui non c'è **nessuna acquisizione**: nessun host, nessun indirizzo, nessuna
sezione, nessuna credenziale, nessuna chiamata di rete, nessun orologio, nessun
numero a caso, nessun contenuto editoriale. Chi va a prendere la pagina, con
quali limiti, e dove ne deposita i byte, vive nel layer privato e **chiama**
questo pacchetto. Le fixture delle prove sono **sintetiche**: imitano la
struttura osservata, non la copiano.

Versioni stampate accanto a ogni risultato: `expert-topics-contract-v1`,
`expert-topics-parser-v1.0.0`. Un risultato senza entrambe non è valido.

## Il vincolo da cui parte tutto

**Misurato, non ipotizzato**, sul campione di riferimento (dieci topic di
partita): il titolo **non porta mai** il numero di giornata — zero su dieci.

> Un topic si lega alla sua partita **per coppia di squadre e per orario**,
> incrociati con un calendario **iniettato**. Chi presumesse la giornata dal
> titolo costruirebbe sul nulla.

È un vincolo del contratto, non una nota a margine. Il campo
`matchdayNumberInTitle` esiste per **contare**, e nessuna funzione di legame lo
guarda: se un giorno smette di essere sempre falso, si rimisura e si discute —
non si cambia il legame di nascosto.

Il legame dichiara sempre **perché** non riesce: `CALENDARIO_ASSENTE` (giornata
ignota), `CHIAVE_INCOMPLETA`, `SQUADRE_NON_RICONCILIATE` (serve la tabella di
alias, mai un accostamento indovinato), `NESSUNA_CORRISPONDENZA`,
`CORRISPONDENZA_AMBIGUA` (più di un candidato: **non si sceglie**). La giornata
è valorizzata **solo** in `RISOLTO`.

## Il ruolo si verifica, non si presume

Tre classi, non due: `staff_verificato`, `comunita`, `non_verificabile`. «Non lo
sappiamo» è un fatto diverso da «non è staff», e confonderli fa sparire un
esperto dai conteggi.

- Il **blocco autore è riconosciuto, mai dedotto**: un solo contenitore
  ammesso, e la sua regione finisce dove comincia il contenuto del post. Se il
  blocco autore compare **dopo** il contenuto, la separazione non è più
  dimostrabile e il post è `non_verificabile`: chi incolla un finto blocco
  autore nel proprio testo può al massimo **togliersi** autorità, mai darsene.
- Il marcatore di rango vale **solo se l'immagine viene dalla fonte**: il blocco
  autore porta anche l'avatar scelto dall'utente. Forme con host diverso,
  `data:`, `blob:`, `javascript:` e forma senza schema sono rifiutate una per
  una, e ognuna ha la sua prova.
- Un'**etichetta testuale** di rango non conferisce nulla: si scrive da sé.
- Il **ruolo di chi è citato non passa mai a chi cita**, e l'annidamento delle
  citazioni si conserva perché è l'unica cosa che dice chi ha detto che cosa.

## Che cosa esce

- Il **referto**: solo forme e conteggi — esiti, topic, post, ruoli per classe,
  date presenti e assenti, citazioni e annidamento massimo, stati del legame,
  copertura della paginazione, **forme di titolo anonime**, impronte brevi dei
  byte. Nessun titolo, nessun nome, nessun testo: una prova lo verifica.
- L'**estratto**: titoli, nomi e testo, marcato `privateOnly` e
  `redistributionAllowed: false`. Va **soltanto** nel deposito privato di chi ha
  letto la fonte, e non esce mai di lì.

**Raw prima, parsing poi**: una pagina senza deposito confermato e senza
impronta non viene analizzata (`RAW_NON_DEPOSITATO`, fail-closed). I topic di
partita sono **effimeri** — durano pochi giorni e spariscono — e analizzare
byte che nessuno ha depositato produce un risultato che domani nessuno può più
rifare né smentire.

## Che cosa NON è stato osservato

Ognuna di queste voci è un'assunzione **non misurata**. Chi la usasse come se
fosse un fatto starebbe uscendo dal contratto, e questa lista è qui — nel
contratto e non in una nota operativa — perché la legga chi arriva dopo.

1. **Il marcatore di rango nei topic di partita.** Il marcatore che si inietta
   viene da un altro perimetro dello stesso forum. In questi topic **non è
   ancora stato visto**: potrebbe essere un altro, o non esserci. Per questo
   l'assenza del marcatore non è mai «nessun esperto», ma **ruoli non
   verificati**.
2. **Chi apre un topic di partita.** In quell'altro perimetro il primo post è la
   scheda ufficiale della squadra, per posizione. Qui **non vale**: non è stato
   osservato, e il parser non attribuisce **nessuna** autorità al post di
   apertura.
3. **I nomi delle squadre come li scrive la fonte.** Non sono mai stati fatti
   uscire, deliberatamente. Senza tabella di alias l'incrocio può finire in
   `SQUADRE_NON_RICONCILIATE`; la tabella si costruisce sulla prima osservazione
   reale, non a memoria.
4. **Quale squadra gioca in casa.** L'ordine nel titolo è plausibile e non
   verificato: `homeAwayUnverified` resta `true` finché non è misurato.
5. **La paginazione oltre la prima pagina.** Il topic osservato aveva una pagina
   sola: passo, offset e comportamento delle pagine successive sono dedotti,
   non osservati su un topic lungo. Per questo `complete` vale `null` — *ignota*
   — e non `true`, quando la fonte non dichiara quante pagine ha.
6. **Quanto durino davvero i topic.** Che siano effimeri è dichiarato, non
   misurato: se spariscano o vengano spostati, e dopo quanto, non lo sappiamo.
7. **Il fuso orario delle date dei post.** Si prende l'attributo `datetime` così
   com'è; che porti sempre il fuso non è stato verificato su questo perimetro.
   Una data in prosa non viene mai interpretata: sarebbe una data e un fuso
   inventati.
8. **La differenza di un post fra conteggio e risposte dichiarate.** Misurata su
   **un** solo topic: vale per quel topic, non per il forum.

## Come si cambia

Una misura nuova che smentisca una misura citata qui — il criterio, i
separatori d'orario, il titolo senza giornata, il marcatore di rango — riapre il
punto corrispondente: si riscrive la regola **sulla nuova misura**, si alza la
versione del contratto e con essa quella del parser, e i risultati vecchi
restano leggibili perché portano la versione con cui sono stati prodotti.
Nessuna di queste regole si allarga per intuizione.
