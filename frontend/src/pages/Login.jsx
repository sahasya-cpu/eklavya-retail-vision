import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('demo@eklavya.com');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success('Welcome back!');
    navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
  }

  return (
    <AuthLayout title="Eklavya Retail Vision" subtitle="Sign in to your store console">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ marginTop: '1.2rem', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
        Demo account: <code>demo@eklavya.com</code> / <code>password123</code>
      </p>
      <p style={{ marginTop: '0.4rem', fontSize: '0.88rem' }}>
        New store? <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'radial-gradient(circle at 15% 15%, var(--color-primary-soft), transparent 45%), var(--color-bg)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: '2.2rem' }}>
        <div style={{ fontSize: '1.6rem', marginBottom: '0.3rem' }}>🏹</div>
        <h1 style={{ fontSize: '1.4rem' }}>{title}</h1>
        <p style={{ color: 'var(--color-ink-soft)', marginBottom: '1.5rem' }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
