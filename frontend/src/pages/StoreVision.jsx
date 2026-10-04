import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import {
  createTracker,
  updateTracker,
  checkLineCrossing,
  isInsideZone,
  toGridCell,
} from '../utils/storeAnalyticsEngine';

const DETECTION_INTERVAL_MS = 250;
const SYNC_INTERVAL_MS = 5000;
const CONFIDENCE_THRESHOLD = 0.55;
const GRID_COLS = 12;
const GRID_ROWS = 8;
const ZONE_COLORS = { DWELL: '#E88A1F', QUEUE: '#C0392B' };

export default function StoreVision() {
  const toast = useToast();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const trackerRef = useRef(createTracker());
  const detectionTimerRef = useRef(null);
  const syncTimerRef = useRef(null);

  const pendingFootfallRef = useRef([]);
  const pendingDwellRef = useRef([]);
  const pendingHeatmapRef = useRef(new Map());
  const queueCountsRef = useRef(new Map());

  const [modelStatus, setModelStatus] = useState('idle');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [zones, setZones] = useState([]); // rect zones only (DWELL/QUEUE) — {id, name, zone_type, geometry}
  const [entranceLine, setEntranceLine] = useState(null); // zone row with zone_type ENTRANCE_LINE
  const [drawingType, setDrawingType] = useState(null);
  const [drawStart, setDrawStart] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const loadZones = useCallback(() => {
    api
      .get('/zones')
      .then(({ data }) => {
        setZones(data.zones.filter((z) => z.zone_type === 'DWELL' || z.zone_type === 'QUEUE'));
        const line = data.zones.find((z) => z.zone_type === 'ENTRANCE_LINE');
        setEntranceLine(line || null);
      })
      .catch((err) => toast.error(getErrorMessage(err)));
  }, [toast]);

  const loadSummary = useCallback(() => {
    api.get('/analytics/summary').then(({ data }) => setSummary(data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadZones();
    loadSummary();
  }, [loadZones, loadSummary]);

  useEffect(() => {
    let cancelled = false;
    setModelStatus('loading');
    Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')])
      .then(([tf, cocoSsd]) => tf.ready().then(() => cocoSsd.load({ base: 'lite_mobilenet_v2' })))
      .then((model) => {
        if (cancelled) return;
        modelRef.current = model;
        setModelStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setModelStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        stream.getTracks().forEach((tr) => tr.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setCameras(cams);
        if (cams.length > 0) setSelectedCameraId(cams[0].deviceId);
      })
      .catch(() => toast.error('Camera access was blocked or unavailable.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoneRectPx(zone, width, height) {
    const g = zone.geometry;
    return { x: g.x * width, y: g.y * height, width: g.width * width, height: g.height * height };
  }

  const flushToServer = useCallback(async () => {
    const footfall = pendingFootfallRef.current;
    const dwell = pendingDwellRef.current;
    const heatmap = pendingHeatmapRef.current;

    pendingFootfallRef.current = [];
    pendingDwellRef.current = [];
    pendingHeatmapRef.current = new Map();

    try {
      if (footfall.length > 0) await api.post('/analytics/footfall', { events: footfall });
      for (const d of dwell) await api.post('/analytics/dwell', d);
      if (heatmap.size > 0) {
        const cells = [...heatmap.entries()].map(([key, hits]) => {
          const [gx, gy] = key.split(',').map(Number);
          return { grid_x: gx, grid_y: gy, hits };
        });
        await api.post('/analytics/heatmap', { cells });
      }
      for (const [zoneId, count] of queueCountsRef.current) {
        const zone = zones.find((z) => z.id === zoneId);
        if (zone) await api.post('/analytics/queue', { zone_id: zone.id, zone_name: zone.name, queue_length: count });
      }
      loadSummary();
    } catch (err) {
      console.error('Sync failed:', getErrorMessage(err));
    }
  }, [zones, loadSummary]);

  function drawOverlay(canvas, people, zoneList, lineFrac, width, height, currentQueueCounts, drawHeatmap) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (drawHeatmap && summary?.heatmap?.length) {
      const cellW = width / GRID_COLS;
      const cellH = height / GRID_ROWS;
      const maxHits = Math.max(...summary.heatmap.map((c) => c.hit_count), 1);
      for (const cell of summary.heatmap) {
        const intensity = cell.hit_count / maxHits;
        ctx.fillStyle = `rgba(232, 138, 31, ${0.15 + intensity * 0.45})`;
        ctx.fillRect(cell.grid_x * cellW, cell.grid_y * cellH, cellW, cellH);
      }
    }

    if (lineFrac != null) {
      ctx.strokeStyle = '#1E8A5F';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(0, lineFrac * height);
      ctx.lineTo(width, lineFrac * height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const zone of zoneList) {
      const rectPx = zoneRectPx(zone, width, height);
      ctx.strokeStyle = ZONE_COLORS[zone.zone_type];
      ctx.lineWidth = 2;
      ctx.strokeRect(rectPx.x, rectPx.y, rectPx.width, rectPx.height);
      ctx.fillStyle = ZONE_COLORS[zone.zone_type];
      const label = zone.zone_type === 'QUEUE' ? `${zone.name} (${currentQueueCounts.get(zone.id) || 0})` : zone.name;
      ctx.font = '14px sans-serif';
      ctx.fillText(label, rectPx.x + 4, rectPx.y - 6 < 12 ? rectPx.y + 16 : rectPx.y - 6);
    }

    ctx.strokeStyle = '#16305C';
    ctx.lineWidth = 2;
    ctx.font = '13px sans-serif';
    for (const p of people) {
      const [x, y, w, h] = p.bbox;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(22,48,92,0.85)';
      ctx.fillRect(x, y - 18, 70, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(`person ${(p.score * 100).toFixed(0)}%`, x + 3, y - 4);
    }
  }

  function runDetectionTick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!video || !canvas || !model || video.readyState < 2) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;

    model.detect(video).then((predictions) => {
      const people = predictions.filter((p) => p.class === 'person' && p.score >= CONFIDENCE_THRESHOLD);
      const { activeTracks, endedTracks } = updateTracker(trackerRef.current, people);

      for (const track of endedTracks) {
        for (const [zoneId, state] of Object.entries(track.zoneState)) {
          const zone = zones.find((z) => String(z.id) === String(zoneId));
          if (zone) pendingDwellRef.current.push({ zone_id: zone.id, zone: zone.name, duration_seconds: (Date.now() - state.since) / 1000 });
        }
      }

      const lineYpx = entranceLine ? entranceLine.geometry.y * height : null;
      const currentQueueCounts = new Map(zones.filter((z) => z.zone_type === 'QUEUE').map((z) => [z.id, 0]));

      for (const track of activeTracks) {
        if (lineYpx != null) {
          const crossing = checkLineCrossing(track, lineYpx);
          if (crossing) pendingFootfallRef.current.push({ event_type: crossing });
        }

        for (const zone of zones) {
          const rectPx = zoneRectPx(zone, width, height);
          const inside = isInsideZone(track.centroid, rectPx);

          if (zone.zone_type === 'DWELL') {
            const wasInside = Boolean(track.zoneState[zone.id]);
            if (inside && !wasInside) {
              track.zoneState[zone.id] = { since: Date.now() };
            } else if (!inside && wasInside) {
              const duration = (Date.now() - track.zoneState[zone.id].since) / 1000;
              pendingDwellRef.current.push({ zone_id: zone.id, zone: zone.name, duration_seconds: duration });
              delete track.zoneState[zone.id];
            }
          } else if (zone.zone_type === 'QUEUE' && inside) {
            currentQueueCounts.set(zone.id, (currentQueueCounts.get(zone.id) || 0) + 1);
          }
        }

        const { gx, gy } = toGridCell(track.centroid, width, height, GRID_COLS, GRID_ROWS);
        const key = `${gx},${gy}`;
        pendingHeatmapRef.current.set(key, (pendingHeatmapRef.current.get(key) || 0) + 1);
      }

      queueCountsRef.current = currentQueueCounts;
      setLiveCount(activeTracks.length);
      drawOverlay(canvas, people, zones, entranceLine ? entranceLine.geometry.y : null, width, height, currentQueueCounts, showHeatmap);
    });
  }

  async function startMonitoring() {
    if (modelStatus !== 'ready') {
      toast.error('The detection model is still loading.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      trackerRef.current = createTracker();
      pendingFootfallRef.current = [];
      pendingDwellRef.current = [];
      pendingHeatmapRef.current = new Map();

      detectionTimerRef.current = setInterval(runDetectionTick, DETECTION_INTERVAL_MS);
      syncTimerRef.current = setInterval(flushToServer, SYNC_INTERVAL_MS);
      setIsMonitoring(true);
    } catch (err) {
      toast.error('Could not access the camera: ' + err.message);
    }
  }

  function stopMonitoring() {
    clearInterval(detectionTimerRef.current);
    clearInterval(syncTimerRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());

    for (const track of trackerRef.current.tracks.values()) {
      for (const [zoneId, state] of Object.entries(track.zoneState)) {
        const zone = zones.find((z) => String(z.id) === String(zoneId));
        if (zone) pendingDwellRef.current.push({ zone_id: zone.id, zone: zone.name, duration_seconds: (Date.now() - state.since) / 1000 });
      }
    }
    flushToServer();
    setIsMonitoring(false);
    setLiveCount(0);
  }

  useEffect(() => stopMonitoring, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCanvasMouseDown(e) {
    if (!drawingType) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDrawStart({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  }

  async function handleCanvasMouseUp(e) {
    if (!drawingType || !drawStart) return;
    const rectEl = canvasRef.current.getBoundingClientRect();
    const end = { x: (e.clientX - rectEl.left) / rectEl.width, y: (e.clientY - rectEl.top) / rectEl.height };

    const x = Math.min(drawStart.x, end.x);
    const y = Math.min(drawStart.y, end.y);
    const width = Math.abs(end.x - drawStart.x);
    const height = Math.abs(end.y - drawStart.y);

    if (width > 0.03 && height > 0.03) {
      const count = zones.filter((z) => z.zone_type === drawingType).length + 1;
      const name = drawingType === 'QUEUE' ? `Checkout ${count}` : `Zone ${count}`;
      try {
        await api.post('/zones', { name, zone_type: drawingType, geometry: { x, y, width, height } });
        toast.success(`Added ${drawingType.toLowerCase()} zone "${name}".`);
        loadZones();
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    }
    setDrawStart(null);
    setDrawingType(null);
  }

  async function removeZone(id) {
    try {
      await api.delete(`/zones/${id}`);
      loadZones();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function setEntranceLineY(y) {
    try {
      if (entranceLine) await api.delete(`/zones/${entranceLine.id}`);
      await api.post('/zones', { name: 'Main Entrance', zone_type: 'ENTRANCE_LINE', geometry: { y } });
      loadZones();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  function formatSeconds(s) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div style={{ padding: '1.8rem 2rem' }}>
      <h1 style={{ fontSize: '1.8rem' }}>Store Vision</h1>
      <p style={{ color: 'var(--color-ink-soft)', marginBottom: '1.2rem' }}>
        On-device shopper, dwell, and queue analytics. All detection runs locally in this browser tab —
        no video or image is ever sent to a server, only aggregate counts.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.2rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {cameras.length > 1 && (
              <select className="select" style={{ maxWidth: 220 }} value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} disabled={isMonitoring}>
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
                ))}
              </select>
            )}
            {!isMonitoring ? (
              <button className="btn btn-primary" onClick={startMonitoring} disabled={modelStatus !== 'ready'}>
                {modelStatus === 'loading' ? 'Loading AI model…' : modelStatus === 'error' ? 'Model failed to load' : '▶ Start monitoring'}
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopMonitoring}>■ Stop monitoring</button>
            )}
            <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>People in view: <strong>{liveCount}</strong></span>
            <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
              <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} /> Heatmap
            </label>
          </div>

          <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block' }} />
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: drawingType ? 'crosshair' : 'default' }}
            />
          </div>

          <div style={{ marginTop: '0.8rem' }}>
            <label className="label">Entrance line position</label>
            <input
              type="range" min="0.1" max="0.9" step="0.05"
              value={entranceLine?.geometry.y ?? 0.35}
              onChange={(e) => setEntranceLineY(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--color-ink-soft)' }}>Crossing downward = entry; upward = exit.</p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setDrawingType('DWELL')} disabled={!isMonitoring}>
              {drawingType === 'DWELL' ? 'Draw on the video…' : '+ Add dwell zone'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setDrawingType('QUEUE')} disabled={!isMonitoring}>
              {drawingType === 'QUEUE' ? 'Draw on the video…' : '+ Add checkout/queue zone'}
            </button>
          </div>
          {zones.length > 0 && (
            <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {zones.map((z) => (
                <span key={z.id} className="badge" style={{ background: 'var(--color-surface-sunken)', color: 'var(--color-ink)' }}>
                  {z.name} ({z.zone_type}) <button onClick={() => removeZone(z.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 4 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.8rem' }}>Today</h3>
            <Row label="Footfall" value={summary?.todayFootfall ?? '—'} />
            <Row label="Currently in store" value={summary?.currentOccupancy ?? '—'} />
            <Row label="Avg. dwell time" value={summary ? formatSeconds(summary.avgDwellSeconds) : '—'} last />
          </div>

          <div className="card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.8rem' }}>Queue status</h3>
            {summary?.currentQueue ? (
              <>
                <Row label="Last sample" value={`${summary.currentQueue.queue_length} people`} last />
                {summary.currentQueue.is_congested && (
                  <div style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', padding: '0.5rem 0.7rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, marginTop: '0.6rem' }}>
                    ⚠ Queue congested — consider opening another counter.
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>No queue data yet — add a checkout zone and start monitoring.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: last ? 0 : '0.5rem' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
