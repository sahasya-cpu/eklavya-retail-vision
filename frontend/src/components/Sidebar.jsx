import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/vision', label: 'Store Vision', icon: '📹' },
  { to: '/shelf', label: 'Shelf Monitor', icon: '🗂️' },
  { to: '/reports', label: 'Reports', icon: '📈' },
];

export default function Sidebar() {
  const { user, store, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        flexShrink: 0,
        background: 'var(--color-primary-dark)',
        color: '#EDF1F7',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '1.4rem 1.3rem 1rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          🏹 Eklavya
        </div>
        <div style={{ fontSize: '0.72rem', opacity: 0.65, marginTop: '0.15rem' }}>Retail Vision</div>
        {store && (
          <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.7rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.08)', borderRadius: 8 }}>
            📍 {store.name}
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: '0.5rem 0.7rem' }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.65rem 0.9rem',
              borderRadius: 8,
              marginBottom: '0.2rem',
              fontWeight: 600,
              fontSize: '0.9rem',
              color: isActive ? '#fff' : '#B9C4D6',
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
            })}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '1rem 1.3rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.name}</div>
        <div style={{ fontSize: '0.75rem', opacity: 0.65, marginBottom: '0.7rem' }}>{user?.email}</div>
        <button
          className="btn btn-outline btn-sm btn-block"
          style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
