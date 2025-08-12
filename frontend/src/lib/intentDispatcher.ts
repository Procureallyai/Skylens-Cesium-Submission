/**
 * intentDispatcher.ts
 *
 * Purpose
 * - Map validated backend IntentResponse to concrete Cesium viewer actions.
 * - Centralise camera and layer side-effects so components can remain thin.
 *
 * API
 * - applyIntent(intent, ctx): applies the intent and returns a cleanup function
 *   that will undo any dynamic handlers (e.g., onTick callbacks) started by
 *   the action. Call the previous cleanup before applying a new intent.
 *
 * Types
 * - IntentResponse comes from lib/api.
 * - DispatchContext passes references to Viewer, optional demoEntity, and
 *   optional OSM Buildings tileset and UI state setters.
 *
 * Edge cases
 * - Unknown ICAO: currently supports only EGLL. Unknown codes are ignored with
 *   a console.warn.
 * - Orbit/Chase start dynamic onTick handlers; always call the returned cleanup
 *   before starting another dynamic camera mode.
 */

import type { Viewer, Entity, Cesium3DTileset, Clock } from 'cesium';
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  Transforms,
  Matrix4,
  JulianDate,
} from 'cesium';
import type { IntentResponse } from './api';

export type DispatchContext = {
  viewer: Viewer;
  demoEntity?: Entity;
  osmBuildings?: Cesium3DTileset;
  setShowBuildings?: (v: boolean) => void;
};

const EGLL = { lon: -0.454295, lat: 51.47002 };
const SPEED_SCALE = 0.3; // keep in sync with CameraControls
const FLYTO_BASE_DURATION_SEC = 3;

function flyTo(viewer: Viewer, lon: number, lat: number, heightM = 15000) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, heightM),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-60),
    },
    duration: FLYTO_BASE_DURATION_SEC / SPEED_SCALE,
  });
}

function startOrbit(viewer: Viewer, lon: number, lat: number): () => void {
  const center = Cartesian3.fromDegrees(lon, lat, 0);
  const radius = 2000;
  const pitch = CesiumMath.toRadians(-25);
  const degPerSec = 20 * SPEED_SCALE;
  const start = JulianDate.now();

  const cb = (clock: Clock) => {
    const seconds = JulianDate.secondsDifference(clock.currentTime, start);
    const heading = CesiumMath.toRadians((seconds * degPerSec) % 360);
    viewer.camera.lookAt(center, new HeadingPitchRange(heading, pitch, radius));
  };
  viewer.clock.onTick.addEventListener(cb);

  // Return cleanup
  return () => {
    try { viewer.clock.onTick.removeEventListener(cb); } catch { /* ignore */ }
    try { viewer.camera.lookAtTransform(Matrix4.IDENTITY); } catch { /* ignore */ }
  };
}

function followEntity(viewer: Viewer, entity: Entity): () => void {
  const prev = viewer.trackedEntity;
  viewer.trackedEntity = entity;
  return () => {
    // restore previous tracked entity (or unset)
    try { viewer.trackedEntity = prev ?? undefined; } catch { /* ignore */ }
  };
}

function startChase(viewer: Viewer, entity: Entity): () => void {
  const distance = 800; // m
  const pitch = CesiumMath.toRadians(-10);

  const getPosAt = (offsetSec: number, baseTime: JulianDate) => {
    if (!entity.position) return undefined as unknown as Cartesian3 | undefined;
    const t = JulianDate.addSeconds(baseTime, offsetSec, new JulianDate());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (entity.position as any).getValue(t) as Cartesian3 | undefined;
  };

  const cb = (clock: Clock) => {
    const pNow = getPosAt(0, clock.currentTime);
    const pNext = getPosAt(1, clock.currentTime);
    if (!pNow || !pNext) return;

    const fwd = Cartesian3.normalize(
      Cartesian3.subtract(pNext, pNow, new Cartesian3()),
      new Cartesian3()
    );

    const enu = Transforms.eastNorthUpToFixedFrame(pNow);
    const inv = Matrix4.inverse(enu, new Matrix4());
    const fLocal = Matrix4.multiplyByPointAsVector(inv, fwd, new Cartesian3());
    const heading = Math.atan2(fLocal.x, fLocal.y) + Math.PI; // behind

    viewer.camera.lookAt(pNow, new HeadingPitchRange(heading, pitch, distance));
  };
  viewer.clock.onTick.addEventListener(cb);

  return () => {
    try { viewer.clock.onTick.removeEventListener(cb); } catch { /* ignore */ }
    try { viewer.camera.lookAtTransform(Matrix4.IDENTITY); } catch { /* ignore */ }
  };
}

export function applyIntent(intent: IntentResponse, ctx: DispatchContext): () => void {
  const { viewer, demoEntity, osmBuildings, setShowBuildings } = ctx;
  // default no-op cleanup
  let cleanup: () => void = () => {};

  switch (intent.action) {
    case 'set_layer': {
      const raw = String(intent.mapped?.target ?? '').toLowerCase();
      if (raw.startsWith('buildings:')) {
        const on = raw.endsWith(':on');
        if (osmBuildings) { osmBuildings.show = on; }
        if (setShowBuildings) { setShowBuildings(on); }
      } else {
        // Future: other layers like weather
        console.warn('Unknown layer in set_layer:', raw);
      }
      break;
    }

    case 'fly_to': {
      const target = String(intent.mapped?.target ?? '').toUpperCase();
      if (target === 'EGLL') {
        flyTo(viewer, EGLL.lon, EGLL.lat);
      } else {
        console.warn('Unknown ICAO for fly_to:', target);
      }
      break;
    }

    case 'orbit': {
      const target = String(intent.mapped?.target ?? '').toUpperCase();
      if (target === 'EGLL') {
        cleanup = startOrbit(viewer, EGLL.lon, EGLL.lat);
      } else {
        console.warn('Unknown ICAO for orbit:', target);
      }
      break;
    }

    case 'follow': {
      if (demoEntity) {
        cleanup = followEntity(viewer, demoEntity);
      } else {
        console.warn('No demoEntity available for follow');
      }
      break;
    }

    case 'chase': {
      if (demoEntity) {
        cleanup = startChase(viewer, demoEntity);
      } else {
        console.warn('No demoEntity available for chase');
      }
      break;
    }

    default:
      console.warn('Unsupported action:', intent.action);
  }

  return cleanup;
}
