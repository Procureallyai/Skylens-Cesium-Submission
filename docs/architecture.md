# Architecture Overview

Last updated: 2025-08-11

Purpose: Provide a concise, reviewer-friendly view of Skylens architecture for certification and maintenance.

## High-level components

- Frontend: Vite + React + TypeScript + CesiumJS, deployed to Azure Storage Static Website.
- Backend: FastAPI (Python) running in Azure Container Apps, image hosted in GHCR.
- Data sources:
  - METAR: AWC (default) with optional AVWX (if configured in Key Vault).
  - Cesium ion assets for terrain/OSM Buildings (via runtime token).
- Platform services:
  - Azure Key Vault for runtime configuration (no secrets in repo/CI logs).
  - GitHub Actions with OIDC for CI/CD (frontend and backend).
  - Azure Log Analytics for backend logs.

## Mermaid diagram

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

## Natural language intent flow

1. User types a command or clicks a Quick Action in `frontend/src/components/LeftPanel.tsx`.
2. Frontend posts `IntentRequest` to `POST /ai/intent` via `frontend/src/lib/api.ts`.
3. Backend validates and returns `IntentResponse` using a strict schema (pydantic). Current scope supports: `fly_to`, `orbit`, `follow`, `chase`, `set_layer`.
4. Frontend applies the intent immediately via `frontend/src/lib/intentDispatcher.ts` (camera modes, layer toggles), providing a cleanup for dynamic modes (orbit/chase).
5. UI shows a friendly message plus collapsible technical details (JSON intent) for review.

## Configuration & security

- Cesium ion token: provided via environment/secret to the frontend build (`VITE_CESIUM_ION_ACCESS_TOKEN`).
- CORS: configured on backend; to be locked to the static site origin before submission.
- Key Vault: stores runtime config e.g. METAR provider, allow-origins; accessed by backend using managed identity.
- No secrets are committed to the repository or exposed in CI logs.

## CI/CD overview

- Frontend: GitHub Actions builds and uploads to Azure Storage Static Website; canonical URL is published in logs.
- Backend: Docker image built by GitHub Actions, pushed to GHCR, deployed to Azure Container Apps using `az containerapp create/update`.
- OIDC used for Azure login; branch protection requires status checks but no human approvals (solo-dev workflow).

## Assumptions & limitations

- Current intent set targets EGLL for camera demos; other ICAOs are ignored with warnings.
- AVWX is optional and only used if configured; AWC is the default METAR source.
- Offline samples are available for flight track and METAR; broader fallback logic is planned.
- Security hardening (CORS restriction) is planned before submission.
