// ============================================================
// File:        LoginPage.jsx
// Path:        client/src/pages/LoginPage.jsx
// Project:     Seasonal Entertainment
// Description: Login form. After success it returns to the page that sent the visitor here
//              (?next=, same-site paths only) or to the account page.
// ============================================================

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';

// Only local paths: "//evil.example" or "https://..." would be an open redirect.
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}

export default function LoginPage() {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/login', {
        method: 'POST',
        body: { username: form.get('username'), password: form.get('password') },
      });
      setUser(user);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <h1>Login</h1>
      <form className="form" onSubmit={onSubmit}>
        <FormField label="Username" name="username" type="text" autoComplete="username" required />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormMessage error={error} />
        <button className="button" type="submit" disabled={busy}>
          Log in
        </button>
      </form>
      <p>
        No account yet? <Link to="/register">Register</Link>
      </p>
    </section>
  );
}
