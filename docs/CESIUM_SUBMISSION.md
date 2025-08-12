# Cesium Certified Developer Program Submission

Skylens: London Flight + Weather 3D

Last updated: 2025-08-13

---

## 1. Narrative

### 1.1 Project goal

Demonstrate expert use of CesiumJS to build an interactive, performant, and well-engineered 3D web application that:

- Visualises a sample London Heathrow (EGLL) flight track with time-dynamic animation and timeline controls.
- Provides camera demo modes (fly-to, orbit, follow, chase, free) with smooth transitions and accessible controls.
- Styles OSM Buildings by height bands with a clear legend and robust guards for data quality.
- Integrates a natural-language (NL) command interface to trigger camera and layer actions.
- Surfaces aviation weather (METAR) in a concise, risk-aware card.
- Includes NOTAM Q&A mini-RAG with curated dataset and Azure OpenAI integration.
- Ships with clean CI/CD, secure configuration, and reviewer-friendly documentation.

### 1.2 What I built

- A Vite + React + TypeScript frontend using CesiumJS to render terrain, OSM Buildings, a time-dynamic sample flight track, and demo camera controls.
- OSM Buildings height-band styling near EGLL with a small, comprehensible legend.
- A simple natural-language command input and Quick Action buttons that call a backend `POST /ai/intent` and apply mapped effects immediately.
- A backend (FastAPI, Azure Container Apps) that serves weather endpoints and an intent endpoint (schema-first design and validation in progress).
- CI/CD via GitHub Actions with OIDC, deploying the frontend to Azure Storage Static Website and the backend to Azure Container Apps.

Live site:

