# Inhaltsformat (verbindlich)

Alle Inhalte liegen als UTF-8-JSON unter `data/`. Die App ist nur ein „Player“ dieser Dateien.
`node scripts/validate.mjs` prüft Schema, IDs, Eindeutigkeit und Mengen.

## Allgemeine Regeln

- **Sprache:** ausschließlich Deutsch, Niveau C1 (Hochschulkontext). Erklärungen für die Lernerin aber
  **einfach und klar** (B2-Wortschatz, kurze Sätze), damit Bedeutungen über Synonyme, Umschreibungen und
  Beispiele erschlossen werden können. Keine Übersetzungen ins Englische.
- **Urheberrecht:** Alles selbst geschrieben. Keine Sätze/Texte/Aufgaben aus telc-, Klett-, Hueber-,
  Cornelsen- oder anderen Materialien übernehmen oder eng paraphrasieren.
- **Eindeutigkeit:** Jede Aufgabe hat genau eine richtige Lösung. Distraktoren sind plausibel
  (gleiche Wortart, ähnliche Bedeutung/Form), aber eindeutig falsch – grammatisch oder inhaltlich.
  Jede Aufgabe nach dem Schreiben **einmal selbst prüfen**: Stimmt die Lösung? Ist keine zweite Option
  auch richtig? Ist die Begründung korrekt?
- **Bezug zur Lernerin:** Lehrkraft (Biologie, Sek. I/II) mit ausländischem Abschluss, lebt in NRW,
  lässt ihren Lehramtsabschluss anerkennen. Etwa **ein Drittel** der Beispiele/Texte hat einen
  Bezug dazu (Schule, Biologie, Lehramt, Anerkennung, Leben in Deutschland, Philippinen) –
  Feld `"bezug": true`. Der Rest sind neutrale Hochschul- und Gesellschaftsthemen.
- **Rechtschreibung:** neue deutsche Rechtschreibung, „ß“ korrekt, typografische Anführungszeichen „…“
  in Texten sind erlaubt (im JSON einfach als Zeichen).
- **IDs** sind stabil (werden für Lernstand/Spaced Repetition gespeichert) – nie umnummerieren.

## Themen-Slugs (Feld `thema`)

`ki_digitalisierung`, `klima_nachhaltigkeit`, `gleichberechtigung_diversitaet`, `bildung_hochschule`,
`migration_interkulturalitaet`, `gesundheit`, `arbeitswelt`, `wissenschaft_ethik`, `mobilitaet`,
`wirtschaft`, `medien_desinformation`, `demografie`, `biotechnologie`, `wohnen_stadt`,
`allgemein_akademisch`

## Register (Feld `register`)

`schriftlich` (formell, für Schreiben/Lesen typisch) · `neutral` · `muendlich` (Gespräch/Diskussion)

---

## data/wortschatz_*.json — Akademischer Wortschatz

Array von Objekten:

```json
{
  "id": "w0001",
  "wort": "die Nachhaltigkeit",
  "wortart": "Nomen",
  "formen": "nur Singular",
  "thema": "klima_nachhaltigkeit",
  "register": "schriftlich",
  "erklaerung": "Man verbraucht nur so viele Ressourcen, wie wieder nachwachsen können.",
  "synonyme": ["die Zukunftsfähigkeit"],
  "antonyme": ["die Verschwendung"],
  "wortfamilie": ["nachhaltig", "nachhalten"],
  "kollokationen": ["Nachhaltigkeit fördern", "unter dem Aspekt der Nachhaltigkeit"],
  "beispiel": "Viele Hochschulen haben inzwischen eine eigene Strategie für mehr Nachhaltigkeit.",
  "luecke": {
    "satz": "Der Bericht bewertet alle Projekte unter dem Gesichtspunkt der ___.",
    "loesung": "Nachhaltigkeit",
    "optionen": ["Nachhaltigkeit", "Nachfrage", "Nachwirkung", "Nachsicht"]
  },
  "bezug": false
}
```

