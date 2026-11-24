import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { errMsg } from '../lib/download';

const blank = { employeeId: '', type: 'casual', startDate: '', endDate: '', reason: '', autoApprove: true };

export default function Leaves() {
  const [leaves, setLeaves] = useState([]);
  const [status, setStatus] = useState('pending');
  const [form, setForm] = useState(null);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState('');

  const load = () => client.get('/leaves', { params: status ? { status } : {} }).then((r) => setLeaves(r.data.leaves)).catch((e) => setError(errMsg(e, 'Could not load leave')));
  useEffect(() => { load(); }, [status]);

  async function decide(l, s) {
    const note = s === 'rejected' ? (prompt('Reason for rejection (optional)') ?? '') : '';
    setError('');
    try { await client.patch(`/leaves/${l._id}/decision`, { status: s, note }); load(); } catch (err) { setError(errMsg(err, 'Could not update')); }
  }
  async function cancel(l) {
    if (!confirm('Cancel this leave?')) return;
    try { await client.post(`/leaves/${l._id}/cancel`); load(); } catch (err) { setError(errMsg(err, 'Could not cancel')); }
  }
  async function create(e) {
    e.preventDefault(); setError('');
    try { await client.post('/leaves', form); setForm(null); load(); } catch (err) { setError(errMsg(err, 'Could not create leave')); }
  }
  async function showBalance(id) {
    try { const { data } = await client.get(`/leaves/balance/${id}`); setBalance({ id, rows: data.balance }); } catch (err) { setError(errMsg(err, 'Could not load balance')); }
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Leave</h1><p className="sub">Approve requests from the app, or record leave directly</p></div>
        <button className="btn" onClick={() => setForm(form ? null : { ...blank })}>{form ? 'Cancel' : '+ Record leave'}</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {form && (
        <form className="panel" onSubmit={create}>
          <div className="form-grid">
            <div className="field"><label>Employee ID</label><input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></div>
            <div className="field"><label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="casual">Casual</option><option value="sick">Sick</option><option value="earned">Earned</option><option value="unpaid">Unpaid</option>
              </select></div>
            <div className="field"><label>From</label><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="field"><label>To</label><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            <div className="field"><label>Reason</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <label style={{ fontSize: 14 }}><input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} /> Approve immediately</label>
          <div style={{ marginTop: 12 }}><button className="btn" type="submit">Save</button></div>
        </form>
      )}

      {balance && (
        <div className="panel">
          <h3 style={{ marginBottom: 8 }}>Balance — {balance.id}</h3>
          <table>
            <thead><tr><th>Type</th><th>Allowance</th><th>Used</th><th>Pending</th><th>Remaining</th></tr></thead>
            <tbody>{balance.rows.map((b) => (
              <tr key={b.type}><td>{b.type}</td><td>{b.allowance ?? '∞'}</td><td>{b.used}</td><td>{b.pending}</td><td>{b.remaining ?? '∞'}</td></tr>
            ))}</tbody>
          </table>
          <button className="btn small secondary" style={{ marginTop: 8 }} onClick={() => setBalance(null)}>Close</button>
        </div>
      )}

      <div className="panel row">
        <div className="field"><label>Show</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="">All</option>
          </select></div>
      </div>

      <div className="panel table-scroll">
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l._id}>
                <td><a href="#" onClick={(e) => { e.preventDefault(); showBalance(l.employeeId); }}>{l.employeeId}</a></td>
                <td>{l.type}</td>
                <td>{l.startDate}{l.endDate !== l.startDate ? ` → ${l.endDate}` : ''}</td>
                <td>{l.days}</td>
                <td className="muted">{l.reason || '--'}</td>
                <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                <td className="row-actions">
                  {l.status === 'pending' && <>
                    <button className="btn small" onClick={() => decide(l, 'approved')}>Approve</button>
                    <button className="btn small danger" onClick={() => decide(l, 'rejected')}>Reject</button>
                  </>}
                  {l.status === 'approved' && <button className="btn small secondary" onClick={() => cancel(l)}>Cancel</button>}
                </td>
              </tr>
            ))}
            {leaves.length === 0 && <tr><td colSpan={7} className="muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
