# Konzept: Sprechen besser üben (telc C1 Hochschule, mündlicher Teil) – Version 2

Stand 18.11.2026 · Prüfung 12.12. · Lernerin: Lehrkraft (Biologie) mit ausländischem Abschluss, B2/C1.
Version 1 wurde unabhängig begutachtet (Note 2,4). Alle Kritikpunkte sind hier eingearbeitet (siehe Abschnitt 7).

## 1. Ausgangslage

**Prüfungsformat (docs/PRUEFUNGSFORMAT.md, Kap. 4):** Paarprüfung ca. 16 Min. · 20 Min. Vorbereitung (nur 1A, 1 von 2 Themen, Notizen ja,
Ablesen nein) · **1A** Präsentation ca. 3–4 Min. · **1B** Partner/in fasst zusammen + stellt mind. eine Anschlussfrage, Vortragende/r
antwortet (beide Rollen!) · **Teil 2** Diskussion ca. 6 Min. zu einem Zitat mit Leitpunkten. Bewertung: Aufgabengerechtheit (1A 6, 1B 4,
Teil 2 6) + Flüssigkeit, Repertoire, Grammatik, Aussprache/Intonation je 8 → 48; **mündlich ≥ 29 Pflicht**.

**Daten der Lernerin:** Erster Sprechversuch: 36 Min. für 1A, Selbst-Checkliste 0/10, kein KI-Feedback (nichts diktiert). Frage an Tarsi
während der Vorbereitung: wie man Einleitung/Gliederung baut.

**Ursachen:** zu großer Schritt ohne Gerüst; Sprechen über Tastatur-Diktat umständlich → kein Text → kein Feedback; kein hörbares Vorbild;
Feedback lang und spät; zu wenig Sprechzeit; 1B nur halb geübt; Teil 2 ohne Struktur; keine Strategien für Lücken/Zeit gewinnen.

## 2. Technik zuerst: „Aufnehmen, dann umwandeln“ (getestet)

- **Immer zuerst aufnehmen** (MediaRecorder; läuft auf iPhone/iPad zuverlässig). Die Aufnahme ist sofort anhörbar – das Üben hängt nie an
  der Erkennung.
- **Danach Text erkennen** über **Azure-Spracherkennung (Kurzaudio-REST, de-DE)**: Aufnahme im Browser per Web Audio dekodieren, auf
  16 kHz mono PCM umrechnen, als WAV senden; längere Aufnahmen in Stücke ≤ 50 s teilen und nacheinander erkennen.
  **Getestet am 18.11.:** CORS für Browser-Anfragen erlaubt (`Access-Control-Allow-Origin: *`), deutscher Testsatz in < 2 s fast
  fehlerfrei erkannt, **Aussprache-Bewertung** (Pronunciation Assessment) liefert Gesamtwert und Werte pro Wort.
- **Aussprache-Hinweis (vorsichtig):** Gesamtwert grob einordnen und max. 3 „Wörter zum Üben“ (Wortwert sehr niedrig) mit Vorbild-Audio
  zum Nachsprechen. Ehrlich kennzeichnen: Software-Schätzung, kein telc-Urteil.
- Schlüssel: Azure-Speech-Schlüssel (F0, kostenlos: 5 Std. Spracherkennung/Monat) wird – wie der Claude-Key – nur lokal auf dem Gerät
  gespeichert (Mehr → Sprechen). **Rückfall ohne Azure-Key:** Diktat-Feld + Aufnahme (wie heute).
- KI-Feedback mit Claude auf Basis des erkannten Textes; Erkennungsfehler werden nicht als Grammatikfehler gewertet und nicht ins
  Fehlerprotokoll übernommen.

## 3. Ein Knopf: „🎤 Heute sprechen (20 Min.)“ – am Anfang jeder Tagessession

Statt vieler Stufen-Menüs gibt es einen geführten Knopf auf der Startseite und als **ersten Schritt** jeder Tagessession (nach dem kurzen
Wortschatz-Aufwärmen). Er wählt die passende Übung nach **Wochenplan + Fortschritt** (Freigabe-Kriterium: Übung 2× mit „gut“ abgeschlossen):

