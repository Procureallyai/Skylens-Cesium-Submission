/**
 * CameraControls.tsx
 *
 * Purpose: Provide camera mode presets (fly-to, orbit, follow, chase, free) with smooth transitions.
 * Rendered as a small overlay when the 'camera' feature flag is enabled.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Viewer, Entity, JulianDate as JulianDateType, Clock } from 'cesium';
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  Transforms,
  Matrix4,
  JulianDate,
} from 'cesium';

const EGLL = { lon: -0.454295, lat: 51.470020 };
// Global camera speed tuning for demo modes. Further slow-down per user feedback.
// Reduce speed to 30% of original. For duration-based moves, multiply by 1/0.3 ≈ 3.33.
const SPEED_SCALE = 0.3;
const FLYTO_BASE_DURATION_SEC = 3; // Cesium default flyTo duration is ~3s

export type CameraControlsProps = {
  viewer: Viewer;
  demoEntity?: Entity;
};

type Mode = 'free' | 'flyto' | 'orbit' | 'follow' | 'chase';

export default function CameraControls({ viewer, demoEntity }: CameraControlsProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('free');
  // Store the onTick callback so we can remove it later
  const tickCbRef = useRef<((clock: Clock) => void) | null>(null);
  const orbitStartRef = useRef<JulianDateType | undefined>(undefined);

  // Clean up helper to stop any onTick logic and exit lookAt transforms.
  const clearDynamicHandlers = () => {
    if (tickCbRef.current) {
      try { viewer.clock.onTick.removeEventListener(tickCbRef.current); } catch { /* ignore */ }
      tickCbRef.current = null;
    }
    try { viewer.camera.lookAtTransform(Matrix4.IDENTITY); } catch { /* ignore */ }
    viewer.trackedEntity = undefined;
  };

  useEffect(() => {
    return () => {
      // On unmount, ensure we clear handlers and transforms
      clearDynamicHandlers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doFlyToEgll = () => {
    clearDynamicHandlers();
    setMode('flyto');
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(EGLL.lon, EGLL.lat, 15000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-60),
      },
      duration: FLYTO_BASE_DURATION_SEC / SPEED_SCALE,
    });
  };

  const doOrbitEgll = () => {
    clearDynamicHandlers();
    setMode('orbit');
    const center = Cartesian3.fromDegrees(EGLL.lon, EGLL.lat, 0);
    const radius = 2000; // metres
    const pitch = CesiumMath.toRadians(-25);
    const degPerSec = 20 * SPEED_SCALE; // angular speed (slowed ~40%)
    orbitStartRef.current = JulianDate.now();

    const cb = (clock: Clock) => {
      const start = orbitStartRef.current ?? clock.currentTime;
      const seconds = JulianDate.secondsDifference(clock.currentTime, start);
      const heading = CesiumMath.toRadians((seconds * degPerSec) % 360);
      viewer.camera.lookAt(center, new HeadingPitchRange(heading, pitch, radius));
    };
    viewer.clock.onTick.addEventListener(cb);
    tickCbRef.current = cb;
  };

  const doFollow = () => {
    if (!demoEntity) return;
    clearDynamicHandlers();
    setMode('follow');
    // Cesium trackedEntity provides a good follow effect with easing
    viewer.trackedEntity = demoEntity;
  };

  // Helper to get entity position at an offset time from an optional base time
  const getEntityPositionAt = (offsetSec: number, base?: JulianDateType): Cartesian3 | undefined => {
    if (!demoEntity || !demoEntity.position) return undefined;
    const baseTime = base ?? viewer.clock.currentTime;
    const t = JulianDate.addSeconds(baseTime, offsetSec, new JulianDate());
    // SampledPositionProperty.getValue returns Cartesian3 or undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (demoEntity.position as any).getValue(t) as Cartesian3 | undefined;
  };

  const doChase = () => {
    if (!demoEntity) return;
    clearDynamicHandlers();
    setMode('chase');

    // Place camera behind the entity along its motion direction with slight downward pitch
    const distance = 800; // metres behind
    const pitch = CesiumMath.toRadians(-10);

    const cb = (clock: Clock) => {
      const pNow = getEntityPositionAt(0, clock.currentTime);
      const pNext = getEntityPositionAt(1, clock.currentTime);
      if (!pNow || !pNext) return;

      // Forward vector in world frame
      const fwd = Cartesian3.normalize(
        Cartesian3.subtract(pNext, pNow, new Cartesian3()),
        new Cartesian3()
      );

      // Transform forward vector into local ENU at pNow to derive heading relative to surface
      const enu = Transforms.eastNorthUpToFixedFrame(pNow);
      const inv = Matrix4.inverse(enu, new Matrix4());
      const fLocal = Matrix4.multiplyByPointAsVector(inv, fwd, new Cartesian3());
      const heading = Math.atan2(fLocal.x, fLocal.y) + Math.PI; // behind

      viewer.camera.lookAt(pNow, new HeadingPitchRange(heading, pitch, distance));
    };
    viewer.clock.onTick.addEventListener(cb);
    tickCbRef.current = cb;
  };

  const doFree = () => {
    clearDynamicHandlers();
    setMode('free');
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(31,41,55,0.8)',
    color: 'white',
    cursor: 'pointer',
  };
  const btnActive: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(59,130,246,0.9)'
  };
  const disabled: React.CSSProperties = {
    ...btnStyle,
    opacity: 0.5,
    cursor: 'not-allowed'
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        background: 'rgba(17,24,39,0.7)',
        borderRadius: 8,
        padding: 8,
        color: 'white',
        fontSize: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
      }}
      aria-label="Camera controls"
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Camera</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 360 }}>
        <button onClick={doFree} style={mode === 'free' ? btnActive : btnStyle}>Free</button>
        <button onClick={doFlyToEgll} style={mode === 'flyto' ? btnActive : btnStyle}>Fly‑to EGLL</button>
        <button onClick={doOrbitEgll} style={mode === 'orbit' ? btnActive : btnStyle}>Orbit EGLL</button>
        <button onClick={doFollow} style={!demoEntity ? disabled : (mode === 'follow' ? btnActive : btnStyle)} disabled={!demoEntity}>Follow</button>
        <button onClick={doChase} style={!demoEntity ? disabled : (mode === 'chase' ? btnActive : btnStyle)} disabled={!demoEntity}>Chase</button>
      </div>
    </div>
  );
}
