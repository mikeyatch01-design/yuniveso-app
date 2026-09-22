(function () {
  const btn = document.getElementById('signInBtn');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const errEl = document.getElementById('loginError');

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
        body: JSON.stringify({ email, password }),
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
})();