| Zeitraum | Inhalt (je 20–30 Min.) |
|---|---|
| **bis 25.11.** | A Kernsätze nachsprechen (5 Min.) · B Gerüst füllen · C Abschnitt für Abschnitt sprechen (1 Min. je Teil) · Kennenlernen |
| **26.11.–2.12.** | D ganze Präsentation mit 10 Min. Vorbereitung + 1B (beide Rollen) · E Diskussion mit Mini-Schablone |
| **ab 3.12.** | F komplette Durchläufe mit 20 Min. Vorbereitung (1A → 1B → Teil 2), dazu 2–3 Probeläufe mit einem Menschen |

**Dieselben 4–6 Themen wiederholen:** Die Lernerin wählt anfangs 5 Präsentationsthemen („Meine Themen“); jedes wird mehrmals gesprochen
(2. und 3. Durchgang = Flüssigkeit). Dazu „Bausteine aus meinem Leben“ (eigener Beruf, Herkunftsland, Anerkennung des Abschlusses), die zu vielen
Themen passen.

## 4. Die Übungen

**A – Kernsätze nachsprechen (Shadowing)**
~25 Kernsätze als natürliche Audios (Azure, vorab erzeugt): Einleitung/Gliederung, Überleitung, Beispiel, Meinung, Schluss (1A);
Zusammenfassen + Nachfragen + Antworten (1B); Zustimmen, Widersprechen, Nachfragen, Kompromiss, Zitat deuten (Teil 2); **Zeit gewinnen &
Umschreiben** („Wie soll ich sagen …“, „eine Art …“, „Lassen Sie mich kurz überlegen …“). Ablauf: anhören → nachsprechen (Aufnahme) →
Vorbild und eigene Aufnahme direkt nacheinander hören. Plus Abschnitte aus gekürzten Mustervorträgen (Satzmelodie).

**B – Gerüst füllen (Präsentation, aus den Leitpunkten des Blatts)**
Generische Schablone, die sich **aus den Leitpunkten des jeweiligen Aufgabenblatts** füllt: ① Einleitung + Gliederung (≈ 20 s) → ② je
Leitpunkt ≈ 40 s (Anzahl = Leitpunkte des Blatts) → ③ Schluss + Dank (≈ 20 s). Je Teil max. 5 Stichworte + Satzanfänge zum Antippen
(nur zum Vorlesen/Anzeigen, nicht einfügen). Vorbereitungstechnik als Karte: 1 Min. Thema mit persönlichem Bezug wählen → 10 Min.
Stichworte nach Schablone → 5 Min. leise durchsprechen.

**C – Abschnitt für Abschnitt sprechen (Kern des Konzepts)**
Ein Teil des Gerüsts (z. B. nur die Einleitung) mit Zeitbalken (Ziel-Sekunden) → Aufnahme → Erkennung → **Feedback in 3 Zeilen**
(✓ Das war gut · → EINE Sache als Nächstes, zuerst Struktur/Flüssigkeit, höchstens ein Grammatikpunkt · ✨ ein besserer Satz zum
Nachsprechen, mit Audio der Systemstimme) → **„Nochmal – besser!“** → beide Aufnahmen nebeneinander anhören + ein KI-Satz zum Fortschritt.

**D – Ganze Präsentation + 1B in beiden Rollen**
Präsentation mit dem Gerüst als Spickzettel, Zeitbalken mit Abschnitts-Markern, Vorbereitung 5/10/20 Min. wählbar.
1B **Rolle „Vortragende“**: Partnerin fasst zusammen + fragt; Antwort 30–90 s mit Mini-Schablone „Danke für die Frage → direkte Antwort
→ Begründung/Beispiel → Rückbezug“.
1B **Rolle „Zuhörende“**: einen **gekürzten Mustervortrag (≈ 320 Wörter, Azure-Audio)** anhören, Stichworte notieren, dann 45 s
zusammenfassen („Sie haben über … gesprochen. Besonders interessant fand ich …“) und eine Anschlussfrage stellen.

