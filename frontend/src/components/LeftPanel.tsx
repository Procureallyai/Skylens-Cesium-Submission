/**
 * LeftPanel.tsx
 *
 * Purpose: Provide a left-side control panel with:
 *  - Flight selector (None / Demo Flight)
 *  - Timeline (Play/Pause, scrubber)
 *  - Layers toggles (Buildings, Weather placeholder)
 *  - Command input (placeholder for NL control)
 *
 * Props:
 *  - viewer: Cesium Viewer instance
 *  - demoEntity?: Demo flight entity, if enabled/available
 *  - osmBuildings?: OSM Buildings tileset to toggle visibility
 *
 * Behaviour:
 *  - Flight selector sets viewer.trackedEntity appropriately.
 *  - Timeline slider is bound to viewer.clock; scrubbing updates currentTime.
 *  - Play/Pause toggles viewer.clock.shouldAnimate.
 *  - Buildings toggle manipulates `osmBuildings.show`.
 *  - Weather toggle is a placeholder; no effect yet.
 *
 * Edge cases:
 *  - If no demoEntity, flight selector still shows options but disables "Demo".
 *  - If start/stop clock range is not valid, the timeline slider is disabled.
 *  - Cleanly removes onTick event listener on unmount.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Viewer, Entity, Cesium3DTileset, Clock } from 'cesium';
import { JulianDate } from 'cesium';
import { hasFlag } from '../lib/flags';
import { loadSampleFlightEntity } from '../lib/flightTrack';
import MetarCard from './MetarCard';
import NotamChat from './NotamChat';
import { postIntent, type IntentRequest, type IntentResponse } from '../lib/api';
import { applyIntent } from '../lib/intentDispatcher';

export type LeftPanelProps = {
  viewer: Viewer;
  demoEntity?: Entity;
  osmBuildings?: Cesium3DTileset;
};

/** Convert timeline info to a stable object for bindings. */
function useTimelineInfo(viewer: Viewer) {
  return useMemo(() => {
    const start = viewer.clock.startTime;
    const stop = viewer.clock.stopTime;
    const hasRange = JulianDate.lessThan(start, stop);
    const totalSec = hasRange ? Math.max(0, JulianDate.secondsDifference(stop, start)) : 0;
    return { start, stop, hasRange, totalSec };
  }, [viewer]);
}

/**
 * Convert an IntentResponse to a short, user-friendly message for the UI.
 */
function intentToMessage(intent: IntentResponse): string {
  const act = String(intent.action);
  const mapped = intent.mapped ?? {};
  const target = String((mapped as Record<string, unknown>).target ?? '').toUpperCase();
  switch (act) {
    case 'fly_to':
      return target ? `Flying to ${target}` : 'Flying to target';
    case 'orbit':
      return target ? `Orbiting ${target}` : 'Orbiting target';
    case 'follow':
      return 'Following demo flight';
    case 'chase':
      return 'Chasing demo flight';
    case 'set_layer': {
      const raw = String((mapped as Record<string, unknown>).target ?? '').toLowerCase();
      if (raw.startsWith('buildings:')) {
        const on = raw.endsWith(':on');
        return `Buildings layer turned ${on ? 'on' : 'off'}`;
      }
      return 'Layer updated';
    }
    default:
      return `Action: ${act}`;
  }
}

/** HH:MM:SS formatter for display. */
function formatHms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

/**
 * Parse a simple natural-language command into an IntentRequest.
 * Supported examples:
 *  - "fly to EGLL"
 *  - "orbit EGLL"
 *  - "follow demo"
 *  - "chase sample"
 *  - "buildings on" / "buildings off"
 */
