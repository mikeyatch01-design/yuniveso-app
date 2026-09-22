(async function () {
  const user = await requireSession(['auditor']);
  if (!user) return;

  document.getElementById('greeting').textContent = `Your engagements, ${user.name.split(' ')[0]}`;

  try {
    const { kpis, audits } = await apiGet('/api/dashboard');

    document.getElementById('kpiAssigned').textContent = kpis.assigned_audits;
    document.getElementById('kpiFindings').textContent = kpis.findings_logged;
    document.getElementById('greetingSub').textContent =
      `${kpis.assigned_audits} audit${kpis.assigned_audits === 1 ? '' : 's'} assigned`;

    const tbody = document.getElementById('auditsTableBody');
    tbody.innerHTML = audits.length ? audits.map(a => `
      <tr>
        <td><a href="audit-details.html?id=${a.id}"><b>${escapeHtml(a.title)}</b></a></td>
        <td>${escapeHtml(a.client_name)}</td>
        <td>${escapeHtml(a.phase)}</td>
        <td>${formatDate(a.target_date)}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="cell-sub">No audits assigned yet.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
})();
