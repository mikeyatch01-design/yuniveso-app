// A stylesheet <link> to Google Fonts in <head> is render-blocking — the
// browser holds first paint (including this page's own already-downloaded
// CSS) until it resolves. Injecting it from script means a slow/failed
// font fetch degrades to "system font", not "unstyled page". See app.js.
(function loadWebFonts() {
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
})();

(function () {
  const btn = document.getElementById('signInBtn');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const errEl = document.getElementById('loginError');
  const rememberEl = document.getElementById('rememberCheckbox');

  function showError(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  async function submit() {
    errEl.style.display = 'none';
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) return showError('Enter your email and password.');

    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember: rememberEl.checked }),
      });
      const data = await res.json();
      if (!res.ok) return showError(data.error || 'Sign in failed.');
      window.location.href = data.redirect;
    } catch (err) {
      showError('Could not reach the server. Please try again.');
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', submit);
  passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  // No email service exists to send a real reset link, so this is an
  // honest substitute: confirm the request without ever revealing
  // whether that email has an account (avoids leaking who's a user).
  document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = prompt('Enter your work email — your firm admin will be notified to reset your password.');
    if (!email) return;
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch (err) { /* still show the same message either way */ }
    alert("If that email has an account, your firm admin can reset your password from User Management. There's no automated email reset in this environment yet.");
  });

  document.getElementById('ssoButton').addEventListener('click', () => {
    alert('Single sign-on is not configured for this account yet — sign in with your email and password.');
  });
})();
