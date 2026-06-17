# Nyara Stays — PRD

## Original request
User cloned project from https://github.com/superyachtdev/nyarastays and asked to "change the ambient audio to crashing waves."

## Architecture
- Static-style site served from `frontend/public/` (index.html + assets/js/elevate.js)
- React shell at `/app/frontend/src/App.js` (boilerplate, not the actual site)
- FastAPI backend at `/app/backend/server.py`
- Ambient audio is **procedural** Web Audio API in `frontend/public/assets/js/elevate.js`

## What's been implemented (Jan 2026)
- Replaced procedural jungle soundscape (leafy wind, distant river, cicada drone, gamelan pad, bird chirps) with a procedural crashing-waves soundscape:
  - Deep ocean rumble (sub-low filtered noise)
  - Surf wash with slow ~12s swell LFO
  - High sea-spray shimmer
  - Periodic crashing-wave events every 6–13s with spectral sweep + long decay tail
  - Welcome wave cue on activation (replaces bird chirp)
- Sound toggle UI, sessionStorage key (`nyara:ambient`), and auto-start gesture handling preserved unchanged
- File edited: `/app/frontend/public/assets/js/elevate.js` (section 4 only)

## Verified
- JS syntax OK (`node -c`)
- Live site loads, toggle reads `AMBIENT · OFF` and flips to `AMBIENT · ON` on first user gesture
- Audit confirms old soundscape strings removed and new ones present

## Backlog / Future
- None requested

---
## Update — 2026-06-17 · Added "Penthouse by Nyara" (Tulum)
Cloned superyachtdev/nyarastays and added a 3rd stay to the collection.
- New location page: `frontend/public/locations/penthouse.html` (modeled on yume.html)
- 5 guest-supplied photos added to `frontend/public/assets/images/penthouse/`
- Details (from Airbnb 43269389): Aldea Zama, Tulum, Mexico · 3BR · sleeps 9 · 2 private pools · BBQ · jungle views · placeholder USD 450/night
- Registered the stay everywhere: `index.html` (stay card + footer + heading), `locations.html` (3rd property card + collection count), `booking.html` (media + destination grid), `assets/js/booking.js` STAYS, `_worker.js` STAYS + IMAGE_CATALOG, `backend/payments.py` STAYS + Literal type

## Update — 2026-06-17 · Copy & UX polish
- Homepage Stays section converted from 2-col grid to a horizontal scroll-snap row (third stay peeks to invite scroll).
- Ambient soundscape: added synthesized meditation pad (A-minor drone, slow filter sweep) + occasional pentatonic singing-bowl tones behind the waves. Fixed auto-start so audio only starts (and shows "On") once AudioContext is truly running — scroll-triggered intent now arms next real gesture instead of showing a silent "On".
- Collection copy updated site-wide to reflect 3 stays (Bali/Phuket/Tulum): index hero + meta/OG + N°03 hero counter, intro splash, locations meta + map strip + legend, about timeline/philosophy/meta. Property-specific "two pools/villas" wording intentionally kept.
