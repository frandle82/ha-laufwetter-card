# AGENTS.md — Laufwetter Card

These rules apply to the entire repository and every agent working on it (including Google Antigravity).

## Mandatory skills
1. Before **every** development, review, debugging, testing, documentation or release task, locate and load the **Caveman** and **Ponytail** skills from the agent's installed skill registry.
2. Use **both** skills during the task according to their real, installed instructions. Do not invent their contents, pretend to have executed them, or substitute unrelated skills.
3. If either skill is missing, inaccessible, incompatible or ambiguous, explicitly report the blocker and request its installation or definition **before claiming compliance**. Do not silently skip a skill.
4. In the final task report, record whether each skill was found, loaded and used. Do not publish fabricated skill results.

## Product requirements
- Standalone Lovelace custom card. No custom Home Assistant integration, no external website scraping and no calls to laufwetter.de.
- Use the user's existing weather entity and Home Assistant hourly forecast service.
- Minimal, readable, responsive, accessible UI with light/dark themes.
- Separate scoring logic, forecast normalization, and presentation.
- Missing weather fields must not silently be treated as perfect weather.
- Running index is a heuristic, not a certified safety or medical forecast.

## Development workflow
- Read README.md, source code and tests before modifying behavior.
- Work on a feature branch; propose changes via pull request when possible.
- Add or update automated tests for each scoring or forecast behavior change.
- Run npm install, npm test and npm run build before reporting success.
- Check Home Assistant API compatibility, units, time zones, hourly continuity, DST, unavailable entities, missing forecasts, refresh and lifecycle.
- Do not claim runtime or visual testing unless actually performed in Home Assistant.
- Do not commit secrets or credentials.
- Explain any assumptions and outstanding risks.

## Definition of done
- Tests and build pass.
- Changes and test evidence are documented.
- Card renders without console errors in supported Home Assistant versions (or clearly marked unverified).
- Both mandatory skills are accounted for in the task report.
