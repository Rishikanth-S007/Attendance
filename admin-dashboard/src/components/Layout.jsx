import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();
  const adminName = localStorage.getItem('admin_name') || 'Admin';

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Attend<span>ance</span></div>
        <nav>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
          <NavLink to="/employees" className={({ isActive }) => (isActive ? 'active' : '')}>Employees</NavLink>
          <NavLink to="/attendance" className={({ isActive }) => (isActive ? 'active' : '')}>Attendance</NavLink>
          <NavLink to="/leaves" className={({ isActive }) => (isActive ? 'active' : '')}>Leave</NavLink>
          <NavLink to="/reports" className={({ isActive }) => (isActive ? 'active' : '')}>Reports</NavLink>
          <NavLink to="/shifts" className={({ isActive }) => (isActive ? 'active' : '')}>Shifts</NavLink>
          <NavLink to="/holidays" className={({ isActive }) => (isActive ? 'active' : '')}>Holidays</NavLink>
          <NavLink to="/offices" className={({ isActive }) => (isActive ? 'active' : '')}>Offices</NavLink>
          <NavLink to="/devices" className={({ isActive }) => (isActive ? 'active' : '')}>Devices</NavLink>
        </nav>
        <div className="admin-info">
          Signed in as {adminName}
          <div>
            <button className="btn secondary" style={{ marginTop: 10, width: '100%' , color:'rgb(114, 187, 187)'}} onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
