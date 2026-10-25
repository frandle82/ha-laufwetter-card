# Laufwetter Card für Home Assistant

Eigenständige, minimalistische Dashboard-Karte zur Bewertung von Laufbedingungen. **Keine Verbindung zu laufwetter.de** und kein Scraping.

## Status
Frühe Entwicklungsversion (0.1.0). Die Bewertungslogik ist eine nachvollziehbare **Heuristik**, keine validierte sportmedizinische Empfehlung. Kein Gewitter- oder Glatteis-Frühwarnsystem.

## Einrichtung
```bash
npm install
npm run build
```
Kopiere `dist/laufwetter-card.js` nach `/config/www/laufwetter-card.js`. Registriere in Home Assistant unter Dashboard-Ressourcen `/local/laufwetter-card.js` als JavaScript-Modul.

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
Der Laufkomfort kombiniert Temperatur, Niederschlagsmenge in mm/h, Wind, Luftfeuchtigkeit und UV. Regenwahrscheinlichkeit wird getrennt als ergänzende Information behandelt; fehlt die Niederschlagsmenge, wird Unsicherheit angezeigt. Risiken wie Gewitter, Glätte, Starkregen, extreme Temperaturen und starke Böen übersteuern den Komfortindex. Die besten zusammenhängenden Fenster werden für 30, 45, 60, 90 und 120 Minuten berechnet. Das Modell ist eine konfigurierbare Heuristik, keine sportmedizinische oder amtliche Sicherheitsbewertung.

Mit `debug: true` zeigt die Karte Rohwerte, normalisierte Werte und verwendete Einheiten. `warning_entity` kann eine vorhandene Home-Assistant-Warnentität anbinden.

## Weiterentwicklung mit Antigravity
Repository klonen und `npm install` ausführen. Die Berechnung liegt in `src/scoring.js`, die Wetterdaten-Normalisierung in `src/forecast.js`, die Darstellung in `src/card.js`. Änderungen auf einem eigenen Branch entwickeln und per Pull Request zusammenführen.

## Bekannte Grenzen
Keine Laufzeit-Interpolation bei halbstündigen Starts; Modell nicht wissenschaftlich validiert; unbekannte Einheitenschemata und Wetterdienst-Eigenheiten müssen weiter getestet werden; keine externe Warnmeldungsintegration. Bitte nicht als alleinige Grundlage für Entscheidungen bei Unwetter verwenden.
