# Cesium Certification Submission Notes

Last updated: 2025-08-11

Purpose: Guidance for Cesium reviewers to verify the camera demo and OSM Buildings styling features, with fast links and expected behaviour.

---

## Live URLs

- Canonical (demo ON by default): [Open](https://stskylenslondev0532.z33.web.core.windows.net/)

- Override: demo OFF: [Open](https://stskylenslondev0532.z33.web.core.windows.net/?flags=)

- Override: demo ON: [Open](https://stskylenslondev0532.z33.web.core.windows.net/?flags=camera)

Notes:

- The frontend CI build sets `VITE_FLAGS=camera` by default so the canonical URL opens in camera demo mode.
- The URL parameter `?flags=` takes precedence over the build default, allowing runtime overrides per session.

## How to toggle at runtime

- Bottom-left link: “Demo” (or “Exit Demo”) toggles the `?flags` parameter.
- Left panel → Labs: “Camera demo” checkbox updates `?flags` and reloads.

Implementation references:
- `frontend/src/App.tsx` (Demo/Exit Demo link and camera controls rendering)
- `frontend/src/components/LeftPanel.tsx` (Labs checkbox + URL rewrite)
- `frontend/src/lib/flags.ts` (URL precedence over `VITE_FLAGS`)

## Camera demo modes and speeds
Available modes (bottom-right overlay):
- Fly‑to EGLL: Smooth camera animation to Heathrow at ~15 km altitude, heading 0°, pitch −60°.
- Orbit EGLL: Circular orbit at ~2 km radius, pitch ~−25°.
- Follow: Camera follows the demo aircraft (tracked entity).
- Chase: Camera placed behind the aircraft along its motion vector.
- Free: Exit any scripted camera behaviour.

Demo speeds:
- Global slow-down for demo usability:
  - Fly‑to duration extended to ~10 s (`duration = 3 / 0.3`).
  - Orbit angular speed scaled by `SPEED_SCALE = 0.3`.
  - Timeline animation slowed: `viewer.clock.multiplier = 2`.

Implementation references:
- `frontend/src/components/CameraControls.tsx` (SPEED_SCALE, fly‑to/orbit logic)
- `frontend/src/components/CesiumViewer.tsx` (clock multiplier, tracked entity)

## OSM Buildings height-band styling

- Scope: Within ~2 km of EGLL to focus the area of interest.
- Bands (metres): `< 10`, `10–30`, `30–60`, `60–120`, `≥ 120` with distinct colours.
- Numeric guards: Expressions short‑circuit when `height` is null/undefined to avoid comparison on non-numeric values.
- Legend: Top-right UI shows the colour key.

Implementation references:

- `frontend/src/components/CesiumViewer.tsx` (Cesium3DTileStyle conditions + clipping)
- `frontend/src/components/HeightLegend.tsx` (legend UI)

## Natural Language Command UI

- In the Left panel, under Command, you can either type a simple instruction or use the Quick Action buttons. These call the same backend API and apply changes immediately to the viewer.
- Quick Actions provided for demo clarity:
  - Fly to EGLL
  - Orbit EGLL
  - Follow Demo
  - Chase Demo
  - Buildings On / Buildings Off
- Result panel shows a short, human-readable message. A collapsible “Show technical details” reveals the JSON intent for debugging.

Implementation references:

- `frontend/src/components/LeftPanel.tsx` (command input, quick actions, friendly result UI)
- `frontend/src/lib/intentDispatcher.ts` (maps validated intents to Cesium viewer actions)
- `frontend/src/lib/api.ts` (IntentRequest/IntentResponse types and POST /ai/intent)

## Quick verification checklist

- UI loads with Cesium globe, OSM Buildings, and the height legend visible.
- Bottom-left shows Demo/Exit Demo link; Left panel has Labs → Camera demo toggle.
- Toggle demo via link/checkbox updates URL and reloads state.
- Camera controls overlay appears in demo mode and all buttons operate:
  - Fly‑to smoothly animates to Heathrow with slower pacing (~10 s).
  - Orbit circles at a visibly slower rate than default.
  - Follow/Chase track the yellow demo aircraft along its cyan path.
- No console errors during OSM Buildings styling (guards prevent `>= undefined`).

## Build and environment

- Frontend CI workflow: `.github/workflows/frontend.yml` sets `VITE_FLAGS=camera` and uses `secrets.VITE_CESIUM_ION_ACCESS_TOKEN`.
- URL flags override build defaults per session; see `frontend/src/lib/flags.ts`.

## Limitations

- CORS currently permissive for development; security hardening tracked in Kanban.
- METAR and NL intent features are in progress and not required for this camera demo submission.

---

For any review questions, please reference the file paths above and the live URLs. Thank you.