- `wortart`: `Nomen` | `Verb` | `Adjektiv` | `Adverb` | `Konnektor` | `Präposition` | `Ausdruck`
- `wort`: Nomen **mit Artikel**; Verben im Infinitiv (bei fester Präposition: „sich auseinandersetzen mit + D“).
- `formen`: Nomen: Plural („die Studien“ / „nur Singular“); Verben: 3 Stammformen („erörtert, erörterte, hat erörtert“); sonst `""`.
- `synonyme`/`antonyme`/`wortfamilie`: je 0–3 Einträge, nur wenn wirklich passend (leeres Array erlaubt).
  Mindestens eines von `synonyme` oder `antonyme` sollte gefüllt sein.
- `luecke.loesung` steht exakt so in `optionen` (genau 4 Optionen, Lösung an beliebiger Position,
  in die Lücke passt **genau eine** Option grammatisch UND inhaltlich). `luecke.loesung` ist die im Satz
  benötigte Form (ggf. flektiert).
- Niveau: echte C1-/Hochschulwörter (z. B. „erörtern“, „die Tragweite“, „maßgeblich“, „infolgedessen“),
  keine Grundwortschatz-Wörter (nicht „das Haus“, „wichtig“).

## data/redewendungen.json — Idiome, feste Wendungen, Redemittel

```json
{
  "id": "r001",
  "ausdruck": "etwas auf den Punkt bringen",
  "typ": "idiom",
  "funktion": "zusammenfassen",
  "bedeutung": "das Wichtigste kurz und genau sagen",
  "beispiel": "Können Sie Ihre These noch einmal auf den Punkt bringen?",
  "register": "neutral",
  "pruefung": "beides",
  "luecke": {
    "satz": "Lassen Sie mich das kurz auf den ___ bringen: Die Studie ist nicht repräsentativ.",
    "loesung": "Punkt",
    "optionen": ["Punkt", "Kern", "Strich", "Grund"]
  },
  "situation": {
    "frage": "In welcher Situation passt der Ausdruck am besten?",
    "optionen": [
      "Sie fassen am Ende einer Diskussion Ihre Position in einem Satz zusammen.",
      "Sie bitten in der Mensa um mehr Soße.",
      "Sie beschreiben die Achsen einer Grafik."
    ],
    "loesung": 0
  },
  "hinweis": "",
  "bezug": false
}
```

- `typ`: `idiom` (bildhaft: „ins Gewicht fallen“, „auf der Hand liegen“) | `feste_wendung` (Nomen-Verb-Verbindungen,
  feste Kollokationen: „in Betracht ziehen“, „zur Verfügung stellen“) | `redemittel` (akademische Redemittel).
- `funktion` (für Redemittel Pflicht, sonst passend wählen): `einleiten`, `grafik_beschreiben`, `vergleichen`,
  `argumentieren`, `gegenargument`, `beispiel_geben`, `zustimmen`, `widersprechen`, `kompromiss`, `nachfragen`,
  `zeit_gewinnen`, `strukturieren`, `zusammenfassen`, `schluss`, `meinung`, `bewerten`, `hypothese`, `allgemein`.
- `pruefung`: `schreiben` (eher schriftlich-formell) | `sprechen` (eher mündlich) | `beides` | `vermeiden`
  (zu umgangssprachlich für die Prüfung – trotzdem verstehen).
- `luecke`: ein Schlüsselwort des Ausdrucks fehlt; genau 4 Optionen, genau eine richtig.
- `situation.loesung`: Index (0-basiert) der richtigen Option; 3 Optionen.
- `hinweis`: optional (z. B. „nicht: *auf den Punkt kommen* verwechseln“).

---

# Prüfungsaufgaben (exaktes telc-C1-Hochschule-Format, siehe docs/PRUEFUNGSFORMAT.md)

Gemeinsame Felder aller Prüfungsaufgaben:

