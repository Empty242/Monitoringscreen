const state = {
  data: null,
  refreshTimer: null,
  locationFilter: "all",
  severityFilter: "all",
  lastRefreshAt: null,
};

function renderClock() {
  const clockNode = document.getElementById("clock");
  if (!clockNode) return;
  clockNode.textContent = new Date().toLocaleString("zh-CN");
}

function getFilteredHosts(data) {
  return data.hosts.filter((host) => {
    const matchesLocation = state.locationFilter === "all" || host.location === state.locationFilter;
    const matchesSeverity = state.severityFilter === "all" || host.status === state.severityFilter;
    return matchesLocation && matchesSeverity;
  });
}

function getFilteredAlerts(data) {
  return data.alerts.filter((alert) => {
    const matchesLocation = state.locationFilter === "all" || alert.location === state.locationFilter;
    return matchesLocation;
  });
}

function renderSummary(data) {
  document.getElementById("hostCount").textContent = data.summary.hostCount;
  document.getElementById("statusSummary").textContent = `${data.summary.healthyHosts} / ${data.summary.warningHosts} / ${data.summary.criticalHosts}`;
  document.getElementById("avgCpu").textContent = `${data.summary.avgCpu}%`;
  document.getElementById("peakCpuHost").textContent = data.summary.peakCpuHost;
  document.getElementById("avgMemory").textContent = `${data.summary.avgMemory}%`;
  document.getElementById("peakDiskHost").textContent = data.summary.peakDiskHost;
  document.getElementById("alertCount").textContent = data.alerts.length;
  document.getElementById("alertHint").textContent = data.alerts[0] ? `${data.alerts[0].hostname} 负载偏高` : "无告警";
}

function renderTrendChart(data) {
  const svg = document.getElementById("trendChart");
  if (!svg || !data.cpuTrend.length) return;

  const width = 640;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 32, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxCpu = Math.max(...data.cpuTrend.map((item) => item.cpu), 100);
  const maxMem = Math.max(...data.cpuTrend.map((item) => item.memory), 20);
  const maxLoad = Math.max(...data.cpuTrend.map((item) => item.load), 10);

  const cpuPoints = data.cpuTrend.map((item, index) => {
    const x = padding.left + (index / (data.cpuTrend.length - 1 || 1)) * innerWidth;
    const y = padding.top + (1 - item.cpu / maxCpu) * innerHeight;
    return `${x},${y}`;
  });

  const memPoints = data.cpuTrend.map((item, index) => {
    const x = padding.left + (index / (data.cpuTrend.length - 1 || 1)) * innerWidth;
    const y = padding.top + (1 - item.memory / maxMem) * innerHeight;
    return `${x},${y}`;
  });

  const loadPoints = data.cpuTrend.map((item, index) => {
    const x = padding.left + (index / (data.cpuTrend.length - 1 || 1)) * innerWidth;
    const y = padding.top + (1 - item.load / maxLoad) * innerHeight;
    return `${x},${y}`;
  });

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const y = padding.top + (index / 4) * innerHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" />`;
  }).join("");

  const xLabels = data.cpuTrend.map((item, index) => {
    const x = padding.left + (index / (data.cpuTrend.length - 1 || 1)) * innerWidth;
    return `<text x="${x}" y="${height - 10}" text-anchor="middle" fill="#8eabc4" font-size="11">${item.label}</text>`;
  }).join("");

  svg.innerHTML = `
    ${gridLines}
    <polyline points="${cpuPoints.join(" ")}" fill="none" stroke="#44a8ff" stroke-width="3" />
    <polyline points="${memPoints.join(" ")}" fill="none" stroke="#24d39a" stroke-width="3" />
    <polyline points="${loadPoints.join(" ")}" fill="none" stroke="#ffca3a" stroke-width="3" />
    <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.2)" />
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.2)" />
    ${xLabels}
    <text x="16" y="${padding.top + 10}" fill="#8eabc4" font-size="11">CPU</text>
    <text x="16" y="${padding.top + 28}" fill="#8eabc4" font-size="11">内存</text>
    <text x="16" y="${padding.top + 46}" fill="#8eabc4" font-size="11">负载</text>
  `;
}

function renderTopHosts(data) {
  const container = document.getElementById("topHosts");
  if (!container) return;
  const hosts = getFilteredHosts(data);
  container.innerHTML = hosts.slice(0, 8).map((host) => `
    <div class="rank-item">
      <div class="rank-main">
        <strong>${host.hostname}</strong>
        <small>${host.location} · ${host.model}</small>
        <div class="rank-metrics">
          <span>CPU ${host.cpu.toFixed(1)}%</span>
          <span>内存 ${host.memory.toFixed(1)}%</span>
          <span>负载 ${host.load.toFixed(1)}</span>
        </div>
      </div>
      <span class="status-badge status-${host.status}">${host.status === "critical" ? "严重" : host.status === "warning" ? "告警" : "正常"}</span>
    </div>
  `).join("");
}

function renderBars(containerId, items, color) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const maxValue = Math.max(...items.map((entry) => entry.value), 1);
  container.innerHTML = items.map((item) => `
    <div class="bar-row">
      <span>${item.name}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(item.value / maxValue) * 100}%;background:${color};"></div>
      </div>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderAlerts(data) {
  const container = document.getElementById("alerts");
  if (!container) return;
  const alerts = getFilteredAlerts(data);
  container.innerHTML = alerts.slice(0, 8).map((item) => `
    <div class="alert-item">
      <div class="alert-main">
        <strong>${item.hostname}</strong>
        <small>${item.location}</small>
      </div>
      <span class="status-badge status-${item.severity}">${item.util}%</span>
    </div>
  `).join("");
}

function renderFilters(data) {
  const locationFilter = document.getElementById("locationFilter");
  if (locationFilter) {
    const locations = ["all", ...new Set(data.hosts.map((host) => host.location).sort())];
    locationFilter.innerHTML = locations.map((location) => {
      const label = location === "all" ? "全部机房" : location;
      return `<option value="${location}" ${state.locationFilter === location ? "selected" : ""}>${label}</option>`;
    }).join("");
  }
}

function render(data) {
  renderSummary(data);
  renderTrendChart(data);
  renderTopHosts(data);
  renderBars("locationBars", data.locationStats, "linear-gradient(90deg, #44a8ff, #24d39a)");
  renderBars("ownerBars", data.ownerStats, "linear-gradient(90deg, #ffca3a, #ff5f6d)");
  renderAlerts(data);
  renderFilters(data);
}

function updateRefreshStatus(message) {
  const node = document.getElementById("refreshStatus");
  if (node) {
    node.textContent = message;
  }
}

async function refreshData() {
  try {
    const response = await fetch(`data.json?t=${Date.now()}`);
    const data = await response.json();
    state.data = data;
    state.lastRefreshAt = new Date();
    updateRefreshStatus(`已刷新 ${state.lastRefreshAt.toLocaleTimeString("zh-CN")}`);
    render(data);
  } catch (error) {
    updateRefreshStatus("刷新失败");
    console.error(error);
  }
}

function bindControls() {
  const locationFilter = document.getElementById("locationFilter");
  const severityFilter = document.getElementById("severityFilter");

  locationFilter?.addEventListener("change", (event) => {
    state.locationFilter = event.target.value;
    render(state.data);
  });

  severityFilter?.addEventListener("change", (event) => {
    state.severityFilter = event.target.value;
    render(state.data);
  });
}

async function init() {
  renderClock();
  setInterval(renderClock, 1000);
  bindControls();
  await refreshData();
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refreshData, 15000);
}

init();