function parseCommandToIntent(text: string): IntentRequest | null {
  const t = text.trim();
  if (!t) return null;
  const u = t.toUpperCase();

  // buildings on/off
  const mBuild = u.match(/\bBUILDINGS\s+(ON|OFF)\b/);
  if (mBuild) {
    return { action: 'set_layer', target: `buildings:${mBuild[1].toLowerCase()}` };
  }

  // fly to ICAO
  const mFly = u.match(/\bFLY(\s+TO)?\s+([A-Z]{4})\b/);
  if (mFly) {
    return { action: 'fly_to', target: mFly[2] };
  }

  // orbit ICAO
  const mOrbit = u.match(/\bORBIT\s+([A-Z]{4})\b/);
  if (mOrbit) {
    return { action: 'orbit', target: mOrbit[1] };
  }

  // follow word
  const mFollow = u.match(/\bFOLLOW\s+([A-Z0-9_-]+)\b/);
  if (mFollow) {
    return { action: 'follow', target: mFollow[1] };
  }

  // chase word
  const mChase = u.match(/\bCHASE\s+([A-Z0-9_-]+)\b/);
  if (mChase) {
    return { action: 'chase', target: mChase[1] };
  }

  return null;
}

export default function LeftPanel({ viewer, demoEntity, osmBuildings }: LeftPanelProps): JSX.Element {
  // Layers
  const [showBuildings, setShowBuildings] = useState<boolean>(osmBuildings?.show ?? true);
  const [showWeather, setShowWeather] = useState<boolean>(false);

  // Timeline control
  const { start, hasRange, totalSec } = useTimelineInfo(viewer);
  const [isPlaying, setIsPlaying] = useState<boolean>(viewer.clock.shouldAnimate);
  const [scrub, setScrub] = useState<number>(() => {
    if (!hasRange || totalSec <= 0) return 0;
    const current = JulianDate.secondsDifference(viewer.clock.currentTime, start);
    return (100 * current) / totalSec;
  });
  const wasPlayingRef = useRef<boolean>(viewer.clock.shouldAnimate);
  // Cleanup for dynamic camera modes started by intents (e.g., orbit/chase)
  const intentCleanupRef = useRef<(() => void) | null>(null);

  // Sample flight state
  const [sampleEntity, setSampleEntity] = useState<Entity | null>(null);
  const [sampleLoading, setSampleLoading] = useState<boolean>(false);
  const [sampleStatus, setSampleStatus] = useState<string>('');

  // Keep local UI in sync with viewer clock
  useEffect(() => {
    const onTick = (clock: Clock) => {
      if (!hasRange || totalSec <= 0) return;
      const current = JulianDate.secondsDifference(clock.currentTime, start);
      const pct = Math.min(100, Math.max(0, (100 * current) / totalSec));
      setScrub(pct);
    };
    viewer.clock.onTick.addEventListener(onTick);
    return () => {
      try { viewer.clock.onTick.removeEventListener(onTick); } catch { /* ignore */ }
      // Also clear any dynamic handlers started by intents
      try { intentCleanupRef.current?.(); } catch { /* ignore */ }
    };
  }, [viewer, hasRange, totalSec, start]);

  // Buildings toggle wiring
  useEffect(() => {
    if (osmBuildings) {
      osmBuildings.show = showBuildings;
    }
  }, [osmBuildings, showBuildings]);

  // Play / Pause handler
  const togglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    viewer.clock.shouldAnimate = next;
  };

  // Scrub begin/end to temporarily pause during interaction
  const onScrubPointerDown = () => {
    wasPlayingRef.current = viewer.clock.shouldAnimate;
    viewer.clock.shouldAnimate = false;
    setIsPlaying(false);
  };
  const onScrubPointerUp = () => {
    viewer.clock.shouldAnimate = wasPlayingRef.current;
    setIsPlaying(wasPlayingRef.current);
  };

  // Scrub change handler
  const onScrubChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (!hasRange || totalSec <= 0) return;
    const pct = Number(e.target.value);
    setScrub(pct);
    const seconds = (pct / 100) * totalSec;
    const newTime = JulianDate.addSeconds(start, seconds, new JulianDate());
    viewer.clock.currentTime = newTime;
  };

  // Flight selector
  const onFlightSelect: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const v = e.target.value;
    if (v === 'none') {
      viewer.trackedEntity = undefined;
      if (sampleEntity) {
        try { viewer.entities.remove(sampleEntity); } catch { /* ignore */ }
        setSampleEntity(null);
      }
    } else if (v === 'demo' && demoEntity) {
      viewer.trackedEntity = demoEntity;
      if (sampleEntity) {
        try { viewer.entities.remove(sampleEntity); } catch { /* ignore */ }
        setSampleEntity(null);
      }
    } else if (v === 'sample') {
      if (sampleEntity) {
        // Already loaded; just track it
        viewer.trackedEntity = sampleEntity;
        return;
      }
      setSampleLoading(true);
      setSampleStatus('Loading sample flight…');
      loadSampleFlightEntity(viewer)
        .then(({ entity, count }) => {
          setSampleEntity(entity);
          setSampleStatus(`Loaded ${count} points`);
          // Clear status after a short delay
          setTimeout(() => setSampleStatus(''), 2000);
        })
        .catch((err) => {
          console.error(err);
          setSampleStatus('Failed to load sample');
        })
        .finally(() => setSampleLoading(false));
    }
  };

  // Command input (placeholder)
  const [command, setCommand] = useState<string>('');
  const [intentLoading, setIntentLoading] = useState<boolean>(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [intentResult, setIntentResult] = useState<IntentResponse | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');

  // Shared sender for NL intents from text or quick action buttons
  const sendIntent = async (payload: IntentRequest) => {
    setIntentError(null);
    setIntentResult(null);
    setResultMessage('');
    try {
      setIntentLoading(true);
      const res = await postIntent(payload);
      setIntentResult(res);
      setResultMessage(intentToMessage(res));
      // Apply intent immediately to the viewer/layers. Clear previous dynamic mode if any.
      try { intentCleanupRef.current?.(); } catch { /* ignore */ }
      intentCleanupRef.current = applyIntent(res, {
        viewer,
        demoEntity: demoEntity ?? undefined,
        osmBuildings: osmBuildings ?? undefined,
        setShowBuildings: (v: boolean) => setShowBuildings(v),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Failed to parse intent');
      setIntentError(msg);
      console.error('Intent error', msg);
    } finally {
      setIntentLoading(false);
    }
  };
  const onCommandSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    const payload = parseCommandToIntent(command);
    if (!payload) {
      setIntentError('Unrecognised command. Try: "fly to EGLL", "orbit EGLL", or "buildings on"');
      return;
    }
    await sendIntent(payload);
    setCommand('');
  };

  // Labs: Camera demo runtime toggle via URL flags with reload
  const toggleCameraFlag: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      // Parse existing URL flags (ignore env defaults deliberately)
      const raw = sp.get('flags') ?? '';
      const parts = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const set = new Set(parts.map((s) => s.toLowerCase()));
      if (e.target.checked) {
        set.add('camera');
      } else {
        set.delete('camera');
      }
      const next = Array.from(set).join(',');
      sp.set('flags', next);
      // Replace to avoid stacking history entries
      window.location.replace(url.toString());
    } catch {
      // Fallback: toggle by appending a best-effort query string
      const href = e.target.checked ? '?flags=camera' : '?flags=';
      window.location.replace(href);
    }
  };

  // Styles
  const panelStyle: React.CSSProperties = {
    background: 'rgba(17,24,39,0.80)',
    color: 'white',
    padding: 12,
    borderRadius: 8,
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
    fontSize: 13,
    // Ensure the panel's content is visible on smaller viewports.
    // The page uses global overflow: hidden on html/body; make this panel independently scrollable.
    maxHeight: 'calc(100vh - 16px)', // match 8px top + 8px bottom margins in App.tsx
    overflowY: 'auto',
  };
  const sectionStyle: React.CSSProperties = {
    marginBottom: 12,
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    paddingBottom: 10,
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 600,
    marginBottom: 6,
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  };
  const buttonStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(31,41,55,0.9)',
    color: 'white',
    cursor: 'pointer',
    fontSize: 12,
  };
  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  };

  return (
    <div style={panelStyle} aria-label="Left control panel">
      {/* Labs / Feature flags */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Labs</span>
        <div style={rowStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={hasFlag('camera')}
              onChange={toggleCameraFlag}
              aria-label="Toggle camera demo"
            />
            Camera demo
          </label>
        </div>
      </div>

      {/* Flight selector */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Flight</span>
        <div style={rowStyle}>
          <select
            onChange={onFlightSelect}
            defaultValue={sampleEntity ? 'sample' : demoEntity ? 'demo' : 'none'}
            aria-label="Flight selector"
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(31,41,55,0.9)', color: 'white' }}
          >
            <option value="none">None</option>
            <option value="demo" disabled={!demoEntity}>Demo Flight (EGLL)</option>
            <option value="sample" disabled={sampleLoading}>Sample Flight (JSON)</option>
          </select>
        </div>
        {sampleStatus && <div role="status" aria-live="polite" style={{ marginTop: 6, opacity: 0.9 }}>{sampleStatus}</div>}
      </div>

      {/* Timeline */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Timeline</span>
        <div style={rowStyle}>
          <button
            type="button"
            onClick={togglePlay}
            style={buttonStyle}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={scrub}
            onChange={onScrubChange}
            onPointerDown={onScrubPointerDown}
            onPointerUp={onScrubPointerUp}
            aria-label="Timeline scrubber"
            disabled={!hasRange || totalSec <= 0}
            style={{ width: 220 }}
          />
          <span style={{ opacity: 0.9 }}>
            {hasRange && totalSec > 0
              ? `${formatHms(JulianDate.secondsDifference(viewer.clock.currentTime, start))} / ${formatHms(totalSec)}`
              : 'No time range'}
          </span>
        </div>
      </div>

      {/* Layers */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Layers</span>
        <div style={rowStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showBuildings}
              onChange={(e) => setShowBuildings(e.target.checked)}
              disabled={!osmBuildings}
              aria-label="Toggle buildings"
            />
            Buildings
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showWeather}
              onChange={(e) => setShowWeather(e.target.checked)}
              aria-label="Toggle weather overlay"
            />
            Weather
          </label>
        </div>
      </div>

      {/* Weather details */}
      {showWeather && (
        <div style={sectionStyle}>
          <span style={labelStyle}>METAR</span>
          <MetarCard icao="EGLL" />
        </div>
      )}

      {/* NOTAM Q&A */}
      <div style={sectionStyle}>
        <NotamChat defaultIcao="EGLL" compact />
      </div>

      {/* Command input + Quick actions */}
      <div>
        <span style={labelStyle}>Command</span>
        <form onSubmit={onCommandSubmit} style={rowStyle}>
          <input
            type="text"
            placeholder="e.g., Orbit EGLL at 500 m"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            aria-label="Command input"
            style={{ flex: 1, minWidth: 200, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(31,41,55,0.9)', color: 'white' }}
          />
          <button type="submit" style={buttonStyle} disabled={!command.trim()}>
            Send
          </button>
        </form>

        {/* Quick actions for deterministic demo */}
        <div style={buttonRowStyle}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => sendIntent({ action: 'fly_to', target: 'EGLL' })}
          >
            Fly to EGLL
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => sendIntent({ action: 'orbit', target: 'EGLL' })}
          >
            Orbit EGLL
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => sendIntent({ action: 'follow', target: 'demo' })}
            disabled={!demoEntity}
            aria-disabled={!demoEntity}
            title={demoEntity ? 'Follow demo flight' : 'Demo flight not available'}
          >
            Follow Demo
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => sendIntent({ action: 'chase', target: 'demo' })}
            disabled={!demoEntity}
            aria-disabled={!demoEntity}
            title={demoEntity ? 'Chase demo flight' : 'Demo flight not available'}
          >
            Chase Demo
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => sendIntent({ action: 'set_layer', target: 'buildings:on' })}
          >
            Buildings On
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => sendIntent({ action: 'set_layer', target: 'buildings:off' })}
          >
            Buildings Off
          </button>
        </div>
        {intentLoading && (
          <div role="status" aria-live="polite" style={{ marginTop: 6, opacity: 0.85 }}>Parsing…</div>
        )}
        {intentError && (
          <div role="alert" style={{ marginTop: 6, color: '#fca5a5' }}>{intentError}</div>
        )}
        {intentResult && (
          <div style={{ marginTop: 6 }}>
            <div style={{ opacity: 0.9, marginBottom: 4 }}>Result</div>
            <div>{resultMessage}</div>
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer' }}>Show technical details</summary>
              <pre style={{ marginTop: 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
{JSON.stringify(intentResult, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
