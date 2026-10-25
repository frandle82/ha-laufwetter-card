# Laufwetter Card für Home Assistant

Eigenständige, minimalistische Dashboard-Karte zur Bewertung von Laufbedingungen. **Keine Verbindung zu laufwetter.de** und kein Scraping.

## Status
Frühe Entwicklungsversion (0.1.0). Die Bewertungslogik ist eine nachvollziehbare **Heuristik**, keine validierte sportmedizinische Empfehlung. Kein Gewitter- oder Glatteis-Frühwarnsystem.

## Einrichtung
```bash
npm install
npm run build
```
HACS installiert `dist/ha-laufwetter-card.js`. Bei manueller Installation diese Datei als JavaScript-Modul unter Dashboard-Ressourcen registrieren.

```yaml
type: custom:laufwetter-card
entity: weather.home
location: Schwerin
title: Laufwetter
duration: 60
refresh_minutes: 30
debug: false
# optional: warning_entity: binary_sensor.unwetterwarnung
```

Die gewählte `weather`-Entität muss eine stündliche Vorhersage für `weather.get_forecasts` anbieten. Verfügbare Messgrößen hängen vom Wetteranbieter ab. Die Karte rechnet die üblichen Temperatureinheiten °C/°F und Windgeschwindigkeit km/h, mph, m/s, kn um.

## Bewertungsmodell
Die additive Stundenbewertung folgt den veröffentlichten Regeln von [laufwetter.de](https://laufwetter.de/wie_und_warum/): zeitliche Nähe, Tageslicht, Temperatur, Luftfeuchte, Beaufort-Wind und Wetterlage. Die relative Auswahl sucht im Zehn-Tage-Horizont per Binärsuche die höchste Schwelle zwischen -10 und +20 mit mindestens 25 Stunden an fünf Tagen. Konkrete Laufzeitfenster sind eine eigene Erweiterung der Karte und verwenden dieselben Stundenscores.

Die öffentliche Quelle formuliert die Markierung als Score „über“ einer Schwelle; die Karte verwendet deshalb für ganzzahlige Schwellen strikt `>` statt `>=`. Das Zehn-Tage-Verfahren wird bei einer Zeitspanne von mindestens 9,5 Tagen und mindestens fünf Kalendertagen aktiviert. Andernfalls verwendet die Karte ausdrücklich eine eigene `Kurzfrist-Schwelle`: mindestens fünf markierte Stunden pro verfügbarem Tag, höchstens fünf Tage und höchstens 25 Stunden. Beide Varianten suchen die höchste ganzzahlige Schwelle von -10 bis +20; markiert werden ausschließlich Stunden mit einem Score strikt oberhalb dieser Schwelle. Die Kurzfrist-Variante ist keine Behauptung über das Originalverfahren; eine Top-10-Auswahl wird nicht verwendet.

Die Tagesübersichten fassen alle unmittelbar aufeinanderfolgenden, relativ markierten Stunden zu Zeiträumen zusammen. Für heute werden nur noch zukünftige Zeiträume, für morgen alle Zeiträume des lokalen Kalendertags angezeigt. Die konfigurierte Laufdauer bestimmt weiterhin die Mindestlänge eines ausgegebenen Zeitraums.

Die Originalmarkierung folgt ausschließlich Stunden-Score und gemeinsamer Schwelle. Wetterrisiken und eine aktive `warning_entity` bleiben sichtbar, werden aber nicht als zusätzlicher, auf laufwetter.de nicht veröffentlichter Ausschlussfilter auf markierte Stunden angewendet.

Die Karte ruft keine Daten von laufwetter.de ab. Home-Assistant-Anbieter liefern nicht zwingend DWD-MOSMIX-Daten, DWD-`ww`-Codes, Sonnenscheindauer oder die vollständigen Feuchtewerte. Daher ist die Bewertung nur dann mathematisch identisch, wenn diese Eingabedaten und alle nicht veröffentlichten Detailregeln übereinstimmen. Unveröffentlicht bleiben insbesondere die vier Windstufen, vollständige `ww`-Zuordnung und der Grenzfall bei exakt 19 °C. Fehlende Niederschlagsmenge und Luftfeuchte werden nicht erfunden; eine reine Regenwahrscheinlichkeit wird nicht als Starkregen gewertet.

Mit `debug: true` zeigt die Karte je Prognosestunde Roh-/Normalwerte, Wind und Böen getrennt, Niederschlagsmenge und -wahrscheinlichkeit getrennt, Score-Komponenten, Klassifizierung, Ausschlussgrund sowie eine kurze Diagramm-Scrollspur. Tagesgrenzen, Datum und Uhrzeit verwenden `hass.config.time_zone`, nicht die Browser-Zeitzone. `warning_entity` kann eine vorhandene Home-Assistant-Warnentität anbinden.

Das Stundenband ist ein eigener nativer Horizontal-Scrollbereich. Nach Benutzerinteraktion wird linke sichtbare Forecaststunde anhand ihres UTC-Zeitstempels verankert. Karten- und Forecast-Updates stellen denselben Zeitpunkt samt Pixeloffset wieder her, solange er noch vorhanden ist.

## Weiterentwicklung
Repository klonen und `npm install` ausführen. Die Berechnung liegt in `src/scoring.js`, die Wetterdaten-Normalisierung in `src/forecast.js`, die tagesgenaue Tageslichtberechnung in `src/daylight.js` und die Darstellung in `src/card.js`.

## Bekannte Grenzen
Keine Laufzeit-Interpolation bei halbstündigen Starts; Modell nicht wissenschaftlich validiert; unbekannte Einheitenschemata und Wetterdienst-Eigenheiten müssen weiter getestet werden; keine externe Warnmeldungsintegration. Bitte nicht als alleinige Grundlage für Entscheidungen bei Unwetter verwenden.
