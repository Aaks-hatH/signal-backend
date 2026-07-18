(function () {
  'use strict';

  // ---------- small helpers ----------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function el(id) { return document.getElementById(id); }

  // ---------- tabs ----------
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      el('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'analytics' && !analyticsLoaded) {
        loadAnalytics();
      }
    });
  });

  // ---------- state ----------
  let state = {
    page: 1,
    pageSize: 25,
    sortField: 'serverReceivedAt',
    sortDir: 'desc',
    filters: {},
  };
  let analyticsLoaded = false;
  const charts = {};

  const KNOWN_CATEGORIES = new Set();
  const KNOWN_SEVERITIES = new Set();
  const KNOWN_WOULD_USE = new Set();
  const KNOWN_WOULD_PAY = new Set();

  function buildQuery(extra) {
    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('pageSize', state.pageSize);
    params.set('sortField', state.sortField);
    params.set('sortDir', state.sortDir);
    Object.entries(state.filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    }
    return params.toString();
  }

  function updateExportLink() {
    el('export-btn').href = '/admin/api/export.csv?' + buildQuery();
  }

  // ---------- table ----------
  async function loadSubmissions() {
    const tbody = el('submissions-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row">Loading…</td></tr>';

    try {
      const res = await fetch('/admin/api/submissions?' + buildQuery());
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();

      if (!data.items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No submissions match these filters.</td></tr>';
      } else {
        tbody.innerHTML = data.items
          .map((item) => {
            item.category && KNOWN_CATEGORIES.add(item.category);
            item.severity && KNOWN_SEVERITIES.add(item.severity);
            item.wouldUse && KNOWN_WOULD_USE.add(item.wouldUse);
            item.wouldPay && KNOWN_WOULD_PAY.add(item.wouldPay);
            return `<tr data-id="${escapeHtml(item._id)}">
              <td>${escapeHtml(fmtDate(item.serverReceivedAt))}</td>
              <td>${escapeHtml(item.name || 'N/A')}</td>
              <td>${escapeHtml(item.email || 'N/A')}</td>
              <td>${escapeHtml(item.category || 'N/A')}</td>
              <td>${escapeHtml(item.severity || 'N/A')}</td>
              <td>${item.rating !== undefined && item.rating !== null ? escapeHtml(item.rating) : 'N/A'}</td>
              <td>${escapeHtml(item.wouldUse || 'N/A')}</td>
              <td>${escapeHtml(item.wouldPay || 'N/A')}</td>
              <td>${escapeHtml(item.referenceCode)}</td>
            </tr>`;
          })
          .join('');

        tbody.querySelectorAll('tr[data-id]').forEach((row) => {
          row.addEventListener('click', () => openDetail(row.dataset.id));
        });

        refreshFilterOptions();
      }

      el('page-info').textContent = `Page ${data.page} of ${data.totalPages} (${data.total} total)`;
      el('prev-page').disabled = data.page <= 1;
      el('next-page').disabled = data.page >= data.totalPages;
      updateExportLink();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Failed to load submissions.</td></tr>';
      console.error(err);
    }
  }

  function refreshFilterOptions() {
    fillSelectOnce('f-category', KNOWN_CATEGORIES);
    fillSelectOnce('f-severity', KNOWN_SEVERITIES);
    fillSelectOnce('f-wouldUse', KNOWN_WOULD_USE);
    fillSelectOnce('f-wouldPay', KNOWN_WOULD_PAY);
  }

  function fillSelectOnce(selectId, valuesSet) {
    const select = el(selectId);
    const existing = new Set(Array.from(select.options).map((o) => o.value));
    valuesSet.forEach((v) => {
      if (!existing.has(v)) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      }
    });
  }

  async function openDetail(id) {
    const modal = el('detail-modal');
    const body = el('modal-body');
    body.innerHTML = 'Loading…';
    modal.classList.remove('hidden');

    try {
      const res = await fetch(`/admin/api/submissions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('not found');
      const item = await res.json();

      const rows = Object.entries(item)
        .filter(([k]) => !['__v', 'rawJson'].includes(k))
        .map(([k, v]) => {
          let display;
          if (v === null || v === undefined || v === '') display = 'N/A';
          else if (Array.isArray(v)) display = v.join(', ') || 'N/A';
          else if (typeof v === 'object') display = escapeHtml(JSON.stringify(v));
          else display = escapeHtml(v);
          return `<dt>${escapeHtml(k)}</dt><dd>${display}</dd>`;
        })
        .join('');

      body.innerHTML = `<dl>${rows}</dl>`;
    } catch (err) {
      body.innerHTML = 'Failed to load submission detail.';
    }
  }

  el('modal-close').addEventListener('click', () => el('detail-modal').classList.add('hidden'));
  el('detail-modal').addEventListener('click', (e) => {
    if (e.target === el('detail-modal')) el('detail-modal').classList.add('hidden');
  });

  // ---------- filters ----------
  el('f-apply').addEventListener('click', () => {
    state.filters = {
      q: el('f-search').value.trim(),
      category: el('f-category').value,
      severity: el('f-severity').value,
      wouldUse: el('f-wouldUse').value,
      wouldPay: el('f-wouldPay').value,
      dateFrom: el('f-dateFrom').value,
      dateTo: el('f-dateTo').value,
    };
    state.page = 1;
    loadSubmissions();
  });

  el('f-clear').addEventListener('click', () => {
    ['f-search', 'f-dateFrom', 'f-dateTo'].forEach((id) => (el(id).value = ''));
    ['f-category', 'f-severity', 'f-wouldUse', 'f-wouldPay'].forEach((id) => (el(id).value = ''));
    state.filters = {};
    state.page = 1;
    loadSubmissions();
  });

  // ---------- sorting ----------
  document.querySelectorAll('#submissions-table thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (state.sortField === field) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDir = 'desc';
      }
      loadSubmissions();
    });
  });

  // ---------- pagination ----------
  el('prev-page').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadSubmissions(); }
  });
  el('next-page').addEventListener('click', () => {
    state.page += 1; loadSubmissions();
  });
  el('page-size').addEventListener('change', (e) => {
    state.pageSize = parseInt(e.target.value, 10);
    state.page = 1;
    loadSubmissions();
  });

  // ---------- analytics ----------
  async function loadAnalytics() {
    try {
      const res = await fetch('/admin/api/analytics');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      analyticsLoaded = true;

      el('stat-cards').innerHTML = `
        <div class="stat-card"><div class="value">${data.totalCount}</div><div class="label">Total submissions</div></div>
        <div class="stat-card"><div class="value">${data.avgRating !== null ? data.avgRating : 'N/A'}</div><div class="label">Avg current-solution rating (n=${data.avgRatingSampleSize})</div></div>
        <div class="stat-card"><div class="value">${data.contactOptInPct}%</div><div class="label">Opted into contact (${data.contactOptInCount})</div></div>
        <div class="stat-card"><div class="value">${data.betaOptInPct}%</div><div class="label">Beta interest (${data.betaOptInCount})</div></div>
      `;

      renderLineChart('chart-byDay', data.byDay.map((d) => d.date), data.byDay.map((d) => d.count));
      renderBarChart('chart-byCategory', data.byCategory);
      renderBarChart('chart-bySeverity', data.bySeverity);
      renderBarChart('chart-byFrequency', data.byFrequency);
      renderBarChart('chart-frustrationTags', data.topFrustrationTags);
      renderBarChart('chart-featurePriorities', data.topFeaturePriorities);
      renderBarChart('chart-wouldUse', data.wouldUseFunnel);
      renderBarChart('chart-wouldPay', data.wouldPayFunnel);
      renderBarChart('chart-priceRange', data.priceRangeBreakdown);
    } catch (err) {
      el('stat-cards').innerHTML = '<div class="stat-card">Failed to load analytics.</div>';
      console.error(err);
    }
  }

  function chartColors() {
    return {
      cyan: '#ff6a3d',
      grid: 'rgba(237,232,214,0.06)',
      text: '#93998d',
    };
  }

  function destroyIfExists(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function renderLineChart(canvasId, labels, values) {
    destroyIfExists(canvasId);
    const c = chartColors();
    charts[canvasId] = new Chart(el(canvasId), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: c.cyan,
          backgroundColor: 'rgba(255,106,61,0.15)',
          tension: 0.25,
          fill: true,
          pointRadius: 2,
        }],
      },
      options: baseChartOptions(c),
    });
  }

  function renderBarChart(canvasId, entries) {
    destroyIfExists(canvasId);
    const c = chartColors();
    charts[canvasId] = new Chart(el(canvasId), {
      type: 'bar',
      data: {
        labels: entries.map((e) => e.label),
        datasets: [{
          data: entries.map((e) => e.count),
          backgroundColor: c.cyan,
          borderRadius: 4,
        }],
      },
      options: baseChartOptions(c),
    });
  }

  function baseChartOptions(c) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } },
        y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid }, beginAtZero: true },
      },
    };
  }

  // ---------- init ----------
  loadSubmissions();
})();
