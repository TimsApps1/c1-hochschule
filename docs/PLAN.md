# Plan & Entscheidungen – Lern-App „C1 Hochschule“

Stand: 12.11.2026 · Prüfung: 12.12.2026 · Lernerin: Lehrkraft mit ausländischem Abschluss (B2/C1, Schwächen: Sprachbausteine/Grammatik, Schreiben, Hören)

## Wichtige Korrekturen aus der Recherche (Phase 0)

Siehe `docs/PRUEFUNGSFORMAT.md` (mit Quellen, Unsicheres mit ⚠ markiert). Abweichungen vom vermuteten Stand:

1. **Im Schreiben gibt es keine Grafikbeschreibung.** Man wählt 1 von 2 Themen (Situation + zwei gegensätzliche Zitate)
   und schreibt eine Erörterung/Stellungnahme mit **mind. 350 Wörtern** in 70 Min. → Die App trainiert genau das.
   Die Grafikbeschreibung wurde **gestrichen** (wäre Zeitverschwendung). Redemittel zum Beschreiben von Grafiken gibt es
   trotzdem im Redewendungs-Modul (nützlich für Präsentation und Hören Teil 3).
2. **Sprachbausteine** = 1 Text, 22 Lücken, je 4 Optionen (Multiple Choice), keine freie Eingabe.
3. **Bestehen:** mind. **99/166** schriftlich **und** **29/48** mündlich **und** 128/214 gesamt. Keine Mindestpunktzahl für
   einzelne Teile (Lesen, Hören …).
4. **Mündlich 1B:** Die Partnerin fasst die Präsentation zusammen und stellt eine Anschlussfrage.
5. Jeder Hörtext läuft **nur einmal**; kein Wörterbuch.

## Technik-Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Stack | Vanilla JS (ES-Module), kein Build | wartbar, schnell, wie bei früheren Apps |
| Speicher | IndexedDB; append-only Versuchs-Log | XP, Streak, Statistik werden daraus berechnet → Sync konfliktfrei |
| Sync | Dropbox (PKCE, App-Ordner), eine Datei `c1-lernstand.json` | bewährtes PKCE-Muster ohne Server |
| Offline | Service Worker, Code network-first, Inhalte cache-first | |
| KI | Claude API direkt aus dem Browser (`anthropic-dangerous-direct-browser-access`), Structured Outputs (JSON-Schema) | zuverlässig parsebar |
| Modell | Standard **Claude Sonnet 5.5** (`claude-sonnet-5-5`, Wunsch des Nutzers), wählbar Opus 5.5 / Haiku 5.5 | sehr gute Bewertungsqualität zum halben Opus-Preis; Kosten pro Text ca. 0,03–0,06 $ |
| Kosten | Zähler pro Tag + Tageslimit (Standard 1 $) | |
| Ohne Key | Musterlösung + Checkliste + ehrliche Selbsteinschätzung nach telc-Kriterien | App voll nutzbar |
| TTS | Web Speech API, satzweise (iOS bricht lange Äußerungen ab), Rollen A/B/C → verschiedene Stimmen bzw. Tonhöhen | |
| Sprechen | Diktat ins Textfeld (iOS-Tastatur) + separate Aufnahme (MediaRecorder) | auf iOS klappt beides gleichzeitig oft nicht → zwei Knöpfe |
| Spaced Repetition | SM-2-Variante, max. Intervall 9 Tage | Bei 30 Tagen bringt FSRS keinen Vorteil; jedes Wort wird vor der Prüfung mehrmals wiederholt |
| Raw `fetch` statt SDK | Die App hat keinen Build-Schritt; nur ein Endpunkt | |

## Inhalte (vorab erzeugt, `data/*.json`, geprüft mit `node scripts/validate.mjs`)

