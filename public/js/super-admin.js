(async function () {
  const user = await requireSession(['super_admin']);
  if (!user) return;

  try {
    const { kpis, organizations } = await apiGet('/api/dashboard');

    document.getElementById('kpiOrgs').textContent = kpis.organizations;
    document.getElementById('kpiClients').textContent = kpis.clients;
    document.getElementById('kpiAudits').textContent = kpis.audits;
    document.getElementById('kpiEmployees').textContent = kpis.employees;

    const tbody = document.getElementById('orgsTableBody');
    if (!organizations.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="cell-sub">No organizations yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = organizations.map(o => `
      <tr>
        <td><b>${escapeHtml(o.name)}</b><div class="cell-sub">${escapeHtml(o.industry)}</div></td>
        <td>${escapeHtml(o.plan)}</td>
        <td>${o.admins}</td>
        <td>${o.clients}</td>
        <td>${o.active_audits}</td>
        <td class="mono">$${Number(o.mrr).toLocaleString('en-US')}</td>
        <td>${statusBadge(o.status)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
})();
