import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { errMsg } from '../lib/download';

export default function Holidays() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ date: '', name: '' });
  const [error, setError] = useState('');

  const load = () => client.get('/config/holidays', { params: { year } }).then((r) => setHolidays(r.data.holidays)).catch((e) => setError(errMsg(e, 'Could not load holidays')));
  useEffect(() => { load(); }, [year]);

  async function add(e) {
    e.preventDefault(); setError('');
    try { await client.post('/config/holidays', form); setForm({ date: '', name: '' }); load(); }
    catch (err) { setError(errMsg(err, 'Could not add holiday')); }
  }
  async function remove(h) {
    try { await client.delete(`/config/holidays/${h._id}`); load(); } catch (err) { setError(errMsg(err, 'Could not remove')); }
  }

  return (
    <div>
      <div className="page-header"><div><h1>Holidays</h1><p className="sub">Holidays are not counted as absences or leave days</p></div>
        <div className="field" style={{ margin: 0 }}><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} /></div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <form className="panel row" onSubmit={add}>
        <div className="field"><label>Date</label><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div className="field"><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><button className="btn" type="submit">Add holiday</button></div>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th></th></tr></thead>
          <tbody>
            {holidays.map((h) => (<tr key={h._id}><td>{h.date}</td><td>{h.name}</td><td><button className="btn small danger" onClick={() => remove(h)}>Remove</button></td></tr>))}
            {holidays.length === 0 && <tr><td colSpan={3} className="muted">No holidays for {year}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
