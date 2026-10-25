# Prüfbericht Bewertungslogik V3

## Gegenüberstellung

- V2: 0–100-Komfortindex mit pauschalen Schwellen und fünf Komfortfaktoren.
- V3: additive Stundenpunkte nach Nähe, Tageslicht, Temperatur, Luftfeuchte, Beaufort-Wind und Wetterzustand. Relative Markierung statt pauschaler „gut/schlecht“-Aussage.
- V3 trennt Stundenbewertung (`scoreHour`/`scoreForecast`) von Auswahl (`selectRecommendations`).

## Methodik

Die Punktelogik orientiert sich an der öffentlich beschriebenen Methodik von `laufwetter.de/wie_und_warum/` (Abruf zur Analyse, keine Laufzeitabfrage). Wetterdaten bleiben Home Assistant. HA-Zustände werden explizit zugeordnet: `sunny`/`clear` Sonne, `rainy`/`pouring` Regen, `snowy` Schnee, `snowy-rainy` gefrierender Niederschlag, `lightning`/`lightning-rainy` Gewitter, `cloudy`/`partlycloudy` Wolke, `fog`, `hail`, `windy` und `exceptional`. Unbekannte Zustände erhalten keine erfundene Wetterklasse.

Die Beaufort-Zuordnung ist projektspezifisch dokumentiert: 0–<1, <6, <12, <20, <29, <39, <50, <62, <75, <89, <103, <118, ≥118 km/h für Bft 0–12. Mittelwind bestimmt Beaufort; Böen lösen separat Warnrisiken ab 45/65 km/h aus.

## Auswahl

Für mindestens 9,5 Tage und fünf Kalendertage wird die höchste ganzzahlige Schwelle von -10 bis +20 gesucht, bei der mindestens 25 Stunden an mindestens fünf Tagen markiert sind. Kürzere Horizonte verwenden den verfügbaren Zeitraum und markieren die punktbesten Stunden; die UI nennt diesen Modus. Risiken werden sichtbar und nicht durch relative Punkte neutralisiert.

## Prüfung

- `npm test`: 11/11 bestanden.
- `npm run build`: erfolgreich, HACS-Datei `dist/ha-laufwetter-card.js`.
- `node --check dist/ha-laufwetter-card.js`: erfolgreich.
- Tests decken Formeln, Tageslicht, Wind/Böen, Regenmenge vs. Wahrscheinlichkeit, Zustände, Risiken, 10-Tage-/Kurzzeitauswahl, Sortierung, Einheiten und getrennte Berechnungsschritte ab.
- Keine laufende Home-Assistant-Instanz verfügbar: echte Browserdarstellung, lokale HA-Zeitzone, DST, WebSocket-Reconnect und konkrete Warnentitäten bleiben runtime-unverifiziert.

## Skills

- Caveman: installiert, gelesen und verwendet.
- Ponytail: nicht installiert/auffindbar; nicht verwendet. Keine Ausführung behauptet.
