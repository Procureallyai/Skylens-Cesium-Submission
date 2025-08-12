/**
 * CesiumViewer.tsx
 *
 * Purpose: Render a Cesium Viewer with world terrain and OSM Buildings. Style buildings by
 * height band and clip to a ~2 km radius around EGLL (Heathrow). Camera flies to EGLL on load.
 *
 * Requirements:
 * - A valid Cesium ion token must be provided at build time via VITE_CESIUM_ION_ACCESS_TOKEN.
 *
 * Notes:
 * - Clipping uses multiple planes in an ENU frame centred at EGLL to approximate a circular region.
 * - Styling uses 3D Tiles style conditions on the OSM Buildings `height` property.
 * - Fails gracefully if terrain/buildings fail to load (viewer remains usable).
 */
import { useRef, useEffect, useState } from 'react';
import {
    Viewer,
    createWorldTerrainAsync,
    createOsmBuildingsAsync,
    Cartesian3,
    Math as CesiumMath,
    Cesium3DTileStyle,
    ClippingPlane,
    ClippingPlaneCollection,
    Transforms,
    // Track-related imports
    JulianDate,
    SampledPositionProperty,
    VelocityOrientationProperty,
    Color,
    ClockRange,
    TimeIntervalCollection,
    TimeInterval,
    PathGraphics,
} from 'cesium';
import type { Entity, Cesium3DTileset } from 'cesium';
import { makeEgllDemoTrack, loadSampleFlightEntity } from '../lib/flightTrack';

/** EGLL (London Heathrow) reference point used for camera and clipping region. */
const EGLL = { lon: -0.454295, lat: 51.470020 };
/** Restrict OSM Buildings styling/clipping to within this radius (metres). */
const OSM_CLIP_RADIUS_M = 2000.0;

/** Props to expose the Cesium Viewer and demo entity when ready. */
type CesiumViewerProps = {
    onReady?: (ctx: { viewer: Viewer; demoEntity?: Entity; osmBuildings?: Cesium3DTileset }) => void;
    enableCameraDemo?: boolean;
};

/**
 * CesiumViewer React component.
 * Creates the Cesium Viewer in an effect hook and disposes on unmount.
 */
