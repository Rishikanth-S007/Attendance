import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { downloadReport, errMsg, fmtTime, minutesToHm, todayKey } from '../lib/download';

const toLocalInput = (ts) => {
  if (!ts) return '';
  const d = new Date(ts.timestamp || ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Filter, review, back-fill and correct attendance. Times are recalculated by the server.
export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ date: '', employeeId: '', status: '', outcome: '' });
  const [editing, setEditing] = useState(null); // {id, checkIn, checkOut}
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ employeeId: '', date: todayKey(), checkIn: '', checkOut: '' });
  const [error, setError] = useState('');

  async function load() {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    try {
      const { data } = await client.get('/attendance', { params });
      setRecords(data.records);
    } catch (err) { setError(errMsg(err, 'Could not load attendance')); }
  }
  useEffect(() => { load(); }, [filters]);

  async function saveEdit() {
    setError('');
    try {
      await client.put(`/attendance/${editing.id}`, {
        checkIn: { timestamp: new Date(editing.checkIn).toISOString() },
        checkOut: editing.checkOut ? { timestamp: new Date(editing.checkOut).toISOString() } : null,
      });
      setEditing(null);
      load();
    } catch (err) { setError(errMsg(err, 'Could not update record')); }
  }

  async function addRecord(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/attendance', {
        employeeId: form.employeeId.trim(),
        date: form.date,
        checkIn: new Date(`${form.date}T${form.checkIn}`).toISOString(),
        checkOut: form.checkOut ? new Date(`${form.date}T${form.checkOut}`).toISOString() : null,
      });
      setAdding(false);
      setForm({ employeeId: '', date: todayKey(), checkIn: '', checkOut: '' });
      load();
    } catch (err) { setError(errMsg(err, 'Could not add record')); }
  }

  const exportFile = (format) => downloadReport('/reports/attendance', { format, startDate: filters.date || undefined, endDate: filters.date || undefined, employeeId: filters.employeeId || undefined }, `attendance.${format}`).catch((err) => setError(errMsg(err, 'Export failed')));

  return (
    <div>
      <div className="page-header">
        <div><h1>Attendance</h1><p className="sub">Filter, review, back-fill and correct records</p></div>
        <div className="row-actions">
          <button className="btn" onClick={() => setAdding((s) => !s)}>{adding ? 'Cancel' : '+ Add record'}</button>
          <button className="btn secondary" onClick={() => exportFile('xlsx')}>Excel</button>
          <button className="btn secondary" onClick={() => exportFile('pdf')}>PDF</button>
          <button className="btn secondary" onClick={() => exportFile('csv')}>CSV</button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {adding && (
        <form className="panel" onSubmit={addRecord}>
          <h3 style={{ marginBottom: 12 }}>Back-fill a missed record</h3>
          <div className="form-grid">
            <div className="field"><label>Employee ID</label><input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></div>
            <div className="field"><label>Date</label><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Check-in time</label><input type="time" required value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></div>
            <div className="field"><label>Check-out time (optional)</label><input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></div>
          </div>
          <button className="btn" type="submit">Save record</button>
        </form>
      )}

      <div className="panel row">
        <div className="field"><label>Date</label><input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></div>
        <div className="field"><label>Employee ID</label><input value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })} /></div>
        <div className="field"><label>Status</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option><option value="present">present</option><option value="checked_out">checked_out</option><option value="on_leave">on_leave</option><option value="absent">absent</option>
          </select></div>
        <div className="field"><label>Punctuality</label>
          <select value={filters.outcome} onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}>
            <option value="">All</option><option value="on_time">on time</option><option value="late">late</option><option value="half_day">half day</option>
          </select></div>
      </div>

      <div className="panel table-scroll">
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Worked</th><th>Overtime</th><th>Status</th><th>Punctuality</th><th>Location</th><th></th></tr></thead>
          <tbody>
            {records.map((r) => (
              <tr key={r._id}>
                <td>{r.employeeId}</td>
                <td>{r.date}</td>
                {editing?.id === r._id ? (
                  <>
                    <td><input type="datetime-local" value={editing.checkIn} onChange={(e) => setEditing({ ...editing, checkIn: e.target.value })} /></td>
                    <td><input type="datetime-local" value={editing.checkOut} onChange={(e) => setEditing({ ...editing, checkOut: e.target.value })} /></td>
                    <td colSpan={5} className="muted">Recalculated on save</td>
                    <td className="row-actions">
                      <button className="btn small" onClick={saveEdit}>Save</button>
                      <button className="btn small secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{fmtTime(r.checkIn)}</td>
                    <td>{fmtTime(r.checkOut)}</td>
                    <td>{minutesToHm(r.workedMinutes)}</td>
                    <td>{r.overtimeMinutes ? `${r.overtimeMinutes}m` : '--'}</td>
                    <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                    <td>{r.outcome ? <span className={`badge ${r.outcome}`}>{r.outcome === 'late' ? `late ${r.lateMinutes}m` : r.outcome.replace('_', ' ')}</span> : '--'}</td>
                    <td className="muted">{r.checkIn?.location?.distanceMeters != null ? `${Math.round(r.checkIn.location.distanceMeters)} m` : '--'}</td>
                    <td><button className="btn small secondary" onClick={() => setEditing({ id: r._id, checkIn: toLocalInput(r.checkIn), checkOut: toLocalInput(r.checkOut) })}>Correct</button></td>
                  </>
                )}
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={10} className="muted">No records match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
