(async function () {
  const user = await requireSession(['admin']);
  if (!user) return;

  const fName = document.getElementById('fName');
  const fIndustry = document.getElementById('fIndustry');
  const planDisplay = document.getElementById('planDisplay');
  const errEl = document.getElementById('settingsError');
  const okEl = document.getElementById('settingsSuccess');
  const submitBtn = document.getElementById('settingsSubmitBtn');

  const { organizations } = await apiGet('/api/organizations');
  const org = organizations[0];
  if (!org) return;
  fName.value = org.name;
  fIndustry.value = org.industry;
  planDisplay.textContent = `${org.plan} · ${statusBadge(org.status).replace(/<[^>]+>/g, '')}`;
  planDisplay.innerHTML = `${escapeHtml(org.plan)} &middot; ${statusBadge(org.status)}`;

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    okEl.style.display = 'none';
    submitBtn.disabled = true;
    try {
      await apiPatch(`/api/organizations/${org.id}`, { name: fName.value.trim(), industry: fIndustry.value.trim() });
      okEl.textContent = 'Saved.';
      okEl.style.display = 'block';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
