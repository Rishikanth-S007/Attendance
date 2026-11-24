import React, { useState } from 'react';
import { downloadReport, errMsg } from '../lib/download';

const first = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
const today = () => new Date().toLocaleDateString('en-CA');

export default function Reports() {
  const [f, setF] = useState({ startDate: first(), endDate: today(), employeeId: '', department: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function get(kind, format) {
    setError(''); setBusy(`${kind}-${format}`);
    const params = { format, startDate: f.startDate, endDate: f.endDate };
    if (f.employeeId) params.employeeId = f.employeeId;
    if (f.department) params.department = f.department;
    try { await downloadReport(`/reports/${kind}`, params, `${kind}.${format}`); }
    catch (err) {
      let msg = errMsg(err, 'Download failed');
      if (err.response?.data instanceof Blob) { try { msg = JSON.parse(await err.response.data.text()).message; } catch { /* keep default */ } }
      setError(msg);
    } finally { setBusy(''); }
  }

  const buttons = (kind) => ['xlsx', 'pdf', 'csv'].map((fmt) => (
    <button key={fmt} className="btn secondary" disabled={!!busy} onClick={() => get(kind, fmt)}>{busy === `${kind}-${fmt}` ? 'Preparing…' : fmt.toUpperCase()}</button>
  ));

  return (
    <div>
      <div className="page-header"><div><h1>Reports</h1><p className="sub">Download attendance as Excel, PDF or CSV</p></div></div>
      <div className="panel">
        <div className="form-grid">
          <div className="field"><label>From</label><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
          <div className="field"><label>To</label><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
          <div className="field"><label>Employee ID (optional)</label><input value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} /></div>
          <div className="field"><label>Department (optional)</label><input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
      <div className="panel">
        <h3>Attendance register</h3>
        <p className="muted" style={{ margin: '6px 0 14px' }}>One row per employee per day: times, worked hours, late minutes, status.</p>
        <div className="row-actions">{buttons('attendance')}</div>
      </div>
      <div className="panel">
        <h3>Employee summary</h3>
        <p className="muted" style={{ margin: '6px 0 14px' }}>Per employee totals: present, late, half days, leave, absent, overtime.</p>
        <div className="row-actions">{buttons('summary')}</div>
      </div>
    </div>
  );
}
