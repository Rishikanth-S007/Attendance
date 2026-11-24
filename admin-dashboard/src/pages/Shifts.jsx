import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { errMsg } from '../lib/download';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const blank = { name: '', startTime: '09:00', endTime: '18:00', graceMinutes: 10, halfDayLateMinutes: 120, halfDayWorkedMinutes: 240, overtimeAfterMinutes: 30, workingDays: [1, 2, 3, 4, 5], isDefault: false };

export default function Shifts() {
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState(null); // null = hidden
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = () => client.get('/config/shifts').then((r) => setShifts(r.data.shifts)).catch((e) => setError(errMsg(e, 'Could not load shifts')));
  useEffect(() => { load(); }, []);

  const num = (k) => (e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const toggleDay = (d) => setForm({ ...form, workingDays: form.workingDays.includes(d) ? form.workingDays.filter((x) => x !== d) : [...form.workingDays, d].sort() });

  async function save(e) {
    e.preventDefault();
    setError('');
    const { _id, __v, createdAt, updatedAt, status, ...body } = form;
    try {
      if (editId) await client.put(`/config/shifts/${editId}`, body);
      else await client.post('/config/shifts', body);
      setForm(null); setEditId(null); load();
    } catch (err) { setError(errMsg(err, 'Could not save shift')); }
  }

  async function remove(s) {
    if (!confirm(`Delete shift "${s.name}"?`)) return;
    try { await client.delete(`/config/shifts/${s._id}`); load(); } catch (err) { setError(errMsg(err, 'Could not delete shift')); }
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Shifts</h1><p className="sub">Working hours and late rules. Employees without a shift use the default.</p></div>
        <button className="btn" onClick={() => { setForm(form ? null : { ...blank }); setEditId(null); }}>{form ? 'Cancel' : '+ New shift'}</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {form && (
        <form className="panel" onSubmit={save}>
          <h3 style={{ marginBottom: 12 }}>{editId ? 'Edit shift' : 'New shift'}</h3>
          <div className="form-grid">
            <div className="field"><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Start</label><input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
            <div className="field"><label>End</label><input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
            <div className="field"><label>Grace period (min)</label><input type="number" min="0" value={form.graceMinutes} onChange={num('graceMinutes')} /></div>
            <div className="field"><label>Half day if later than (min)</label><input type="number" min="0" value={form.halfDayLateMinutes} onChange={num('halfDayLateMinutes')} /></div>
            <div className="field"><label>Half day if worked less than (min)</label><input type="number" min="0" value={form.halfDayWorkedMinutes} onChange={num('halfDayWorkedMinutes')} /></div>
            <div className="field"><label>Overtime after end (min)</label><input type="number" min="0" value={form.overtimeAfterMinutes} onChange={num('overtimeAfterMinutes')} /></div>
          </div>
          <div className="field"><label>Working days</label>
            <div className="day-chips">{DAYS.map((d, i) => (
              <label key={d}><input type="checkbox" checked={form.workingDays.includes(i)} onChange={() => toggleDay(i)} /> {d}</label>
            ))}</div></div>
          <label style={{ fontSize: 14 }}><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Default shift</label>
          <div style={{ marginTop: 14 }}><button className="btn" type="submit">Save shift</button></div>
        </form>
      )}

      <div className="panel table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Hours</th><th>Grace</th><th>Half-day rules</th><th>Days</th><th></th></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s._id}>
                <td>{s.name} {s.isDefault && <span className="badge active">default</span>}</td>
                <td>{s.startTime}–{s.endTime}</td>
                <td>{s.graceMinutes} min</td>
                <td className="muted">late &gt; {s.halfDayLateMinutes}m or worked &lt; {s.halfDayWorkedMinutes}m</td>
                <td>{s.workingDays.map((d) => DAYS[d]).join(' ')}</td>
                <td className="row-actions">
                  <button className="btn small secondary" onClick={() => { setForm({ ...blank, ...s }); setEditId(s._id); }}>Edit</button>
                  <button className="btn small danger" onClick={() => remove(s)}>Delete</button>
                </td>
              </tr>
            ))}
            {shifts.length === 0 && <tr><td colSpan={6} className="muted">No shifts yet. Create one and mark it as default.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
