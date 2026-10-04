import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../services/api';

export default function Reports() {
  const [range, setRange] = useState('weekly');
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  function load() {
    setStatus('loading');
    api
      .get('/analytics/reports', { params: { range } })
      .then(({ data }) => {
        setReport(data);
        setStatus('ready');
      })
      .catch((err) => {
        setErrorMsg(getErrorMessage(err));
        setStatus('error');
      });
  }

  useEffect(load, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = report?.report?.reduce(
    (acc, r) => ({
      footfall: acc.footfall + Number(r.footfall),
      transactions: acc.transactions + Number(r.transactions),
      revenue: acc.revenue + Number(r.revenue),
      congested: acc.congested + Number(r.congested_samples),
    }),
    { footfall: 0, transactions: 0, revenue: 0, congested: 0 }
  );

  return (
    <div style={{ padding: '1.8rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Reports</h1>
          <p style={{ color: 'var(--color-ink-soft)' }}>Day-by-day operational breakdown.</p>
        </div>
        <select className="select" style={{ maxWidth: 180 }} value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="daily">Today</option>
          <option value="weekly">Last 7 days</option>
          <option value="monthly">Last 30 days</option>
        </select>
      </div>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{errorMsg}</p>}

      {status === 'ready' && totals && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ padding: '1.1rem' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{totals.footfall}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-soft)' }}>Total footfall</div>
            </div>
            <div className="card" style={{ padding: '1.1rem' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{totals.transactions}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-soft)' }}>Total transactions</div>
            </div>
            <div className="card" style={{ padding: '1.1rem' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>₹{totals.revenue.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-soft)' }}>Total revenue</div>
            </div>
            <div className="card" style={{ padding: '1.1rem' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {totals.footfall > 0 ? `${((totals.transactions / totals.footfall) * 100).toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-soft)' }}>Conversion rate</div>
            </div>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Footfall</th><th>Transactions</th><th>Revenue</th><th>Conversion</th><th>Congested samples</th></tr>
              </thead>
              <tbody>
                {report.report.map((r) => {
                  const footfall = Number(r.footfall);
                  const txns = Number(r.transactions);
                  const conv = footfall > 0 ? `${((txns / footfall) * 100).toFixed(1)}%` : '—';
                  return (
                    <tr key={r.day}>
                      <td>{new Date(r.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>{footfall}</td>
                      <td>{txns}</td>
                      <td>₹{Number(r.revenue).toLocaleString('en-IN')}</td>
                      <td>{conv}</td>
                      <td>{r.congested_samples > 0 ? <span className="badge badge-warn">{r.congested_samples}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