| Inhalt | Menge | davon für Probeprüfungen reserviert |
|---|---|---|
| Sprachbausteine-Sets (22 Lücken) | 40 | 3 |
| Grammatik-Drills (13 Kategorien) | ~180 | – |
| Lesen Teil 1 / 2 / 3 | 10 / 10 / 10 | je 3 |
| Hören Teil 1 / 2 / 3 | 10 / 10 / 10 | je 3 |
| Wortschatz (C1/Hochschule) | 400 | – |
| Redewendungen (Idiome, feste Wendungen, Redemittel) | 160 | – |
| Schreibaufgaben (paarweise) | 16 | 6 (3 Paare) |
| Präsentationsblätter (je 2 Themen) / Diskussionen | 8 (16 Themen) / 15 | 3 / 3 |
| Strategiekarten + Checkliste Prüfungstag | ~13 | – |
| Echte Audios (nur verlinkt, geprüft 12.11.) | 45 | – |

Etwa ein Drittel der Inhalte hat Bezug zur Lernerin (Lehramt, Biologie, Anerkennung, Leben in Deutschland).
Alle Texte und Aufgaben sind selbst geschrieben; telc-Materialien dienten nur der Formatanalyse.

## Lernpfad (30 Tage, `scripts/build-lernpfad.mjs`)

- **Woche 1 (12.–18.11.):** Einstufungstest, Strategien je Teil, Grammatik-Grundpfeiler (Konnektoren, Präpositionen,
  Rektion, Passiv, NVV, Relativsätze), erster Text, erste Präsentation.
- **Woche 2 (19.–25.11.):** Konjunktiv, Nominalisierung, Partizipien …; Teilprüfungen unter Zeitdruck, Schreiben in 70 Min.,
  Teiltest Lesen+SB.
- **Woche 3 (26.11.–2.12.):** volle Teiltests, Diskussion mit KI-Partnerin, Schwachstellen („auto“-Schritte), Fehler-Marathon.
- **Woche 4 (3.–11.12.):** Generalprobe 1 (Sa 5.12.), Auswertung, Generalprobe 2 (Di 8.12. schriftlich / Mi 9.12. mündlich),
  zwei leichte Tage. Generalprobe 3 als Reserve.
- Jede Tagessession: Aufwärmen (8 Wörter + 5 Redewendungen) → Hauptblock → Fehlerwiederholung. Adaptiv: „auto“-Schritte und
  die Fehlerwiederholung gewichten die schwächsten Bereiche (Basisgewicht SB 1,45, Hören/Schreiben 1,35, Lesen/Sprechen 1,0;
  verstärkt, je weiter die Genauigkeit unter 80 % liegt).

## Ehrliche Grenzen

- **Aussprache** kann die KI aus Diktat-Text nicht bewerten → Aufnahme selbst anhören; Sprechen-Prognose ist eine Schätzung.
- **Diktat** verfälscht manchmal Wörter/Satzzeichen; die KI ist angewiesen, solche Fehler nicht als Grammatikfehler zu werten.
- **iOS-Stimmen** klingen weniger natürlich als echte Aufnahmen; deshalb zusätzlich echte Audios (Linkliste).
  Optional später: hochwertige TTS (z. B. vorab erzeugte MP3s mit einem Cloud-TTS) – Kosten grob 5–20 € einmalig für alle
  30 Hörtexte, aber mehr Speicher (~150 MB) und Hosting-Aufwand. Nur als Vorschlag.
- **KI-Bewertung** von Schreiben/Sprechen kann um eine Stufe von der echten telc-Bewertung abweichen.
- Generierte Inhalte sind sorgfältig geprüft (Skript + Selbstprüfung), aber nicht von einer Muttersprachlerin gegengelesen.
  Wenn die Lernerin eine Lösung für falsch hält: im Fehlerprotokoll steht die Begründung; fragwürdige Items bitte melden.

## Nächste Schritte

1. iPhone-Test (Homescreen, Offline, Diktat, Stimmen) – siehe README.
2. Hosting (GitHub Pages) + Dropbox-App anlegen.
3. Nach der ersten Woche: Schwierigkeit/Mengen anhand der Statistik nachjustieren; ggf. weitere SB-Sets für die häufigsten
   Fehlerkategorien erzeugen.