**E – Diskussion mit Mini-Schablone (Teil 2)**
Pro eigenem Beitrag: „Ich verstehe das Zitat so, dass …“ (beim ersten Beitrag) → Position → Grund + Beispiel → Rückfrage an die Partnerin;
Ziel 3–5 Sätze pro Beitrag. KI-Partnerin antwortet in 2–3 Sätzen und spielt den Ball zurück. **Zeitbalken 6 Min.**; Redemittel-Leiste
sichtbar (antippen = vorlesen). Ob Interaktionsziele (nachfragen, widersprechen, zustimmen, Kompromiss, alle Leitpunkte) erreicht wurden,
beurteilt die KI im Feedback (keine automatischen Häkchen).

**Kennenlernen (60 s)** einmal vorbereiten und 2–3× sprechen – nimmt Nervosität (vermutlich nicht bewertet).

## 5. Feedback & Motivation

- Kurz-Feedback (3 Zeilen) bei jeder Übung; ausführliches telc-Feedback nur bei D/E/F, dort Punkte als **Spanne** („ca. 26–30 von 48“).
- Fortschritt sichtbar: zwei Aufnahmen im Vergleich; Wochenplan-Leiste „Sprechen: A ✓ B ✓ C …“.
- Ton: zuerst Stärken, dann genau EIN nächster Schritt.

## 6. Umsetzung (Reihenfolge)

1. Aufnahme→Erkennung (Azure) + Kurz-Feedback + „Nochmal“ (Übung C) – höchster Nutzen.
2. Gerüst aus Leitpunkten (B), „Heute sprechen“ mit Wochenplan, als erster Schritt der Tagessession (für Tage, die noch nicht begonnen sind).
3. 1B beide Rollen (D), Teil-2-Mini-Schablone + 6-Min.-Balken (E).
4. Audios (Azure, im Gratis-Kontingent): ~25 Kernsätze + 16 gekürzte Mustervorträge (≈ 320 Wörter).
5. Aussprache-Hinweise (Pronunciation Assessment) im Feedback von C.

**Weggelassen:** Abzeichen, automatische Interaktions-Häkchen, Live-Azure-Stimme für die Partnerin (stattdessen Tipp: Premium-Stimme in
iOS laden), Audios der 15 Beispieldialoge, Zahlenvergleich Versuch 1 ↔ 2.

## 7. Umgang mit dem Gutachten zu Version 1 (Note 2,4)

| Kritik | Lösung in Version 2 |
|---|---|
| Spracherkennung im iOS-Browser unzuverlässig | Aufnahme zuerst; Erkennung über Azure-REST (getestet: CORS ok, Erkennung ok); Diktat als Rückfall |
| 1B nur Antworten | 1B in beiden Rollen (zuhören, zusammenfassen, fragen) mit gekürzten Musteraudios |
| Starre Schablone passt nicht zu Leitpunkten | Schablone füllt sich aus den Leitpunkten des Blatts |
| Zu wenig Sprechzeit, Ende der Session | 20–30 Min. täglich als erster Schritt, Wochenplan mit Freigabe |
| Strategien fehlen | Zeit gewinnen/Umschreiben, Vorbereitungstechnik, Kennenlernen |
| Teil 2 ohne Struktur, 5 Runden ≠ 6 Min. | Mini-Schablone pro Beitrag, 6-Min.-Zeitbalken |
| Antippen fügt Redemittel ein / Häkchen fehleranfällig | Antippen = nur vorlesen; KI beurteilt Interaktion |
| Mustervorträge zu lang | gekürzte 320-Wörter-Fassungen nach Schablone |
| Flüssigkeit vs. Korrektheit, Scheingenauigkeit | Struktur/Flüssigkeit zuerst, max. 1 Grammatikpunkt; Punkte als Spanne; Erkennungsfehler nicht ins Fehlerprotokoll |
| Überforderung durch Oberfläche | ein geführter Knopf „Heute sprechen“ |
| Menschlicher Partner | 2–3 reale Probeläufe ab 3.12. empfohlen (Tandem/Kurs) – jetzt einplanen |