- `id`, `titel` (intern/Übersicht), `thema` (Slug), `bezug` (bool)
- `pruefung`: `0` = Übungspool; `1`, `2`, `3` = reserviert für Probeprüfung 1/2/3 (taucht im normalen Üben nicht auf)
- `einstufung`: `true` nur bei dem einen Item, das der Einstufungstest verwendet (sonst weglassen)
- `niveau`: `"B2+"` (leichter Einstieg, Woche 1) | `"C1"` | `"C1+"` (anspruchsvoll, Woche 3–4)
- Erklärungen (`erklaerung`) immer: **warum die Lösung stimmt** (mit Bezug auf das Signal im Text) und – kurz – **warum der stärkste
  Distraktor falsch ist**. 1–3 einfache Sätze.

## Fehlerkategorien (Feld `kategorie`, auch fürs Fehlerprotokoll)

`konnektoren`, `praepositionen`, `rektion` (Verben/Nomen/Adjektive mit fester Präposition), `nomen_verb`,
`passiv`, `konjunktiv`, `partizip`, `relativsatz`, `nominalisierung`, `deklination` (Artikel/Adjektive/Nomen),
`pronomen` (inkl. Pronominaladverbien, Reflexiva), `wortstellung`, `verbformen` (Tempus, Modalverben, Stammformen),
`wortbildung`, `wortschatz`, `kollokation`, `rechtschreibung`

## data/sb_*.json — Sprachbausteine (22 Lücken, je 4 Optionen)

```json
{
  "id": "sb01", "titel": "Mensa-Umfrage", "thema": "bildung_hochschule", "bezug": false,
  "pruefung": 0, "niveau": "C1", "textsorte": "Artikel in der Hochschulzeitung",
  "text": "Seit dem Wintersemester {1} die Mensa ihr Angebot … {22} …",
  "luecken": [
    { "nr": 1, "optionen": ["hat", "ist", "wird", "wurde"], "loesung": 0,
      "typ": "grammatik", "kategorie": "verbformen",
      "erklaerung": "„erweitern“ bildet das Perfekt mit „haben“: „hat … erweitert“. „wird“ wäre Passiv, dann fehlte aber „worden“." }
  ]
}
```

- Text **320–350 Wörter** (ohne Optionen), allgemeinverständlicher (populär-)wissenschaftlicher oder studienbezogener Sachtext
  (Artikel, Infotext, offizielle E-Mail/Brief der Hochschule …). Lücken als `{1}` … `{22}` in Textreihenfolge.
- Genau **22 Lücken**; je **4 Optionen** à 1–4 Wörter; `loesung` = Index 0–3 (Positionen gut mischen).
- Verteilung pro Set: **12–16 grammatik**, **4–8 wortschatz**, **1–4 rechtschreibung** (Rechtschreib-Item = dasselbe Wort in
  4 Schreibweisen, z. B. „im Allgemeinen / im allgemeinen / in Allgemeinen / im Allgemeinem“).
- Prüfungsrelevante C1-Strukturen abdecken: Konnektoren (zweiteilige: je…desto, sowohl…als auch, weder…noch, zwar…aber;
  infolgedessen, demzufolge, wohingegen, sofern, indem, ohne dass …), Präpositionen mit Genitiv (aufgrund, angesichts, hinsichtlich,
  zwecks, ungeachtet …), Rektion (verzichten auf, abhängen von …), Nomen-Verb-Verbindungen, Passiv/Passiversatz (sich lassen,
  sein + zu, -bar), Partizipialattribute, Konjunktiv I/II, Relativpronomen (auch „dessen/deren/worauf“), Deklination,
  Pronominaladverbien (darauf, worüber), Wortstellung.
- Distraktoren: echte Wörter/Formen derselben Kategorie (z. B. 4 Konnektoren, 4 Präpositionen), genau eine grammatisch **und**
  inhaltlich korrekt.

## data/drills.json — Grammatik-Drills (kurz)

Multiple Choice:

```json
{ "id": "dr_konnektoren_01", "kategorie": "konnektoren", "niveau": "C1",
  "satz": "___ die Kosten gestiegen sind, wollen viele Studierende weiter in der Stadt wohnen.",
  "optionen": ["Obwohl", "Trotz", "Dennoch", "Weil"], "loesung": 0,
  "erklaerung": "Nebensatz mit Verb am Ende → Subjunktion „obwohl“. „Trotz“ ist eine Präposition (+ Genitiv), „dennoch“ ein Adverb." }
```

