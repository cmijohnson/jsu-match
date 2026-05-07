(function () {
  const DATA_URL = "./data/competitions.json";
  const TODAY = "2026-05-07";

  const elements = {
    listView: document.getElementById("list-view"),
    detailView: document.getElementById("detail-view"),
    cards: document.getElementById("cards"),
    detailMeta: document.getElementById("detail-meta"),
    detailContent: document.getElementById("detail-content"),
    resultsSummary: document.getElementById("results-summary"),
    heroTotal: document.querySelector("[data-stat='total']"),
    activeFilters: document.getElementById("active-filters"),
    fitFilter: document.getElementById("fit-filter"),
    levelFilter: document.getElementById("level-filter"),
    monthFilter: document.getElementById("month-filter"),
    statusFilter: document.getElementById("status-filter"),
    resetFilters: document.getElementById("reset-filters"),
    backButton: document.getElementById("back-button"),
  };

  const state = {
    competitions: [],
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function getFilters() {
    const params = new URLSearchParams(window.location.search);
    return {
      fit: params.get("fit") || "",
      level: params.get("level") || "",
      month: params.get("month") || "",
      status: params.get("status") || "",
    };
  }

  function setFilterControls(filters) {
    elements.fitFilter.value = filters.fit;
    elements.levelFilter.value = filters.level;
    elements.monthFilter.value = filters.month;
    elements.statusFilter.value = filters.status;
  }

  function updateSearchFromControls() {
    const params = new URLSearchParams();
    const mapping = {
      fit: elements.fitFilter.value,
      level: elements.levelFilter.value,
      month: elements.monthFilter.value,
      status: elements.statusFilter.value,
    };
    Object.entries(mapping).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const query = params.toString();
    const next = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
    window.history.replaceState({}, "", next);
    render();
  }

  function getRoute() {
    const rawHash = window.location.hash || "";
    const match = rawHash.match(/^#\/competition\/(\d{3})$/);
    if (match) {
      return { type: "detail", id: match[1] };
    }
    return { type: "list" };
  }

  function applyFilters(list, filters) {
    return list.filter((item) => {
      if (filters.fit && item.fit !== filters.fit) {
        return false;
      }
      if (filters.level && item.level !== filters.level) {
        return false;
      }
      if (filters.status && item.status !== filters.status) {
        return false;
      }
      if (filters.month && !item.monthTags.includes(filters.month)) {
        return false;
      }
      return true;
    });
  }

  function renderFilterPills(filters) {
    const labels = {
      fit: "专业角度",
      level: "赛事等级",
      month: "举办时间",
      status: "状态",
    };
    const active = Object.entries(filters).filter(([, value]) => value);
    if (!active.length) {
      elements.activeFilters.innerHTML = "";
      return;
    }
    elements.activeFilters.innerHTML = active
      .map(([key, value]) => `<span class="filter-pill">${labels[key]}: ${escapeHtml(value)}</span>`)
      .join("");
  }

  function renderList() {
    const filters = getFilters();
    setFilterControls(filters);
    const filtered = applyFilters(state.competitions, filters);
    elements.resultsSummary.textContent = `共 ${filtered.length} 项，数据口径截至 ${TODAY}`;
    renderFilterPills(filters);

    if (!filtered.length) {
      elements.cards.innerHTML =
        '<div class="empty-state">当前筛选条件下没有匹配赛事。请调整筛选器。</div>';
      return;
    }

    elements.cards.innerHTML = filtered
      .map(
        (item) => `
          <article class="card" data-id="${item.id}" tabindex="0" role="button" aria-label="打开 ${escapeHtml(item.name)} 详情">
            <div class="card-top">
              <div>
                <div class="card-id">#${item.id}</div>
                <h3>${escapeHtml(item.name)}</h3>
              </div>
            </div>
            <div class="meta-stack">
              <span class="chip fit-${escapeHtml(item.fit)}">${escapeHtml(item.fit)}</span>
              <span class="chip">${escapeHtml(item.level)}</span>
              <span class="chip">${escapeHtml(item.trackType)}</span>
            </div>
            <p class="card-summary">${escapeHtml(item.summary)}</p>
            <div class="status-line">
              <span>举办时间：${escapeHtml(item.displayTime)}</span>
              <span>状态：${escapeHtml(item.status)}</span>
            </div>
          </article>
        `,
      )
      .join("");

    elements.cards.querySelectorAll(".card").forEach((card) => {
      const open = () => {
        window.location.hash = `#/competition/${card.dataset.id}`;
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  async function renderDetail(id) {
    const record = state.competitions.find((item) => item.id === id);
    if (!record) {
      elements.detailMeta.innerHTML = "<p class='error-text'>未找到对应赛事。</p>";
      elements.detailContent.innerHTML = "";
      return;
    }

    elements.detailMeta.innerHTML = `
      <h2>${escapeHtml(record.name)}</h2>
      <div class="detail-grid">
        <span class="chip fit-${escapeHtml(record.fit)}">${escapeHtml(record.fit)}</span>
        <span class="chip">${escapeHtml(record.level)}</span>
        <span class="chip">${escapeHtml(record.trackType)}</span>
        <span class="chip">状态：${escapeHtml(record.status)}</span>
        <span class="chip">举办时间：${escapeHtml(record.displayTime)}</span>
      </div>
    `;
    elements.detailContent.innerHTML = "<p class='loading'>Markdown 加载中...</p>";

    try {
      const response = await fetch(record.mdPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const markdown = await response.text();
      elements.detailContent.innerHTML = window.marked.parse(markdown, {
        breaks: true,
        gfm: true,
      });
    } catch (error) {
      elements.detailContent.innerHTML = `<p class='error-text'>详情加载失败：${escapeHtml(error.message)}</p>`;
    }
  }

  function render() {
    const route = getRoute();
    if (route.type === "detail") {
      elements.listView.classList.add("hidden");
      elements.detailView.classList.remove("hidden");
      renderDetail(route.id);
      return;
    }
    elements.detailView.classList.add("hidden");
    elements.listView.classList.remove("hidden");
    renderList();
  }

  async function init() {
    const response = await fetch(DATA_URL);
    state.competitions = await response.json();
    elements.heroTotal.textContent = String(state.competitions.length);
    render();
  }

  elements.fitFilter.addEventListener("change", updateSearchFromControls);
  elements.levelFilter.addEventListener("change", updateSearchFromControls);
  elements.monthFilter.addEventListener("change", updateSearchFromControls);
  elements.statusFilter.addEventListener("change", updateSearchFromControls);
  elements.resetFilters.addEventListener("click", () => {
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    render();
  });
  elements.backButton.addEventListener("click", () => {
    window.location.hash = "";
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", render);

  init().catch((error) => {
    elements.resultsSummary.textContent = "数据加载失败";
    elements.cards.innerHTML = `<div class="empty-state">初始化失败：${escapeHtml(error.message)}</div>`;
  });
})();
