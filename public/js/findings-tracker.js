(async function () {
  const user = await requireSession(['admin', 'auditor', 'super_admin']);
  if (!user) return;

  let allFindings = [];
  let pillFilter = 'all';

  const tbody = document.getElementById('findingsTableBody');
  const pills = document.querySelectorAll('.filter-pill');
  const filterRisk = document.getElementById('filterRisk');
  const filterDept = document.getElementById('filterDept');
  const filterStatus = document.getElementById('filterStatus');

  function applyFilters() {
    let rows = allFindings;
    if (pillFilter === 'overdue') rows = rows.filter(f => f.status === 'Overdue');
    if (pillFilter === 'mine') rows = rows.filter(f => f.responsible_name === user.name);
    if (filterRisk.value) rows = rows.filter(f => f.risk_level === filterRisk.value);
    if (filterDept.value) rows = rows.filter(f => f.department === filterDept.value);
    if (filterStatus.value) rows = rows.filter(f => f.status === filterStatus.value);
    renderRows(rows);
  }

  function renderRows(rows) {
    tbody.innerHTML = rows.length ? rows.map(f => `
      <tr>
        <td class="mono"><a href="audit-details.html?id=${f.audit_id}"><b>${escapeHtml(f.code)}</b></a></td>
        <td style="max-width:260px;">${escapeHtml(f.description)}</td>
        <td>${riskBadge(f.risk_level)}</td>
        <td>${escapeHtml(f.department || '—')}</td>
        <td style="display:flex;align-items:center;gap:8px;">${f.responsible_name ? avatarSm(f.responsible_name) + escapeHtml(f.responsible_name) : '—'}</td>
        <td>${formatDate(f.target_date)}</td>
        <td>${statusBadge(f.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="7" class="cell-sub">No findings match this filter.</td></tr>`;
    wireTableSearch('searchInput', 'findingsTableBody');
  }

  async function load() {
    const { findings } = await apiGet('/api/findings');
    allFindings = findings;

    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    findings.forEach(f => { counts[f.risk_level] = (counts[f.risk_level] || 0) + 1; });
    document.getElementById('kpiCritical').textContent = counts.Critical;
    document.getElementById('kpiHigh').textContent = counts.High;
    document.getElementById('kpiMedium').textContent = counts.Medium;
    document.getElementById('kpiLow').textContent = counts.Low;

    const openCount = findings.filter(f => f.status !== 'Resolved').length;
    const engagements = new Set(findings.map(f => f.audit_title)).size;
    document.getElementById('pageSub').textContent = `${openCount} open findings across ${engagements} engagement${engagements === 1 ? '' : 's'}`;

    const depts = [...new Set(findings.map(f => f.department).filter(Boolean))].sort();
    const currentDept = filterDept.value;
    filterDept.innerHTML = '<option value="">Department: All</option>' + depts.map(d => `<option>${escapeHtml(d)}</option>`).join('');
    filterDept.value = currentDept;

    applyFilters();
  }

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => { p.classList.remove('btn-secondary', 'active'); p.classList.add('btn-ghost'); });
      pill.classList.remove('btn-ghost');
      pill.classList.add('btn-secondary', 'active');
      pillFilter = pill.dataset.filter;
      applyFilters();
    });
  });
  [filterRisk, filterDept, filterStatus].forEach(sel => sel.addEventListener('change', applyFilters));

  // ---------- New Finding modal ----------
  const modalOverlay = document.getElementById('findingModalOverlay');
  const form = document.getElementById('findingForm');
  const errEl = document.getElementById('findingFormError');
  const submitBtn = document.getElementById('findingSubmitBtn');
  const fAudit = document.getElementById('fFindingAudit');
  const fDescription = document.getElementById('fFindingDescription');
  const fRisk = document.getElementById('fFindingRisk');
  const fDept = document.getElementById('fFindingDept');
  const fResponsible = document.getElementById('fFindingResponsible');
  const fTarget = document.getElementById('fFindingTarget');

  document.getElementById('newFindingBtn').addEventListener('click', async () => {
    const [{ audits }, usersRes] = await Promise.all([
      apiGet('/api/audits'),
      user.role === 'auditor' ? Promise.resolve({ users: [] }) : apiGet('/api/users?role=auditor'),
    ]);
    fAudit.innerHTML = audits.map(a => `<option value="${a.id}">${escapeHtml(a.title)} (${escapeHtml(a.client_name)})</option>`).join('');
    fResponsible.innerHTML = '<option value="">— Unassigned —</option>' + usersRes.users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
    form.reset();
    errEl.style.display = 'none';
    modalOverlay.classList.add('show');
  });
  document.getElementById('findingModalClose').addEventListener('click', () => modalOverlay.classList.remove('show'));
  document.getElementById('findingModalCancel').addEventListener('click', () => modalOverlay.classList.remove('show'));
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('show'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    submitBtn.disabled = true;
    try {
      await apiPost('/api/findings', {
        audit_id: Number(fAudit.value), description: fDescription.value.trim(), risk_level: fRisk.value,
        department: fDept.value.trim(), responsible_id: fResponsible.value || null, target_date: fTarget.value || null,
      });
      modalOverlay.classList.remove('show');
      load();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });

  try {
    await load();
  } catch (err) {
    console.error(err);
  }
})();
