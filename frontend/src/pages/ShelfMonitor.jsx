import { useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { computeRegionStats, estimateFilledRatio } from '../utils/shelfVision';

const CHECK_INTERVAL_MS = 10000;

export default function ShelfMonitor() {
  const toast = useToast();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const checkTimerRef = useRef(null);

  const [shelfZones, setShelfZones] = useState([]);
  const [status, setStatus] = useState('loading');
  const [cameraOn, setCameraOn] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [draftRect, setDraftRect] = useState(null);
  const [productLabel, setProductLabel] = useState('');
  const [activeMonitorId, setActiveMonitorId] = useState(null); // which shelf is being live-checked

  function loadShelfZones() {
    setStatus('loading');
    api
      .get('/shelf-zones')
      .then(({ data }) => {
        setShelfZones(data.shelfZones);
        setStatus('ready');
      })
      .catch((err) => {
        toast.error(getErrorMessage(err));
        setStatus('error');
      });
  }

  useEffect(loadShelfZones, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);
    } catch (err) {
      toast.error('Could not access the camera: ' + err.message);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
    setDraftRect(null);
  }

  useEffect(() => stopCamera, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    setDrawStart({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
    setDraftRect(null);
  }

  function handleMouseUp(e) {
    if (!drawStart) return;
    const rectEl = canvasRef.current.getBoundingClientRect();
    const end = { x: (e.clientX - rectEl.left) / rectEl.width, y: (e.clientY - rectEl.top) / rectEl.height };
    const x = Math.min(drawStart.x, end.x);
    const y = Math.min(drawStart.y, end.y);
    const width = Math.abs(end.x - drawStart.x);
    const height = Math.abs(end.y - drawStart.y);
    if (width > 0.03 && height > 0.03) setDraftRect({ x, y, width, height });
    setDrawStart(null);
  }

  async function captureBaseline() {
    if (!draftRect || !videoRef.current) {
      toast.error('Draw a rectangle over the shelf region first.');
      return;
    }
    try {
      const stats = computeRegionStats(videoRef.current, draftRect);
      const zoneRes = await api.post('/zones', { name: productLabel || 'Shelf Zone', zone_type: 'SHELF', geometry: draftRect });
      await api.post('/shelf-zones', {
        zone_id: zoneRes.data.zone.id,
        product_label: productLabel || null,
        baseline_profile: stats,
        low_stock_threshold: 0.4,
      });
      toast.success('Baseline captured — this shelf is now monitored.');
      setDraftRect(null);
      setProductLabel('');
      loadShelfZones();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function runCheckNow(shelf) {
    if (!videoRef.current || !cameraOn) {
      toast.error('Turn on the camera and point it at this shelf first.');
      return;
    }
    const geometry = shelf._geometry || { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
    const stats = computeRegionStats(videoRef.current, geometry);
    const filledRatio = estimateFilledRatio(shelf.baseline_profile, stats);
    try {
      const { data } = await api.post(`/shelf-zones/${shelf.id}/check`, { filled_ratio: filledRatio });
      if (data.status === 'ALERT_RAISED') toast.error(`Low stock detected: ${shelf.product_label || shelf.zone_name}`);
      if (data.status === 'ALERT_RESOLVED') toast.success(`Restocked: ${shelf.product_label || shelf.zone_name}`);
      loadShelfZones();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  function toggleLiveMonitor(shelf) {
    if (activeMonitorId === shelf.id) {
      clearInterval(checkTimerRef.current);
      setActiveMonitorId(null);
      return;
    }
    clearInterval(checkTimerRef.current);
    setActiveMonitorId(shelf.id);
    checkTimerRef.current = setInterval(() => runCheckNow(shelf), CHECK_INTERVAL_MS);
  }

  return (
    <div style={{ padding: '1.8rem 2rem' }}>
      <h1 style={{ fontSize: '1.8rem' }}>Shelf Monitor</h1>
      <p style={{ color: 'var(--color-ink-soft)', marginBottom: '0.4rem' }}>
        Simplified, on-device out-of-stock detection: capture a "fully stocked" reference once, and the system
        flags when a shelf looks significantly emptier.
      </p>
      <p style={{ color: 'var(--color-ink-soft)', fontSize: '0.82rem', marginBottom: '1.2rem', fontStyle: 'italic' }}>
        Note: this compares visual texture/fill density against your reference photo — it's a lightweight proof
        of concept, not true product recognition (that would need a custom-trained model and a real shelf-image
        dataset).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.2rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
            {!cameraOn ? (
              <button className="btn btn-primary" onClick={startCamera}>▶ Turn on camera</button>
            ) : (
              <button className="btn btn-danger" onClick={stopCamera}>■ Turn off camera</button>
            )}
          </div>
          <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block' }} />
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
            />
            {draftRect && (
              <div
                style={{
                  position: 'absolute',
                  left: `${draftRect.x * 100}%`,
                  top: `${draftRect.y * 100}%`,
                  width: `${draftRect.width * 100}%`,
                  height: `${draftRect.height * 100}%`,
                  border: '2px solid #E88A1F',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-ink-soft)', marginTop: '0.6rem' }}>
            Draw a rectangle over a shelf region while it's fully stocked, then capture it as the reference.
          </p>
          {draftRect && (
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem', alignItems: 'center' }}>
              <input
                className="input"
                placeholder="Product name (e.g. Lays Chips)"
                value={productLabel}
                onChange={(e) => setProductLabel(e.target.value)}
                style={{ maxWidth: 240 }}
              />
              <button className="btn btn-accent" onClick={captureBaseline}>📸 Capture as baseline</button>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Monitored shelves</h3>
          {status === 'loading' && <p>Loading…</p>}
          {status === 'ready' && shelfZones.length === 0 && (
            <p style={{ color: 'var(--color-ink-soft)', fontSize: '0.88rem' }}>No shelves configured yet — draw one on the camera view.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {shelfZones.map((shelf) => (
              <div key={shelf.id} className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{shelf.product_label || shelf.zone_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-soft)' }}>
                      Last reading: {shelf.last_filled_ratio != null ? `${Math.round(shelf.last_filled_ratio * 100)}% filled` : 'not checked yet'}
                    </div>
                  </div>
                  {shelf.has_active_alert ? (
                    <span className="badge badge-danger">Low stock</span>
                  ) : (
                    <span className="badge badge-ok">OK</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => runCheckNow({ ...shelf, _geometry: shelf.geometry })} disabled={!cameraOn}>
                    Check now
                  </button>
                  <button
                    className={`btn btn-sm ${activeMonitorId === shelf.id ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => toggleLiveMonitor({ ...shelf, _geometry: shelf.geometry })}
                    disabled={!cameraOn}
                  >
                    {activeMonitorId === shelf.id ? 'Stop auto-check' : 'Auto-check every 10s'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
