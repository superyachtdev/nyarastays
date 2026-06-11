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