Umformung (Nominalisierung ↔ Verbalisierung, Passiv, Partizipialattribut, indirekte Rede):

```json
{ "id": "dr_nominalisierung_07", "kategorie": "nominalisierung", "niveau": "C1", "typ": "umformung",
  "aufgabe": "Formen Sie den Nebensatz in eine Präpositionalgruppe um.",
  "ausgang": "Weil die Zahl der Bewerbungen gestiegen ist, verlängert die Universität die Frist.",
  "vorgabe": "___ verlängert die Universität die Frist.",
  "loesung": "Wegen des Anstiegs der Bewerbungszahlen",
  "akzeptiert": ["Wegen der gestiegenen Zahl der Bewerbungen", "Aufgrund des Anstiegs der Bewerbungszahlen"],
  "erklaerung": "„weil“ → „wegen/aufgrund + Genitiv“; Verb „steigen“ → Nomen „der Anstieg“." }
```

- Bei `typ: "umformung"` alle gängigen korrekten Varianten in `akzeptiert` (die App vergleicht ohne Groß/Klein und Satzzeichen;
  bei Abweichung kann die Lernerin selbst bestätigen). Ohne `typ` = Multiple Choice mit 4 Optionen.

## data/grammatik.json — Kurzerklärungen je Kategorie

```json
{ "id": "konnektoren", "titel": "Konnektoren und Satzverbindungen",
  "kurz": "Markdown-Text, max. ca. 180 Wörter, einfach erklärt, mit **fett** für Signalwörter.",
  "tabelle": [["Bedeutung", "Subjunktion (Verb am Ende)", "Adverb (Position 1, dann Verb)", "Präposition"], ["Grund", "weil, da", "deshalb, daher", "wegen, aufgrund + G"]],
  "beispiele": ["…", "…"],
  "falle": "Typische Falle in den Sprachbausteinen: …" }
```

## data/lesen_*.json — Leseverstehen

**LV1** (`"teil": "lv1"`) – Text 400–500 Wörter mit 6 Satzlücken, 8 Sätze a–h (2 Distraktoren), Sätze je 9–16 Wörter:

```json
{ "id": "lv1_01", "teil": "lv1", "titel": "…", "thema": "…", "bezug": false, "pruefung": 0, "niveau": "C1",
  "quelle": "fiktiver Artikel, Wissenschaftsmagazin",
  "text": "Absatz 1 … [1] … \n\nAbsatz 2 … [2] …",
  "saetze": [{ "b": "a", "text": "…" }, { "b": "b", "text": "…" }],
  "loesungen": { "1": "c", "2": "f", "3": "a", "4": "h", "5": "b", "6": "e" },
  "erklaerungen": { "1": "„Diese Methode“ verweist auf …" },
  "distraktoren": { "d": "Klingt passend, aber …", "g": "…" } }
```
Distraktoren müssen thematisch passen, aber durch Kohäsion (Pronomen, Konnektor, Verweis) oder Inhalt an keiner Stelle passen.

**LV2** (`"teil": "lv2"`) – Text 650–850 Wörter in 5 Abschnitten a–e; 6 Aussagen „In welchem Abschnitt …“ (vor allem
Absicht/Sprechhandlung des Autors: warnt, kritisiert, empfiehlt, relativiert, gibt eine fremde Meinung wieder, prognostiziert,
bedauert …); ein Abschnitt darf mehrfach oder gar nicht vorkommen:

```json
{ "id": "lv2_01", "teil": "lv2", "titel": "…", "thema": "…", "bezug": false, "pruefung": 0, "niveau": "C1",
  "abschnitte": [{ "b": "a", "text": "…" }, { "b": "b", "text": "…" }, { "b": "c", "text": "…" }, { "b": "d", "text": "…" }, { "b": "e", "text": "…" }],
  "aussagen": [{ "nr": 1, "text": "In welchem Abschnitt warnt der Autor vor voreiligen Schlüssen?", "loesung": "c", "erklaerung": "…" }] }
```