- Canonical (demo ON): [Open](https://stskylenslondev0532.z33.web.core.windows.net/)
- Overrides: `?flags=` (off) and `?flags=camera` (on)

### 1.3 Steps taken (high level)

1. Project foundations and Cesium integration

- Bootstrapped Vite + React + TypeScript.
- Injected Cesium ion token via `VITE_CESIUM_ION_ACCESS_TOKEN` during build.
- Implemented `CesiumViewer` to initialise the globe, terrain, and OSM Buildings.

1. Time-dynamic flight track and timeline

- Loaded a sample EGLL track using `Entity` + `SampledPositionProperty`.
- Wired timeline play/pause and availability to `viewer.clock`.
- Slowed time (`viewer.clock.multiplier = 2`) for demo clarity.

1. Camera modes and demo controls

- Implemented fly-to EGLL with eased animation and extended duration for demos.
- Implemented orbit using `Camera.lookAt` driven by `Clock.onTick`.
- Implemented follow (tracked entity) and chase (placed behind motion vector).
- Added a Free mode to exit scripted behaviour and clear dynamic handlers.

1. OSM Buildings height-band styling and legend

- Styled within ~2 km of EGLL to scope tile styling and maintain performance.
- Created thresholds: `<10`, `10–30`, `30–60`, `60–120`, `≥120` metres, with distinct colours.
- Added numeric guards to prevent comparisons against null/undefined heights.
- Added a legend UI to explain the styling.

1. Feature flags and demo toggles

- Build-time default `VITE_FLAGS=camera` enables demo controls on the canonical URL.
- URL `?flags` overrides build defaults for per-session control.
- UI toggles: bottom-left Demo/Exit Demo link; Left panel → Labs checkbox.

1. Natural-language (NL) command experience

- Frontend input box + Quick Actions call `POST /ai/intent`.
- A frontend dispatcher (`intentDispatcher.ts`) maps validated intent responses to Cesium actions (camera + layers) with cleanup for dynamic modes.
- The Command Result shows a friendly, concise message with an optional collapsible JSON details block for debugging.

1. Weather (METAR) card

- Backend `GET /weather/metar?icao=EGLL` fetches and caches from AWC (or AVWX if configured).
- Frontend card surfaces summary, risk level, notable items, and raw METAR.

1. CI/CD, infrastructure, and security

- GitHub Actions build the frontend and upload to Azure Storage Static Website; backend images pushed to GHCR and deployed to Azure Container Apps.
- OIDC used for Azure auth (no static secrets in the repo or CI logs).
- Azure Key Vault stores runtime config (e.g. METAR provider, allowed origins). CORS will be locked down to the static site origin before submission.

### 1.4 Final result (current state)

- The live site loads quickly with Cesium terrain + OSM Buildings and the height legend.
- Camera demo modes function reliably; speeds are slowed for demonstrability.
- Quick Actions and NL Command input both trigger backend intents and apply effects immediately client-side.
- METAR card and sample flight track display as intended.
- Documentation includes a reviewer-oriented submission guide and an architecture overview.

### 1.5 Next steps / future work

- Tighten backend intent schema (enums, numeric bounds) and robust server-side validation.
- Add 20 deterministic prompt tests for intent mapping.
- Lock CORS to the static site origin; read ALLOW-ORIGINS from Key Vault.
- Add telemetry (frontend: commands and camera events; backend: latency, cache hits).
- Draft acceptance tests and a 90-second demo video.
- Optional: NOTAM Q&A mini‑RAG with small curated corpus and citations.

---

## 2. Architecture

### 2.1 Overview and components

- Frontend (Azure Storage Static Website): Vite + React + TS + CesiumJS.
- Backend (Azure Container Apps): FastAPI service, image in GHCR.
- Data sources: Cesium ion (terrain/OSM Buildings), AviationWeather.gov (AWC) METAR; optional AVWX.
- Platform services: Azure Key Vault, GitHub Actions (OIDC), Log Analytics.

### 2.2 Diagram (Mermaid)

```mermaid
flowchart TD
  subgraph User
    U[Browser]
  end

  subgraph Frontend[Frontend: Azure Storage Static Website]
    FE[Skylens Web (Vite/React/Cesium)]
  end

  subgraph Backend[Backend: Azure Container Apps]
    API[FastAPI Service]
  end

  subgraph Platform[Platform Services]
    KV[Azure Key Vault]
    GHCR[(GitHub Container Registry)]
    GHA[GitHub Actions (OIDC)]
    LA[Log Analytics]
    ION[(Cesium ion)]
  end

  U -->|HTTPS| FE
  FE -->|/ai/intent, /weather, /flights/sample| API
  FE -->|Tiles & terrain| ION
  API -->|read config| KV
  API -->|logs| LA
  GHA -->|build & push| GHCR
  GHA -->|deploy image| API
```

### 2.3 Data flows

- NL Intent
  1. User types a command or clicks a Quick Action in `frontend/src/components/LeftPanel.tsx`.
  2. Frontend posts `IntentRequest` to `POST /ai/intent` via `frontend/src/lib/api.ts`.
  3. Backend validates and returns `IntentResponse` (schema-first; validation tightening in progress).
  4. Frontend applies the intent via `frontend/src/lib/intentDispatcher.ts` (camera/layers) with proper cleanup.
  5. UI shows a friendly message; users can expand to view raw JSON for debugging.

- METAR
  1. Frontend calls `GET /weather/metar?icao=EGLL`.
  2. Backend fetches from AWC (or AVWX if configured), caches, and returns a structured response.
  3. UI displays summary, risk level, notable items, and raw.

- Tiles & terrain
  1. Frontend retrieves assets from Cesium ion using runtime token.
  2. OSM Buildings styling limited to ~2 km radius from EGLL to focus and optimise.

### 2.4 Security & configuration

- Cesium ion token provided via environment variable at build time (`VITE_CESIUM_ION_ACCESS_TOKEN`).
- Backend configuration stored in Azure Key Vault (e.g. `ALLOW-ORIGINS`, METAR provider).
- OIDC for GitHub Actions → Azure login; no static passwords or keys in CI logs or repo.
- CORS will be restricted to the static site origin ahead of final submission.

---

## 3. Cesium-specific implementation details

### 3.1 Time-dynamic entity and timeline

- Flight track represented as an `Entity` with `SampledPositionProperty`.
- `viewer.clock` wired to availability; slowed multiplier for demo clarity.
- FPS overlay included for performance checks.

### 3.2 Camera modes

- Fly-to EGLL with extended duration and easing.
- Orbit via `Camera.lookAt` driven by `Clock.onTick`, respecting a demo speed scale.
- Follow/Chase using tracked entity and vector-relative placement.
- Free mode exits scripted behaviour and clears any `onTick` handlers.

### 3.3 OSM Buildings height-band styling

- Cesium3DTileStyle conditions by height bands: `<10`, `10–30`, `30–60`, `60–120`, `≥120` metres.
- Numeric guards ensure no comparisons occur on null/undefined values.
- Scope is limited to ~2 km radius from EGLL for performance and clarity.
- A small legend explains the colour mapping.

### 3.4 Performance and UX tuning

- Slowed animations for demo comprehension (`SPEED_SCALE`, `viewer.clock.multiplier = 2`).
- Smooth camera transitions; clear exit/cleanup logic for dynamic modes.
- Feature flags to enable/disable demo UI at build/runtime; URL overrides build default.

### 3.5 AI and NL intent mapping (current)

- Backend `POST /ai/intent` validates a constrained command schema.
- Deterministic mapping to actions (`fly_to`, `orbit`, `follow`, `chase`, `set_layer`).
- Optional AI disambiguation when configured; provider‑agnostic design.
- Privacy and security:
  - No secrets in the repo or CI logs.
  - Keys stored in Azure Key Vault when used.
  - Graceful fallback when no AI provider is configured (commands still work via schema and dispatcher).

---

## 4. Supporting documents and artefacts

- Live app (canonical): [Open](https://stskylenslondev0532.z33.web.core.windows.net/)
- Runtime overrides: `?flags=` (off), `?flags=camera` (on)
- Documentation:
  - `docs/SUBMISSION_NOTES.md` — reviewer guide and quick verification checklist
  - `docs/architecture.md` — high-level overview with Mermaid diagram
  - `docs/context-tracking.md` — decisions, risks, and change log
  - `docs/project-kanban.md` — tasks and status
- Source references (frontend):
  - `frontend/src/components/CesiumViewer.tsx` — viewer, clock, styling, tracked entity
  - `frontend/src/components/CameraControls.tsx` — demo camera modes and speed scaling
  - `frontend/src/components/LeftPanel.tsx` — NL Command input, Quick Actions, friendly result UI
  - `frontend/src/lib/flags.ts` — build vs URL flags
  - `frontend/src/lib/api.ts` — intent and METAR API client types and calls
  - `frontend/src/lib/intentDispatcher.ts` — apply validated intents to viewer/layers with cleanup
- Video: A short demo (≤90 seconds) will accompany this submission (to be recorded).
- Screenshots: Attached to the submission form (UI, legend, camera modes, NL command panel).

---

## 5. How Cesium supports this project’s context

- Rendering and data: CesiumJS powers the global terrain and OSM Buildings tiles; the ion platform provides reliable, high-quality assets.
- Time-dynamic entities: Cesium’s entity layer and timeline abstractions make animating a flight path straightforward and performant.
- Camera control: Cesium camera APIs (flyTo, lookAt, trackedEntity, onTick) enable rich, comprehensible demo modes.
- Styling: Cesium3DTileStyle lets us convey semantic information (height bands) clearly and safely with guards.
- Performance and UX: Cesium’s architecture and event hooks (e.g. `onTick`) make it easy to implement slowed, demonstrable experiences without hacks.

---

## 6. Reviewer’s quick guide (spot checks)

- UI loads with globe, OSM Buildings, and a height legend.
- Demo link (bottom-left) and Labs checkbox toggle camera demo mode via URL flags.
- In demo mode, camera controls appear and all modes operate (fly-to, orbit, follow, chase, free).
- NL Command panel:
  - Quick Actions: Fly to EGLL, Orbit EGLL, Follow Demo, Chase Demo, Buildings On/Off.
  - Result panel shows a friendly message; “Show technical details” reveals JSON intent.
- No console errors from OSM styling; numeric guards prevent `>= undefined`.

---

## 7. Appendix

### 7.1 Example intent payloads

IntentRequest (simplified):

```json
{
  "text": "orbit egll"
}
```

IntentResponse (simplified):

```json
{
  "action": "orbit",
  "mapped": { "target": "EGLL" },
  "raw": { "model": "...", "logprobs": null }
}
```

Buildings layer toggle:

```json
{
  "action": "set_layer",
  "mapped": { "target": "buildings:on" }
}
```

### 7.2 Operational notes

- Cesium ion token is injected at build time; no secrets in the repo or CI logs.
- CORS will be locked to the static site origin before submission.
- METAR provider defaults to AWC; AVWX can be configured via Key Vault.
- Offline samples for flights and METAR are bundled for resilience.

### 7.3 NOTAM Q&A Mini-RAG (implemented)

- **Scope**: NOTAM Q&A with curated EGLL/EGLC dataset and citations.
- **Implementation**: Vector search via Azure OpenAI embeddings + local fallback; citation-first answers.
- **UI**: Minimal chat interface in left panel with question input, ICAO selector, and expandable results.
- **Backend**: GET /ai/notam endpoint with provider-agnostic design and response caching.
- **Security**: No secrets in repo; Azure OpenAI keys via Key Vault when configured.

---

Thank you for reviewing this submission. If anything is unclear, please refer to the code paths above and the live URL, or contact me for additional context and a short guided demo video.
