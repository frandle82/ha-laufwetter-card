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
```

Die gewählte `weather`-Entität muss eine stündliche Vorhersage für `weather.get_forecasts` anbieten. Verfügbare Messgrößen hängen vom Wetteranbieter ab. Die Karte rechnet die üblichen Temperatureinheiten °C/°F und Windgeschwindigkeit km/h, mph, m/s, kn um.

## Bewertungsmodell
Temperatur 40 % (optimal 8–15 °C), Regen 30 %, Wind 15 %, Luftfeuchtigkeit 10 %, UV 5 %. Fehlende Werte werden nicht als perfekt interpretiert: vorhandene Faktoren werden proportional neu gewichtet. Bei Blitz/Gewitter, Hagel, extremen Temperaturen oder starken Böen wird der Index begrenzt. Die beste Startzeit wird aus aufeinanderfolgenden Prognosestunden geschätzt; Zwischenstunden werden noch nicht interpoliert.

## Weiterentwicklung mit Antigravity
Repository klonen und `npm install` ausführen. Die Berechnung liegt in `src/scoring.js`, die Wetterdaten-Normalisierung in `src/forecast.js`, die Darstellung in `src/card.js`. Änderungen auf einem eigenen Branch entwickeln und per Pull Request zusammenführen.

## Bekannte Grenzen
Keine Laufzeit-Interpolation bei halbstündigen Starts; Modell nicht wissenschaftlich validiert; unbekannte Einheitenschemata und Wetterdienst-Eigenheiten müssen weiter getestet werden; keine externe Warnmeldungsintegration. Bitte nicht als alleinige Grundlage für Entscheidungen bei Unwetter verwenden.
