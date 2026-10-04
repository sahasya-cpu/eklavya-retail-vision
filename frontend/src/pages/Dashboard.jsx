import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';
import { api, getErrorMessage } from '../services/api';

function formatSeconds(s) {
  if (!s) return '0s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  function load() {
    setStatus('loading');
    Promise.all([api.get('/analytics/summary'), api.get('/analytics/reports', { params: { range: 'weekly' } })])
      .then(([summaryRes, reportRes]) => {
        setSummary(summaryRes.data);
        setReport(reportRes.data);
        setStatus('ready');
      })
      .catch((err) => {
        setErrorMsg(getErrorMessage(err));
        setStatus('error');
      });
  }

  useEffect(load, []);

  if (status === 'loading') return <div style={{ padding: '2rem' }}>Loading…</div>;
  if (status === 'error') {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--color-danger)' }}>{errorMsg}</p>
        <button className="btn btn-outline" onClick={load}>Try again</button>
      </div>
    );
  }

  const kpis = [
    { label: "Today's footfall", value: summary.todayFootfall, icon: '🚶' },
    { label: 'Currently in store', value: summary.currentOccupancy, icon: '🧍' },
    { label: 'Avg. dwell time', value: formatSeconds(summary.avgDwellSeconds), icon: '⏱️' },
    { label: 'Conversion rate', value: summary.conversionRate != null ? `${summary.conversionRate}%` : '—', icon: '🛒' },
  ];

  const trend = (report?.report || []).map((r) => ({
    day: new Date(r.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    footfall: Number(r.footfall),
    revenue: Number(r.revenue),
  }));

  return (
    <div style={{ padding: '1.8rem 2rem' }}>
      <h1 style={{ fontSize: '1.8rem' }}>Store Operations Dashboard</h1>
      <p style={{ color: 'var(--color-ink-soft)', marginBottom: '1.5rem' }}>Live, on-device shopper and queue intelligence.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.8rem' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card" style={{ padding: '1.2rem 1.4rem' }}>
            <div style={{ fontSize: '1.4rem' }}>{k.icon}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', margin: '0.3rem 0' }}>{k.value}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-soft)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {summary.currentQueue?.is_congested && (
        <div className="card" style={{ padding: '1rem 1.4rem', marginBottom: '1.5rem', background: 'var(--color-danger-soft)', borderColor: 'var(--color-danger)' }}>
          ⚠ <strong>Queue congestion detected</strong> — last sample showed {summary.currentQueue.queue_length} people waiting. Consider opening another counter.
        </div>
      )}

      {summary.activeShelfAlerts?.length > 0 && (
        <div className="card" style={{ padding: '1rem 1.4rem', marginBottom: '1.5rem', background: 'var(--color-warning-soft)', borderColor: 'var(--color-warning)' }}>
          📦 <strong>{summary.activeShelfAlerts.length} shelf alert(s)</strong> — {summary.activeShelfAlerts.map((a) => a.product_label || a.zone_name).join(', ')} running low.
          <Link to="/shelf" style={{ marginLeft: '0.6rem', color: 'var(--color-primary)', fontWeight: 600 }}>View →</Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.2rem', marginBottom: '1.8rem' }}>
        <div className="card" style={{ padding: '1.4rem' }}>
          <h3 style={{ fontSize: '1rem' }}>Footfall — last 7 days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="footfall" stroke="#16305C" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: '1.4rem' }}>
          <h3 style={{ fontSize: '1rem' }}>Revenue — last 7 days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `₹${v}`} />
              <Bar dataKey="revenue" fill="#E88A1F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {summary.dwellByZone?.length > 0 && (
        <div className="card" style={{ padding: '1.4rem' }}>
          <h3 style={{ fontSize: '1rem' }}>Dwell by zone (today)</h3>
          {summary.dwellByZone.map((z) => (
            <div key={z.zone} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.88rem' }}>
              <span>{z.zone}</span>
              <strong>{formatSeconds(z.avgSeconds)} avg · {z.samples} samples</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
