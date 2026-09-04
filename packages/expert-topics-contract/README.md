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

## Perché il criterio di selezione sta qui, e non nel privato

Il criterio che riconosce un topic di partita — **nessun marcatore di altro
perimetro, una coppia di squadre, un orario** — è pubblico, ed è una **scelta
dell'Executive, contestabile**, presa sapendo che pubblicare un criterio di
riconoscimento è pubblicare un pezzo del nostro metodo.

La ragione: due nomi di squadra più un orario è un **ragionamento generico** su
come si riconosce un topic di partita, non un'impronta di una fonte
particolare. Non dice quale forum leggiamo, non contiene nomi di contenitori,
di classi o di percorsi di quella fonte, e il suo **valore di prova è alto** —
è la regola su cui poggiano i casi limite provati qui, incluso il titolo che
somiglia a un topic di partita e non lo è.

Diverso è l'elenco dei **nomi interni di una pagina**: quello identifica la
fonte, e infatti host, marcatore di rango e marcatore di altro perimetro sono
**iniettati** dal chiamante e non compaiono in nessun sorgente di questo
pacchetto — `tests/purity.test.ts` fallisce se qualcuno ce li rimette.

Se un giorno il criterio diventasse riconoscibile come impronta di una fonte
specifica, si sposta dietro un'iniezione come gli altri: è una decisione da
riprendere, non una regola chiusa per sempre.

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

## I segnali di formazione — perché la fonte è stata autorizzata

`src/lineupSignals.ts` legge da un post le affermazioni di formazione: un
giocatore **dato titolare**, **in dubbio**, **dato fuori**, oppure una
**smentita** di una notizia precedente. Quattro tipi, vocabolario chiuso.

Il testo di un post **non è un dato strutturato**: ogni estrazione da testo
libero è un'inferenza, e una inferenza che si presentasse come un fatto sarebbe
peggio di nessuna estrazione. Per questo il pacchetto **misura e dichiara**, come
fa `packages/source-reliability` con l'accordo fra fonti, e **non pesa niente**:
nessun punteggio, nessuna fiducia, nessun ordinamento per qualità. Ogni segnale
esce con

- il **grado della sua evidenza** — forma dell'enunciato (`affermata` /
  `attenuata`, col termine che l'attenua), soggetto (`risolto` / `ambiguo` /
  `non_identificato`, con quanti candidati e a quale ampiezza è stato trovato),
  classe di ruolo dell'autore e se quel ruolo è verificato. È un insieme di
  fatti messi accanto, non un ordinale: `alto/medio/basso` sarebbe già un peso;
- **da quale parte del post viene** — corpo dell'autore o citazione, con
  profondità e indice della citazione, periodo, proposizione e posizione del
  termine.

Chi sta a valle guarda quei campi e decide quanto pesarli. Qui non si decide.

### Le quattro regole

- **Il silenzio non è un'assenza di informazione sul giocatore.** Un post senza
  segnali riconoscibili non produce segnali: è `SILENZIO`, non un errore, ed è
  un fatto diverso da «detto fuori». Il silenzio si dichiara **solo se il testo
  è stato davvero letto**: corpo del post non riconosciuto →
  `SILENZIO_NON_DIMOSTRABILE`, che non autorizza nessuna conclusione.
- **Una contraddizione non cancella niente.** Un segnale più recente che
  contraddice uno precedente **non lo sostituisce**: restano entrambi, ciascuno
  col proprio momento, e la contraddizione è dichiarata — `OPPOSTI` (titolare e
  fuori), `RIVISTO` (una certezza e un dubbio), `SMENTITA_DICHIARATA` — con
  `span` che dice se sta dentro un post o fra due post. In questo modulo **non
  esiste un campo «ultimo segnale»**: esisterebbe per essere letto da solo, e
  chi legge deve poter vedere che l'esperto ha cambiato idea.
- **Il ruolo si verifica, non si presume.** Un segnale da autore con ruolo non
  verificato è **valido** ed esce, **marcato** (`roleVerified: false`, con la
  classe accanto): mai scartato in silenzio — sarebbe inventare un silenzio —
  mai promosso.
