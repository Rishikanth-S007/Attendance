import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { errMsg } from '../lib/download';

const blank = { name: '', latitude: '', longitude: '', radiusMeters: 150 };

// GPS geofencing: when at least one active office exists, check-in/out must be inside one.
export default function Offices() {
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = () => client.get('/config/offices').then((r) => setOffices(r.data.offices)).catch((e) => setError(errMsg(e, 'Could not load offices')));
  useEffect(() => { load(); }, []);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, latitude: +p.coords.latitude.toFixed(6), longitude: +p.coords.longitude.toFixed(6) })),
      () => setError('Could not read your location. Enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function save(e) {
    e.preventDefault(); setError('');
    const body = { name: form.name, latitude: Number(form.latitude), longitude: Number(form.longitude), radiusMeters: Number(form.radiusMeters) };
    try {
      if (editId) await client.put(`/config/offices/${editId}`, body); else await client.post('/config/offices', body);
      setForm(null); setEditId(null); load();
    } catch (err) { setError(errMsg(err, 'Could not save office')); }
  }
  async function toggle(o) {
    try { await client.put(`/config/offices/${o._id}`, { status: o.status === 'active' ? 'inactive' : 'active' }); load(); } catch (err) { setError(errMsg(err, 'Could not update')); }
  }
  async function remove(o) {
    if (!confirm(`Delete office "${o.name}"?`)) return;
    try { await client.delete(`/config/offices/${o._id}`); load(); } catch (err) { setError(errMsg(err, 'Could not delete')); }
  }

  const active = offices.filter((o) => o.status === 'active').length;

  return (
    <div>
      <div className="page-header">
        <div><h1>Offices</h1><p className="sub">Geofenced locations. {active ? `${active} active: check-ins must be inside one.` : 'None active: location is not enforced.'}</p></div>
        <button className="btn" onClick={() => { setForm(form ? null : { ...blank }); setEditId(null); }}>{form ? 'Cancel' : '+ Add office'}</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {form && (
        <form className="panel" onSubmit={save}>
          <div className="form-grid">
            <div className="field"><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Latitude</label><input required type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
            <div className="field"><label>Longitude</label><input required type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
            <div className="field"><label>Radius (m)</label><input required type="number" min="10" max="5000" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} /></div>
          </div>
          <div className="row-actions">
            <button className="btn secondary" type="button" onClick={useMyLocation}>Use my current location</button>
            <button className="btn" type="submit">Save office</button>
          </div>
        </form>
      )}
      <div className="panel table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Coordinates</th><th>Radius</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {offices.map((o) => (
              <tr key={o._id}>
                <td>{o.name}</td><td>{o.latitude}, {o.longitude}</td><td>{o.radiusMeters} m</td>
                <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                <td className="row-actions">
                  <button className="btn small secondary" onClick={() => { setForm({ ...o }); setEditId(o._id); }}>Edit</button>
                  <button className="btn small secondary" onClick={() => toggle(o)}>{o.status === 'active' ? 'Disable' : 'Enable'}</button>
                  <button className="btn small danger" onClick={() => remove(o)}>Delete</button>
                </td>
              </tr>
            ))}
            {offices.length === 0 && <tr><td colSpan={5} className="muted">No offices configured.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
