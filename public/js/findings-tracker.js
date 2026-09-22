(async function () {
  const user = await requireSession(['admin', 'auditor', 'super_admin']);
  if (!user) return;

  try {
    const { findings } = await apiGet('/api/findings');

    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    findings.forEach(f => { counts[f.risk_level] = (counts[f.risk_level] || 0) + 1; });
    document.getElementById('kpiCritical').textContent = counts.Critical;
    document.getElementById('kpiHigh').textContent = counts.High;
    document.getElementById('kpiMedium').textContent = counts.Medium;
    document.getElementById('kpiLow').textContent = counts.Low;

    const openCount = findings.filter(f => f.status !== 'Resolved').length;
    const engagements = new Set(findings.map(f => f.audit_title)).size;
    document.getElementById('pageSub').textContent = `${openCount} open findings across ${engagements} engagement${engagements === 1 ? '' : 's'}`;

    const tbody = document.getElementById('findingsTableBody');
    tbody.innerHTML = findings.length ? findings.map(f => `
      <tr>
        <td class="mono"><a href="audit-details.html?id=${f.audit_id}"><b>${escapeHtml(f.code)}</b></a></td>
        <td style="max-width:260px;">${escapeHtml(f.description)}</td>
        <td>${riskBadge(f.risk_level)}</td>
        <td>${escapeHtml(f.department || '—')}</td>
        <td style="display:flex;align-items:center;gap:8px;">${f.responsible_name ? avatarSm(f.responsible_name) + escapeHtml(f.responsible_name) : '—'}</td>
        <td>${formatDate(f.target_date)}</td>
        <td>${statusBadge(f.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="7" class="cell-sub">No findings logged yet.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
})();