- **Una citazione non trasferisce il ruolo.** Le parole dentro una citazione
  producono segnali, perché sono state dette, ma con `voice: "citazione"`,
  `roleInherited: false` e classe di ruolo `non_verificabile`: il ruolo
  verificato di chi cita **non copre** ciò che ha detto un altro.

### L'ordine dei post si verifica, non si assume

`RIVISTO` e `SMENTITA_DICHIARATA` sono affermazioni **sul tempo**: se «più
recente» venisse dall'ordine di un array — che è una scelta di chi lo costruisce,
non una misura — sarebbero fabbricate. Quindi `verifyPostOrder` guarda che cosa i
post portano davvero addosso:

1. **indice di pagina** (`pageOffset` + `positionInPage`, quando ogni post li ha):
   base **primaria**, perché è la struttura osservata e non dipende da nessun fuso;
2. **istante dichiarato**: usato solo se **ogni** post ha una data in forma
   canonica, tutte con lo **stesso** scostamento e la stessa larghezza — a quella
   condizione il confronto lessicografico è un confronto cronologico corretto, e
   non serve nessun orologio. Scostamenti diversi **non si normalizzano**: il fuso
   di questo perimetro non è mai stato verificato (§"Che cosa NON è stato
   osservato", 7), e normalizzarlo sarebbe inventarlo;
3. **niente di confrontabile**: l'ordine non è verificabile.

Quando ci sono entrambe, la seconda **controlla** la prima. Due osservazioni
indipendenti che si contraddicono non si mediano e non si scelgono:

- ordine **non monotono** — istanti in contrasto con le pagine, o post consegnati
  fuori sequenza → **si rifiuta**, `ORDINE_NON_MONOTONO`, fail-closed: nessun
  segnale, nessuna relazione, il motivo scritto;
- ordine **non verificabile** → i segnali **escono lo stesso**, perché sono stati
  detti, ma `RIVISTO` e `SMENTITA_DICHIARATA` **non vengono prodotte**; le coppie
  lasciate senza relazione temporale sono contate in `pairsWithoutOrder`, non
  nascoste. `OPPOSTI` resta, perché «dato titolare» e «dato fuori» non possono
  valere insieme a prescindere da quale sia venuto prima;
- **dentro un post** l'ordine è quello del testo, e quello si vede sempre.

Per la stessa ragione i due lati di una contraddizione si chiamano `first` e
`second`, non «prima» e «dopo»: `first` precede `second` solo quando `span` è
`STESSO_POST` o `POST_SUCCESSIVO`, e `temporal` lo dice.

### Il lessico è un ingresso, non una costante

Le parole con cui una fonte dice «titolare», «in dubbio», «fuori», «smentito»
sono **la forma di quella fonte**: un elenco di parole nel sorgente sarebbe una
descrizione della fonte pubblicata nel core — la stessa ragione per cui la
tabella delle chiavi di un'altra fonte è già stata spostata fuori dal parser che
la usa. Anche i **nomi dei giocatori** arrivano da fuori, per la stessa ragione
per cui arriva da fuori la tabella di alias delle squadre.

Non c'è nessun elenco di riserva, nessun valore per difetto, nessun tentativo
«alla cieca» su parole plausibili: **senza lessico il parser non tenta niente**
(`LESSICO_ASSENTE`, `LESSICO_INCOMPLETO`, con la famiglia mancante nominata). Le
fixture delle prove usano lettere greche, non parole di calcio: anche una prova
sta nel repository pubblico.

`runParser` legge i segnali quando riceve il lessico in `signalLexicon`, e non
altrimenti: senza, il blocco dei segnali del referto dichiara `LESSICO_ASSENTE`
senza guardare un carattere di testo. Il **referto** ne porta solo conteggi —
esiti, stati dell'ordine, tipi, forme, voci, soggetti, classi di ruolo, relazioni
di contraddizione — con le chiavi in ordine alfabetico e mai per valore, perché
un ordinamento per risultato è già una classifica; i **termini** che hanno
prodotto ogni segnale, che sono il lessico privato del chiamante, restano
nell'**estratto** insieme a nomi e testo.

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