**LV3** (`"teil": "lv3"`) – Text 1000–1200 Wörter (Absätze mit `\n\n`, **ohne** Überschrift); 11 Aussagen
richtig/falsch/nicht_im_text in Textreihenfolge, davon **genau 2** (ausnahmsweise 1 oder 3) „nicht_im_text“; plus Überschrift
aus 3 Optionen:

```json
{ "id": "lv3_01", "teil": "lv3", "titel": "…", "thema": "…", "bezug": false, "pruefung": 0, "niveau": "C1",
  "text": "…",
  "aussagen": [{ "nr": 1, "text": "…", "loesung": "richtig", "beleg": "kurzes Zitat der Textstelle (bei nicht_im_text: leer)", "erklaerung": "…" }],
  "ueberschrift": { "optionen": ["…", "…", "…"], "loesung": 1, "erklaerung": "…" } }
```
„falsch“ = Text widerspricht (auch wenn nur ein Teil der Aussage falsch ist); „nicht_im_text“ = Text widerspricht nicht, sagt es
aber so nicht.

## data/hoeren_*.json — Hörverstehen

Wird per Sprachausgabe vorgelesen, daher: gut sprechbar schreiben – keine Klammern, Abkürzungen, Sonderzeichen, Aufzählungszeichen;
Zahlen ausschreiben, wo die Aussprache sonst unklar ist (z. B. „zwanzig Prozent“, „im Jahr zweitausendzwanzig“); natürliche
gesprochene Sprache mit Füllwörtern („also“, „na ja“), gelegentlichen Selbstkorrekturen – aber C1-Niveau.
Sprecherrollen `sp`: `"A"`, `"B"`, `"C"` (bekommen in der App unterschiedliche Stimmen).

**HV1** (`"teil": "hv1"`) – 8 Personen je 100–140 Wörter zu einem Thema; 10 Aussagen a–j (8–16 Wörter, paraphrasieren
Meinung/Einstellung/Intention – nicht wörtlich), 2 bleiben übrig:

```json
{ "id": "hv1_01", "teil": "hv1", "titel": "…", "thema": "…", "bezug": false, "pruefung": 0, "niveau": "C1",
  "situation": "Sie hören Äußerungen von acht Studierenden zum Thema „…“.",
  "sprecher": [{ "nr": 1, "name": "Jonas, Lehramtsstudent", "sp": "B", "text": "…" }],
  "aussagen": [{ "b": "a", "text": "…" }],
  "loesungen": { "1": "d", "2": "a" },
  "erklaerungen": { "1": "Sie sagt „…“ – das entspricht d." } }
```

**HV2** (`"teil": "hv2"`) – Interview/Radiosendung mit 2–3 Sprechern, ca. 1100 Wörter; 10 Items: Satzanfang + 3 Fortsetzungen,
in Textreihenfolge:

```json
{ "id": "hv2_01", "teil": "hv2", "titel": "…", "thema": "…", "bezug": false, "pruefung": 0, "niveau": "C1",
  "situation": "Sie hören ein Interview aus der Sendung „Campus und Karriere“ mit …",
  "rollen": [{ "sp": "A", "name": "Moderatorin" }, { "sp": "B", "name": "Dr. Anna Krüger, Bildungsforscherin" }],
  "skript": [{ "sp": "A", "text": "…" }, { "sp": "B", "text": "…" }],
  "items": [{ "nr": 1, "stamm": "Frau Krüger untersucht vor allem, …", "optionen": ["…", "…", "…"], "loesung": 2, "erklaerung": "…" }] }
```

**HV3** (`"teil": "hv3"`) – Vortrag/Vorlesung ca. 1100–1300 Wörter, mit kurzem Rahmen (Sprecher C kündigt an); Handzettel mit
5–7 „Folien“ und genau 10 Lücken (Lösung 3–6 Wörter), Lücken in Textreihenfolge:

