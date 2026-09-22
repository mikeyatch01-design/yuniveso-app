(async function () {
  const user = await requireSession(['client']);
  if (!user) return;

  const { findings } = await apiGet('/api/findings');
  document.getElementById('pageSub').textContent = `${findings.length} finding${findings.length === 1 ? '' : 's'} raised across your engagements`;

  document.getElementById('findingsTableBody').innerHTML = findings.length ? findings.map(f => `
    <tr>
      <td><b>${escapeHtml(f.audit_title)}</b><div class="cell-sub">${escapeHtml(f.description)}</div></td>
      <td>${riskBadge(f.risk_level)}</td>
      <td>${escapeHtml(f.department || '—')}</td>
      <td>${formatDate(f.target_date)}</td>
      <td>${statusBadge(f.status)}</td>
    </tr>
  `).join('') : `<tr><td colspan="5" class="cell-sub">No findings on file.</td></tr>`;
})();
