# C1 Hochschule – Prüfungstraining

Lern-App (PWA) zur Vorbereitung auf **telc Deutsch C1 Hochschule** am 12.12.2026. Läuft im Browser, auf dem iPhone als
Home-Bildschirm-App, offline, mit optionalem Dropbox-Sync und optionalem KI-Feedback (Claude). Kein Build-Schritt, kein Backend.

## Ordner

```
index.html, manifest.webmanifest, sw.js     App-Hülle, PWA, Offline-Cache (CACHE_VERSION bei Änderungen erhöhen!)
css/app.css                                  Styles (Dark Mode folgt dem System)
js/                                          ES-Module (app.js = Router/Ansichten, session.js = Lernpfad/Tagessession, …)
  config.js                                  Dropbox-App-Key, Prüfungsdatum
data/                                        alle Inhalte als JSON (siehe docs/CONTENT_SPEC.md)
docs/PRUEFUNGSFORMAT.md                      Prüfungsformat mit Quellen
docs/PLAN.md                                 Entscheidungen, Lernpfad, Grenzen
docs/THEMEN.md, docs/QUELLEN.md              Themenkatalog, Audioquellen
scripts/validate.mjs                         prüft alle Inhalte (node scripts/validate.mjs)
scripts/serve.mjs                            lokaler Testserver (node scripts/serve.mjs → http://localhost:8765)
scripts/build-lernpfad.mjs, make-icons.mjs   erzeugen data/lernpfad.json bzw. die Icons
```

## 1. Lokal testen

```bash
node scripts/serve.mjs
```

Dann http://localhost:8765 öffnen. (Node 18+ genügt, keine Pakete nötig.)

## 2. Veröffentlichen (GitHub Pages)

1. Neues Repository auf GitHub anlegen (z. B. `c1-hochschule`), diesen Ordner hochladen/pushen.
2. Repository → **Settings → Pages** → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
3. Nach ca. 1 Minute ist die App unter `https://DEIN-NAME.github.io/c1-hochschule/` erreichbar.
4. Bei jedem Update: in `sw.js` `CACHE_VERSION` erhöhen (z. B. `v2`), dann pushen. Die App zeigt „Neue Version verfügbar“.

Wichtig ist nur **HTTPS** (Service Worker, Mikrofon, Dropbox).

## 3. Auf dem iPhone installieren

1. Die URL in **Safari** öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“** → Hinzufügen.
3. App vom Home-Bildschirm starten. Nach dem ersten Öffnen läuft sie auch offline.
4. **Bessere Stimmen fürs Hören:** Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch → z. B.
   „Anna (Erweitert)“, „Helena“, „Martin“ laden. Danach in der App unter **Mehr → Vorlesen** Stimme A/B/C wählen.
5. **Diktat:** Einstellungen → Allgemein → Tastatur → „Diktierfunktion aktivieren“; Tastatur-Sprache Deutsch hinzufügen.
   In Sprechübungen ins Textfeld tippen und auf das 🎤 der Tastatur tippen.

### Checkliste iPhone-Test
- [ ] Installation auf dem Home-Bildschirm, Icon sichtbar
- [ ] Flugmodus an → App startet und Übungen laufen (außer KI/Dropbox)
- [ ] Hören: Stimmen klingen deutsch, Sprecherwechsel hörbar, Tempo 0,8×/1,15× wirkt
- [ ] Sprechen: Diktat ins Textfeld funktioniert; „Aufnehmen“ fragt nach Mikrofon und spielt ab
- [ ] KI-Test unter Mehr → KI-Feedback → „Testen“
- [ ] Dropbox verbinden (Home-Bildschirm-App: „Per Code“) und „Jetzt abgleichen“

## 4. KI-Feedback einrichten (optional)

Ohne Key ist die App voll nutzbar (Musterlösungen, Checklisten, Selbsteinschätzung). Mit Key bewertet Claude Texte nach den
telc-Kriterien, markiert Fehler, schreibt eine verbesserte Version, stellt Anschlussfragen und diskutiert in Teil 2.

1. Auf https://platform.claude.com ein Konto anlegen, Zahlungsmittel hinterlegen, **Guthaben aufladen** (z. B. 10 $).
2. **Wichtig:** Unter *Settings → Spend limits* (platform.claude.com/settings/spend-limits) ein **monatliches Ausgabenlimit**
   setzen (z. B. 15 $).
3. Unter *API Keys* einen Key erstellen (eigener Workspace „C1-App“ empfohlen) und kopieren.
4. In der App: **Mehr → KI-Feedback → API-Key** einfügen → Speichern → „Testen“.

Der Key wird nur auf diesem Gerät gespeichert (IndexedDB) und **nicht** mit Dropbox synchronisiert. Da die App direkt aus dem
Browser aufruft, könnte jemand mit Zugriff auf das entsperrte Handy den Key auslesen – deshalb das Ausgabenlimit in der Console.

### Kosten (Stand 11/2026)

| Modell | Preis (Input/Output pro 1 Mio. Tokens) | Textbewertung | Diskussion (5 Runden + Feedback) |
|---|---|---|---|
| Claude Opus 5.5 | 4 $ / 20 $ | ca. 0,05–0,12 $ | ca. 0,05–0,10 $ |
| Claude Sonnet 5.5 (Standard) | 2 $ / 10 $ | ca. 0,03–0,06 $ | ca. 0,03–0,05 $ |
| Claude Haiku 5.5 | 0,10 $ / 0,50 $ | < 0,01 $ | < 0,01 $ |

