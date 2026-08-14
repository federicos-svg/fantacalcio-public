# CLAUDE.md — public core

Questo repository è il core pubblico sanitizzato del progetto. Regole:

- Solo fixture sintetiche: mai dati reali di giocatori/quotazioni, mai
  credenziali, mai identificatori privati (Drive, Cloudflare, n8n).
- Nessun codice di acquisizione dati: parser e contratti sì, I/O verso
  fonti esterne no. Se un cambiamento richiede il layer privato, si ferma
  qui e si implementa nel repository privato.
- Gate locale prima di ogni push: `npm run verify`.
- Workflow: branch -> Draft PR -> CI verde -> review -> merge.
- Il publication security gate (`scripts/publication-gate.mjs`) è parte della CI (job `guards`).
- Ogni PR lo passa prima del merge; gira anche in locale via `npm run publication-gate`.
- I suoi fingerprint (`scripts/publication-gate.fingerprints.json`) sono hash sha256 di identificatori privati: i valori in chiaro vivono solo nel repo privato.