const CesiumViewer = ({ onReady, enableCameraDemo = false }: CesiumViewerProps) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const cesiumContainer = useRef<HTMLDivElement>(null);
    const [fps, setFps] = useState<{ now: number; avg: number }>({ now: 0, avg: 0 });

    useEffect(() => {
        let viewer: Viewer | undefined;
        let demoEntity: Entity | undefined;
        let osmBuildingsTileset: Cesium3DTileset | undefined;
        let cancelled = false;
        if (cesiumContainer.current) {
            viewer = new Viewer(cesiumContainer.current, {
                timeline: enableCameraDemo,
                animation: enableCameraDemo,
                geocoder: false,
                homeButton: false,
                sceneModePicker: false,
                baseLayerPicker: false,
                navigationHelpButton: false,
                infoBox: false,
                selectionIndicator: false,
                fullscreenButton: false,
            });

            // Try to load a sample flight track from JSON; if it fails, optionally fall back
            // to a procedural demo track when camera demo is enabled.
            (async () => {
                try {
                    const { entity, start, stop } = await loadSampleFlightEntity(viewer!);
                    if (cancelled || !viewer) return;
                    demoEntity = entity;
                    // Wire clock/timeline to the sample window
                    viewer.clock.startTime = start.clone();
                    viewer.clock.stopTime = stop.clone();
                    viewer.clock.currentTime = start.clone();
                    viewer.clock.clockRange = ClockRange.LOOP_STOP;
                    viewer.clock.multiplier = 2;
                    viewer.clock.shouldAnimate = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (viewer.timeline as any)?.zoomTo(start, stop);
                    viewer.trackedEntity = demoEntity;
                } catch (jsonErr) {
                    console.warn('Sample flight JSON load failed; falling back if enabled:', jsonErr);
                    if (!enableCameraDemo) return;
                    try {
                        const now = JulianDate.now();
                        const { start, stop, position } = makeEgllDemoTrack(now);
                        const availability = new TimeIntervalCollection([
                            new TimeInterval({ start, stop }),
                        ]);
                        demoEntity = viewer!.entities.add({
                            id: 'demo-flight-egll',
                            availability,
                            position,
                            orientation: new VelocityOrientationProperty(position as SampledPositionProperty),
                            point: {
                                pixelSize: 10,
                                color: Color.YELLOW,
                                outlineColor: Color.BLACK,
                                outlineWidth: 2,
                            },
                            path: new PathGraphics({
                                leadTime: 300, // 5 min lead
                                trailTime: 900, // 15 min trail
                                width: 2,
                                material: Color.CYAN,
                            }),
                        });

                        // Configure clock and timeline window for the fallback
                        viewer!.clock.startTime = start.clone();
                        viewer!.clock.stopTime = stop.clone();
                        viewer!.clock.currentTime = start.clone();
                        viewer!.clock.clockRange = ClockRange.LOOP_STOP;
                        viewer!.clock.multiplier = 2;
                        viewer!.clock.shouldAnimate = true;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (viewer!.timeline as any)?.zoomTo(start, stop);
                        viewer!.trackedEntity = demoEntity;
                    } catch (fallbackErr) {
                        console.warn('Failed to initialise fallback demo track:', fallbackErr);
                    }
                }
            })();

            // Load terrain and OSM buildings asynchronously
            (async () => {
                try {
                    const [terrain, osmBuildings] = await Promise.all([
                        createWorldTerrainAsync(),
                        createOsmBuildingsAsync(),
                    ]);
                    if (cancelled || !viewer) return;
                    // Assign terrain with compatibility for Cesium variants
                    // Prefer scene.terrain if present, otherwise fallback to viewer.terrainProvider
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if ((viewer.scene as any).terrain !== undefined) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (viewer.scene as any).terrain = terrain;
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (viewer as any).terrainProvider = terrain;
                    }
                    viewer.scene.primitives.add(osmBuildings);
                    osmBuildingsTileset = osmBuildings;

                    // Style OSM Buildings by height band
                    try {
                        osmBuildings.style = new Cesium3DTileStyle({
                            color: {
                                conditions: [
                                    // Guard first: some OSM Buildings features have no numeric `height`.
                                    // If height is null/undefined, short-circuit to neutral colour before
                                    // any numeric comparisons to avoid Cesium expression errors.
                                    ["${height} == null", "color('#d1d5db')"], // missing height
                                    ["(${height} != null) && (${height} >= 120)", "color('#ef4444')"], // ≥120 m
                                    ["(${height} != null) && (${height} >= 60)",  "color('#f97316')"], // 60–120 m
                                    ["(${height} != null) && (${height} >= 30)",  "color('#eab308')"], // 30–60 m
                                    ["(${height} != null) && (${height} >= 10)",  "color('#22c55e')"], // 10–30 m
                                    ["true",                                         "color('#d1d5db')"], // <10 m
                                ]
                            }
                        });
                    } catch (styleErr) {
                        // Non-fatal if style application fails
                        console.warn('Failed to apply OSM Buildings style:', styleErr);
                    }

                    // Clip OSM Buildings to a ~circular region of radius OSM_CLIP_RADIUS_M around EGLL
                    try {
                        const center = Cartesian3.fromDegrees(EGLL.lon, EGLL.lat, 0.0);
                        const planes = new ClippingPlaneCollection({
                            planes: [],
                            edgeWidth: 0.0,
                            enabled: true,
                        });
                        // Place the clipping planes in a local ENU frame centred at EGLL
                        planes.modelMatrix = Transforms.eastNorthUpToFixedFrame(center);
                        const planeCount = 32; // increase for a smoother circle
                        for (let i = 0; i < planeCount; i++) {
                            const angle = (i / planeCount) * Math.PI * 2.0;
                            const normal = new Cartesian3(Math.cos(angle), Math.sin(angle), 0.0);
                            planes.add(new ClippingPlane(normal, OSM_CLIP_RADIUS_M));
                        }
                        // Assign to the OSM Buildings tileset
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (osmBuildings as any).clippingPlanes = planes;
                    } catch (clipErr) {
                        console.warn('Failed to apply OSM Buildings clipping:', clipErr);
                    }
                } catch (err) {
                    // Log but keep viewer usable even without terrain/buildings
                    // This can happen if the ion token is missing/invalid
                    console.error('Failed to load terrain or OSM Buildings:', err);
                }

                if (cancelled || !viewer) return;
                // Fly the camera to London Heathrow Airport (EGLL) on load
                viewer.camera.flyTo({
                    destination: Cartesian3.fromDegrees(EGLL.lon, EGLL.lat, 15000),
                    orientation: {
                        heading: CesiumMath.toRadians(0.0),
                        pitch: CesiumMath.toRadians(-60.0),
                    }
                });

                // Notify parent that the viewer (and demo entity) is ready, include tileset
                onReady?.({ viewer, demoEntity, osmBuildings: osmBuildingsTileset });
            })();

            // Cleanup when component unmounts
            return () => {
                cancelled = true;
                if (viewer && !viewer.isDestroyed()) {
                    viewer.destroy();
                }
            };
        }
      // Intentionally exclude onReady from deps: including it causes viewer re-creation
      // and runtime errors in children relying on a stable Viewer instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableCameraDemo]);

    // Lightweight FPS overlay using requestAnimationFrame. Updates ~2x/sec to minimise re-renders.
    useEffect(() => {
        let rafId = 0;
        let last = performance.now();
        let acc = 0;
        let count = 0;
        let lastReport = last;
        const loop = (t: number) => {
            const dt = t - last;
            last = t;
            const inst = dt > 0 ? 1000 / dt : 0;
            acc += inst;
            count += 1;
            if (t - lastReport > 500) {
                const avg = count > 0 ? acc / count : 0;
                setFps({ now: Math.round(inst), avg: Math.round(avg) });
                acc = 0; count = 0; lastReport = t;
            }
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div ref={cesiumContainer} style={{ width: '100%', height: '100%' }} />
            <div
                style={{
                    position: 'absolute',
                    top: 110, // below the App-level height legend (top-right)
                    right: 8,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'rgba(17,24,39,0.8)',
                    color: 'white',
                    fontSize: 12,
                    border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    pointerEvents: 'none',
                }}
                aria-label="Frames per second"
            >
                FPS: {fps.now} (avg {fps.avg})
            </div>
        </div>
    );
};

export default CesiumViewer;
