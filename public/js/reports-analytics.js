(async function () {
  const user = await requireSession(['admin', 'super_admin']);
  if (!user) return;

  try {
    const { completion_rate, findings_by_department, productivity } = await apiGet('/api/reports/analytics');

    document.getElementById('kpiCompletion').textContent = `${completion_rate}%`;

    const maxDept = Math.max(1, ...findings_by_department.map(d => d.n));
    document.getElementById('deptBars').innerHTML = findings_by_department.length ? findings_by_department.map(d => `
      <div class="bar-row">
        <span style="width:130px;font-size:12.5px;color:#5B6472;">${escapeHtml(d.department || 'Unspecified')}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((d.n / maxDept) * 100)}%;background:#2456C7;"></div></div>
        <span style="font-size:12px;font-weight:700;width:16px;">${d.n}</span>
      </div>
    `).join('') : `<div class="cell-sub">No findings logged yet.</div>`;

    document.getElementById('productivityTableBody').innerHTML = productivity.length ? productivity.map(p => `
      <tr>
        <td style="display:flex;align-items:center;gap:8px;">${avatarSm(p.name)}<b>${escapeHtml(p.name)}</b></td>
        <td>${p.assigned}</td>
        <td>${p.closed}</td>
      </tr>
    `).join('') : `<tr><td colspan="3" class="cell-sub">No auditors yet.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
})();
