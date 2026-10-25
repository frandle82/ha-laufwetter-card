# Prüfbericht Bewertungslogik V2

## Fehleranalyse

- `wind_speed` und `wind_gust_speed` sind getrennte Home-Assistant-Felder. Die Normalisierung rechnet beide mit derselben Einheit um; V2 zeigt Mittelwind und Böen getrennt. 73 km/h Mittelwind ist deshalb tatsächlich starker Wind, nicht automatisch eine Böe.
- Regenwahrscheinlichkeit ist Prozentwert und keine Intensität. V2 nutzt `precipitation` in mm/h vorrangig. Fehlt die Menge, wird die Bewertung als unsicher markiert und nur moderat über Wahrscheinlichkeit beeinflusst.
- Forecasts werden nach ISO-Zeitstempel sortiert und nur zukünftige, zusammenhängende Stunden werden für Fenster verwendet.
- Nahezu gleiche Balken entstehen, wenn der Wetteranbieter gleiche Werte für mehrere Stunden liefert oder das alte Modell die verfügbaren Faktoren stark normalisiert. V2 zeigt die tatsächlichen Stundenwerte im Tooltip und trennt Komfort von Risiken.
- Eine frühere „beste“ Zeit konnte trotz schlechtem Wetter erscheinen, weil nur ein Score-Maximum gesucht wurde. V2 markiert riskante Fenster als nicht empfehlenswert und zeigt bei ausschließlich riskanten Fenstern keinen Startzeitpunkt.

## Umsetzung

- Komfortindex: Temperatur, Niederschlagsmenge, Wind, Luftfeuchte und UV.
- Risiken unabhängig: Gewitter/Unwetter, Böen/Sturm, Glätteindikatoren, extreme Temperatur, Starkregen und optionaler `warning_entity`.
- Empfehlungen: differenzierte deutsche Aussagen; Risiko übersteuert Komfort.
- Fenster: 30, 45, 60, 90 und 120 Minuten; Anzeige von Startzeiten und Komfortwerten.
- Debug: YAML `debug: true` zeigt Entity-ID, erkannte Einheiten sowie erste Roh- und normalisierte Forecastwerte. Optional `warning_entity` bindet eine vorhandene HA-Warnentität ein.

## Tests

- `npm test`: 10/10 erfolgreich.
- `npm run build`: erfolgreich, `dist/ha-laufwetter-card.js`.
- `node --check dist/ha-laufwetter-card.js`: erfolgreich.
- Bundle: keine Imports, Custom-Card-Registrierung vorhanden.
- Keine laufende Home-Assistant-Testinstanz verfügbar; echte Darstellung, WebSocket-Reconnects, Warnentität und DST-Verhalten bleiben runtime-unverifiziert.

## Skills

- Caveman: installiert, gelesen und verwendet.
- Ponytail: nicht installiert/auffindbar; nicht verwendet. Keine Ausführung behauptet.