Realistisch für 30 Tage mit Sonnet 5.5 (ca. 15 Texte, 15 Sprechübungen, Satzprüfungen): **etwa 2–4 $ insgesamt** (mit Opus 5.5 etwa das Doppelte).
Die App zählt die Kosten pro Tag mit und stoppt beim **Tageslimit** (Standard 1 $, einstellbar).

## 5. Dropbox-Sync einrichten (optional)

Die App speichert `c1-lernstand.json` (Lernstand, Fehlerprotokoll, Texte) im
App-Ordner `Dropbox/Apps/<App-Name>/`. Nur ein App-Key ist nötig (OAuth 2 mit PKCE, kein Secret).

1. https://www.dropbox.com/developers/apps → **Create app** → „Scoped access“ → **„App folder“** → Name z. B. `C1 Hochschule`.
2. Reiter **Permissions:** `files.content.write` und `files.content.read` anhaken → Submit.
3. Reiter **Settings:** App key kopieren. Unter **Redirect URIs** eintragen:
   - `https://DEIN-NAME.github.io/c1-hochschule/index.html`
   - `http://localhost:8765/index.html`
   „Allow public clients (Implicit Grant & PKCE)“ → **Allow**.
4. Key in `js/config.js` eintragen (`DROPBOX_APP_KEY: "…"`), `CACHE_VERSION` in `sw.js` erhöhen, pushen.
5. In der App: **Mehr → Sicherung & Sync → Mit Dropbox verbinden.** In der Home-Bildschirm-App „Per Code“ nutzen
   (Safari und Home-Bildschirm-App haben getrennte Speicher).

Ohne Dropbox: **Mehr → Export (Datei)** sichert den Lernstand manuell; **Import** führt ihn wieder zusammen.

## 6. Inhalte pflegen

- Format: `docs/CONTENT_SPEC.md`. Nach jeder Änderung: `node scripts/validate.mjs`.
- IDs nie umnummerieren (Lernstand hängt daran). Neue Items hinten anhängen.
- Items mit `"pruefung": 1/2/3` sind für die Generalproben reserviert und erscheinen nicht im normalen Üben.

## 7. Natürliche Stimmen für die Hörtexte (Azure, einmalig)

Die App spielt für jeden Hörtext eine MP3 ab, wenn es eine gibt (`data/audio/<id>.mp3`), sonst liest die iPhone-Stimme vor.
Die MP3s werden **einmalig** mit Azure-Neuralstimmen erzeugt (ca. 205.000 Zeichen – im kostenlosen Tarif F0 sind
500.000 Zeichen pro Monat frei).

1. Azure-Konto anlegen (https://azure.microsoft.com/de-de/free), im Portal eine Ressource **Speech-Dienste** mit Tarif
   **Free F0** und Region z. B. **West Europe** erstellen. Unter „Schlüssel und Endpunkt“ **Schlüssel 1** und **Region** notieren.
2. Auf dem PC die Datei `%USERPROFILE%\.c1-azure.env` anlegen (also `C:\Users\<Name>\.c1-azure.env`, **nicht** im Projektordner):
   ```
   KEY=dein-schluessel
   REGION=westeurope
   ```
3. Testen und erzeugen:
   ```bash
   node scripts/tts-azure.mjs --dry-run
   node scripts/tts-azure.mjs --test
   node scripts/tts-azure.mjs
   ```
   Danach `CACHE_VERSION` in `sw.js` erhöhen, committen, pushen.

Der Schlüssel landet nie im Repository. Neue Hörtexte später: einfach das Skript erneut ausführen (vorhandene MP3s werden übersprungen).

## 8. Sprechtraining „🎤 Heute sprechen“ (ab v0.8)

Konzept und Gutachten: `docs/SPRECHEN_KONZEPT.md`. Täglich ca. 20 Min. direkt nach dem Aufwärmen (nicht an Test-Tagen), auch als Karte auf der Startseite:
- bis 25.11.: Kernsätze nachsprechen (mit Aussprache-Schätzung) + Präsentation Abschnitt für Abschnitt (Gerüst aus den Leitpunkten, 3-Zeilen-Feedback, „Nochmal – besser!“)
- 26.11.–2.12.: ganze Präsentation (10 Min. Vorbereitung) mit 1B in beiden Rollen ↔ Diskussion mit 6-Min.-Uhr
- ab 3.12.: kompletter Durchlauf (ca. 50 Min.) ↔ Kernsätze + Diskussion

**Spracherkennung (empfohlen):** Mehr → „Spracherkennung & Stimmen (Azure)“ → Schlüssel 1 und Region der Azure-Speech-Ressource eintragen (dieselbe Ressource wie in Abschnitt 7). Dann wird jede Aufnahme automatisch in Text umgewandelt (Kurzaudio-REST, im Gratis-Tarif 5 Std./Monat), und die Gesprächspartnerin spricht mit Neural-Stimme. Der Schlüssel bleibt nur auf dem Gerät. Ohne Schlüssel: Diktat über die Tastatur.

Audios für Kernsätze und Kurzvorträge: `node scripts/tts-sprechen.mjs` (einmalig, überspringt vorhandene).
