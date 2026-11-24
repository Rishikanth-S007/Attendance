import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { errMsg } from '../lib/download';

// Paired kiosks / phones. The raw key is shown once, at creation.
export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState('');

  const load = () => client.get('/config/devices').then((r) => setDevices(r.data.devices)).catch((e) => setError(errMsg(e, 'Could not load devices (super admin only)')));
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault(); setError('');
    try { const { data } = await client.post('/config/devices', { name }); setNewKey({ name: data.device.name, key: data.key }); setName(''); load(); }
    catch (err) { setError(errMsg(err, 'Could not create device')); }
  }
  async function revoke(d) {
    if (!confirm(`Revoke "${d.name}"? It will stop working immediately.`)) return;
    try { await client.delete(`/config/devices/${d._id}`); load(); } catch (err) { setError(errMsg(err, 'Could not revoke')); }
  }

  return (
    <div>
      <div className="page-header"><div><h1>Devices</h1><p className="sub">Each phone or kiosk needs a device key to check in. Revoke a key if a device is lost.</p></div></div>
      {error && <p className="error-text">{error}</p>}
      {newKey && (
        <div className="notice">
          <strong>Key for "{newKey.name}" — copy it now, it will not be shown again.</strong>
          <code>{newKey.key}</code>
          <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => setNewKey(null)}>I have copied it</button>
        </div>
      )}
      <form className="panel row" onSubmit={create}>
        <div className="field"><label>Device name</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front desk tablet" /></div>
        <div className="field"><button className="btn" type="submit">Generate key</button></div>
      </form>
      <div className="panel table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Key</th><th>Status</th><th>Last seen</th><th></th></tr></thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d._id}>
                <td>{d.name}</td><td className="muted">{d.keyPrefix}…</td>
                <td><span className={`badge ${d.status}`}>{d.status}</span></td>
                <td className="muted">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'never'}</td>
                <td>{d.status === 'active' && <button className="btn small danger" onClick={() => revoke(d)}>Revoke</button>}</td>
              </tr>
            ))}
            {devices.length === 0 && <tr><td colSpan={5} className="muted">No devices paired yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
