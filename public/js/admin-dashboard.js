(async function () {
  const user = await requireSession(['admin']);
  if (!user) return;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greeting}, ${user.name.split(' ')[0]}`;

  try {
    const { kpis, audits, team } = await apiGet('/api/dashboard');

    document.getElementById('kpiActive').textContent = kpis.active_audits;
    document.getElementById('kpiPending').textContent = kpis.pending_reviews;
    document.getElementById('kpiCompleted').textContent = kpis.completed_audits;
    document.getElementById('kpiOverdue').textContent = kpis.overdue_tasks;

    const teamEl = document.getElementById('teamPerformance');
    teamEl.innerHTML = team.length ? team.map(t => `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:7px;">
          <span style="display:flex;align-items:center;gap:8px;">${avatarSm(t.name)}<b>${escapeHtml(t.name)}</b></span>
          <span class="cell-sub" style="margin:0;">${t.audits_count} audit${t.audits_count === 1 ? '' : 's'}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.min(t.audits_count * 20, 100)}%;"></div></div>
      </div>
    `).join('') : `<div class="cell-sub">No auditors yet.</div>`;

    const tbody = document.getElementById('auditsTableBody');
    tbody.innerHTML = audits.length ? audits.map(a => `
      <tr>
        <td><b>${escapeHtml(a.client_name)}</b></td>
        <td><a href="audit-details.html?id=${a.id}">${escapeHtml(a.title)}</a></td>
        <td style="display:flex;align-items:center;gap:8px;">${a.lead_name ? avatarSm(a.lead_name) + escapeHtml(a.lead_name) : '<span class="cell-sub">Unassigned</span>'}</td>
        <td>${escapeHtml(a.phase)}</td>
        <td>${riskBadge(a.risk_level)}</td>
        <td>${formatDate(a.target_date)}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="7" class="cell-sub">No active audits.</td></tr>`;
    wireTableSearch('searchInput', 'auditsTableBody');
  } catch (err) {
    console.error(err);
  }
})();