```json
{ "id": "hv3_01", "teil": "hv3", "titel": "…", "thema": "…", "bezug": false, "pruefung": 0, "niveau": "C1",
  "situation": "Sie hören einen Vortrag im Rahmen der Ringvorlesung „…“.",
  "rollen": [{ "sp": "C", "name": "Moderation" }, { "sp": "A", "name": "Prof. Dr. Martin Seidel" }],
  "skript": [{ "sp": "C", "text": "…" }, { "sp": "A", "text": "…" }],
  "folien": [
    { "titel": "1. Ausgangslage", "punkte": [
      { "text": "Anteil der Lehrkräfte über 55: ein Drittel" },
      { "luecke": 1, "loesung": "Mangel an Physiklehrkräften", "schluesselwoerter": [["mangel", "fehlen", "zu wenig"], ["physik"]], "erklaerung": "Er sagt: …" }
    ] }
  ] }
```
`schluesselwoerter`: Liste von Gruppen (kleingeschrieben); jede Gruppe enthält gleichwertige Wörter/Wortstämme. Alle Gruppen
getroffen = 2 Punkte, mindestens die Hälfte = 1 Punkt (wie telc: teilweise richtig). 1–3 Gruppen pro Lücke.

## data/schreiben.json — Schriftlicher Ausdruck (Erörterung/Stellungnahme, ≥ 350 Wörter, 70 Min.)

Im Prüfungsformat gibt es **keine Grafikbeschreibung**: Man wählt 1 von 2 Themen. Deshalb kommen die Aufgaben paarweise (`paar`).

```json
{ "id": "sa01", "paar": "P1", "thema": "ki_digitalisierung", "bezug": false, "pruefung": 0, "niveau": "C1",
  "textsorte": "Erörterung",
  "situation": "In einem Seminar zur Hochschuldidaktik sollen Sie eine Erörterung zu folgender Frage schreiben: …",
  "zitate": [{ "text": "…", "person": "Lisa M., Studentin der Informatik" }, { "text": "…", "person": "Prof. Dr. K. Brandt, Erziehungswissenschaftler" }],
  "anweisung": "Erarbeiten Sie Ihren eigenen Standpunkt zur Frage … und legen Sie ihn argumentativ dar. …",
  "ideen_pro": ["…"], "ideen_contra": ["…"],
  "gliederung": ["Einleitung: …", "Hauptteil 1: …", "Hauptteil 2: …", "Schluss: …"],
  "musterloesung": "Vollständiger Mustertext, 380–450 Wörter, C1, klar gegliedert (Absätze mit \n\n).",
  "checkliste": ["Beide Zitate aufgegriffen?", "…"] }
```
Input (Situation + Zitate + Anweisung) zusammen ca. 45–70 Wörter.

## data/sprechen.json — Mündlicher Ausdruck

```json
{
  "praesentation": [
    { "id": "mp01", "pruefung": 0, "themen": [
      { "titel": "…", "aufgabe": "Halten Sie einen Kurzvortrag (ca. 3–4 Minuten) zum Thema … Gehen Sie dabei auf folgende Punkte ein:",
        "leitpunkte": ["…", "…", "…"], "thema": "…", "bezug": false,
        "stichpunkte": ["Muster-Notizzettel, 8–12 Stichpunkte"],
        "muster": "Mustervortrag, ca. 400–450 Wörter, mündlicher Stil mit Redemitteln",
        "anschlussfragen": ["Frage 1", "Frage 2", "Frage 3"] },
      { "titel": "zweites Thema zur Auswahl", "…": "…" } ] }
  ],
  "diskussion": [
    { "id": "md01", "pruefung": 0, "thema": "…", "bezug": false,
      "zitat": "…", "person": "…",
      "leitpunkte": ["…", "…", "…"],
      "pro": ["…"], "contra": ["…"], "kompromiss": ["…"],
      "beispieldialog": [{ "sp": "A", "text": "…" }, { "sp": "B", "text": "…" }] }
  ]
}
```

## data/strategie.json — Strategiekarten

```json
{ "karten": [{ "id": "st_sb", "teil": "sb", "titel": "Sprachbausteine in 25 Minuten", "punkte": ["…"], "zeit": "25 Min.", "falle": "…" }],
  "pruefungstag": [{ "gruppe": "Am Vorabend", "punkte": ["…"] }] }
```
