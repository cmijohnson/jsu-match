(function () {
  const DATA_URLS = {
    majors: "./data/majors.json",
    competitions: "./data/competitions.json",
    views: "./data/profession-views.json",
  };

  const TODAY = "2026-05-07";
  const LEVEL_ORDER = { "A+": 3, A: 2, B: 1 };
  const STATUS_ORDER = { 进行中: 4, 未开始: 3, 已结束: 2, 未发布: 1 };
  const RECOMMENDATION_ORDER = { 主推: 3, 可参加: 2, 不建议: 1, 待选专业: 0 };
  const TRACK_LABELS = {
    security: "网络安全",
    programming: "算法编程",
    software: "软件工程",
    "data-ai": "数据与 AI",
    electronics: "电子通信",
    embedded: "嵌入式",
    robotics: "机器人 / 自动化",
    mechanical: "机械制造",
    civil: "土木建造",
    "energy-env": "能源环境",
    "chem-material": "化工材料",
    "bio-med": "生物药学",
    medicine: "医学健康",
    "math-modeling": "数理建模",
    business: "商科管理",
    finance: "财经金融",
    innovation: "创新创业",
    language: "外语表达",
    design: "设计创意",
    law: "法学治理",
  };

  const DEFAULT_STATE = {
    route: "home",
    competitionId: "",
    collegeId: "",
    majorId: "",
    search: "",
    levels: [],
    statuses: [],
    months: [],
    trackTypes: [],
    recommendations: [],
  };

  const elements = {
    app: document.getElementById("app"),
    collegeSelect: document.getElementById("college-select"),
    majorSelect: document.getElementById("major-select"),
    searchForm: document.getElementById("search-form"),
    searchInput: document.getElementById("search-input"),
    shareContextButton: document.getElementById("share-context-button"),
    contextBreadcrumb: document.getElementById("context-breadcrumb"),
    contextSummary: document.getElementById("context-summary"),
    toast: document.getElementById("toast"),
  };

  const store = {
    ready: false,
    majorsPayload: null,
    competitionsPayload: null,
    viewsPayload: null,
    colleges: [],
    majors: [],
    competitions: [],
    views: [],
    collegesById: new Map(),
    majorsById: new Map(),
    competitionsById: new Map(),
    majorViewsByKey: new Map(),
    collegeViewsByKey: new Map(),
    markdownCache: new Map(),
  };

  let currentState = { ...DEFAULT_STATE };

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

  function splitList(value) {
    return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
  }

  function dedupe(values) {
    return Array.from(new Set(values));
  }

  function parseHashState() {
    const raw = window.location.hash.replace(/^#/, "") || "/home";
    const [pathPart, queryPart = ""] = raw.split("?");
    const params = new URLSearchParams(queryPart);
    const routeState = { ...DEFAULT_STATE };

    let path = pathPart || "/home";
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    if (/^\/competition\/\d{3}$/.test(path)) {
      routeState.route = "competition";
      routeState.competitionId = path.split("/")[2];
    } else if (/^\/major\/[^/]+$/.test(path)) {
      routeState.route = "home";
      routeState.majorId = decodeURIComponent(path.split("/")[2]);
    } else if (path === "/competitions") {
      routeState.route = "competitions";
    } else {
      routeState.route = "home";
    }

    routeState.collegeId = params.get("college") || routeState.collegeId;
    routeState.majorId = params.get("major") || routeState.majorId;
    routeState.search = params.get("search") || "";
    routeState.levels = splitList(params.get("levels"));
    routeState.statuses = splitList(params.get("statuses"));
    routeState.months = splitList(params.get("months"));
    routeState.trackTypes = splitList(params.get("trackTypes"));
    routeState.recommendations = splitList(params.get("recommendations"));

    return normalizeState(routeState);
  }

  function buildHash(state) {
    const params = new URLSearchParams();
    if (state.collegeId) params.set("college", state.collegeId);
    if (state.majorId) params.set("major", state.majorId);
    if (state.search) params.set("search", state.search);
    if (state.levels.length) params.set("levels", state.levels.join(","));
    if (state.statuses.length) params.set("statuses", state.statuses.join(","));
    if (state.months.length) params.set("months", state.months.join(","));
    if (state.trackTypes.length) params.set("trackTypes", state.trackTypes.join(","));
    if (state.recommendations.length) params.set("recommendations", state.recommendations.join(","));

    let path = "/home";
    if (state.route === "competitions") {
      path = "/competitions";
    } else if (state.route === "competition" && state.competitionId) {
      path = "/competition/" + state.competitionId;
    } else if (state.route === "home" && state.majorId) {
      path = "/major/" + state.majorId;
    }

    const query = params.toString();
    return "#" + path + (query ? "?" + query : "");
  }

  function normalizeState(nextState) {
    const state = { ...DEFAULT_STATE, ...nextState };
    state.levels = dedupe(state.levels);
    state.statuses = dedupe(state.statuses);
    state.months = dedupe(state.months);
    state.trackTypes = dedupe(state.trackTypes);
    state.recommendations = dedupe(state.recommendations);

    if (store.ready) {
      if (state.majorId) {
        const major = store.majorsById.get(state.majorId);
        if (!major) {
          state.majorId = "";
        } else {
          state.collegeId = major.collegeId;
        }
      }
      if (state.collegeId && !store.collegesById.has(state.collegeId)) {
        state.collegeId = "";
      }
      if (state.competitionId && !store.competitionsById.has(state.competitionId)) {
        state.competitionId = "";
        if (state.route === "competition") {
          state.route = "competitions";
        }
      }
    }

    if (!state.majorId && !state.collegeId) {
      state.recommendations = [];
    }
    return state;
  }

  function setState(patch, options) {
    const nextState = normalizeState({ ...currentState, ...patch });
    currentState = nextState;
    const nextHash = buildHash(nextState);
    if (options && options.replace) {
      history.replaceState({}, "", nextHash);
    } else {
      window.location.hash = nextHash;
      return;
    }
    render();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(function () {
      elements.toast.classList.remove("is-visible");
    }, 2200);
  }

  function currentMajor() {
    return currentState.majorId ? store.majorsById.get(currentState.majorId) : null;
  }

  function currentCollege() {
    if (currentState.majorId) {
      return store.collegesById.get(currentMajor().collegeId);
    }
    return currentState.collegeId ? store.collegesById.get(currentState.collegeId) : null;
  }

  function currentCluster() {
    const major = currentMajor();
    if (!major) return null;
    return store.majorsPayload.clusters.find(function (cluster) {
      return cluster.id === major.clusterId;
    });
  }

  function viewKey(competitionId, scopeId) {
    return competitionId + "::" + scopeId;
  }

  function contextualView(competitionId) {
    if (currentState.majorId) {
      return store.majorViewsByKey.get(viewKey(competitionId, currentState.majorId)) || null;
    }
    if (currentState.collegeId) {
      return store.collegeViewsByKey.get(viewKey(competitionId, currentState.collegeId)) || null;
    }
    return null;
  }

  function recommendationBadge(competitionId) {
    const view = contextualView(competitionId);
    if (!view) {
      return { label: "待选专业", tone: "neutral" };
    }
    return {
      label: view.recommendation,
      tone: view.recommendation === "主推" ? "strong" : view.recommendation === "可参加" ? "mid" : "weak",
    };
  }

  function fillSelectors() {
    const collegeOptions = ['<option value="">全校视角</option>']
      .concat(
        store.colleges.map(function (college) {
          return '<option value="' + escapeHtml(college.id) + '">' + escapeHtml(college.name) + "</option>";
        }),
      )
      .join("");
    elements.collegeSelect.innerHTML = collegeOptions;

    const majorOptions = ['<option value="">未指定专业</option>']
      .concat(
        store.majors
          .filter(function (major) {
            return !currentState.collegeId || major.collegeId === currentState.collegeId;
          })
          .map(function (major) {
            return '<option value="' + escapeHtml(major.id) + '">' + escapeHtml(major.name) + "</option>";
          }),
      )
      .join("");
    elements.majorSelect.innerHTML = majorOptions;

    elements.collegeSelect.value = currentState.collegeId;
    elements.majorSelect.value = currentState.majorId;
    elements.searchInput.value = currentState.search;
  }

  function renderContextBar() {
    const major = currentMajor();
    const college = currentCollege();
    const cluster = currentCluster();
    const bread = [];
    bread.push('<a href="#/home">全校</a>');
    if (college) {
      bread.push(escapeHtml(college.name));
    }
    if (major) {
      bread.push(escapeHtml(major.name));
    }
    elements.contextBreadcrumb.innerHTML = bread.join('<span class="slash">/</span>');

    if (major) {
      elements.contextSummary.innerHTML =
        '<span class="summary-chip">专业上下文已启用</span>' +
        '<span class="summary-text">' +
        escapeHtml(cluster ? cluster.label : "专业视角") +
        " · 核心能力：" +
        escapeHtml((major.coreSkills || []).slice(0, 3).join("、") || "待补充") +
        "</span>";
      return;
    }

    if (college) {
      elements.contextSummary.innerHTML =
        '<span class="summary-chip">学院上下文已启用</span>' +
        '<span class="summary-text">当前按 ' +
        escapeHtml(college.name) +
        " 聚合排序；继续选择专业后会切到更细的推荐模型。</span>";
      return;
    }

    elements.contextSummary.innerHTML =
      '<span class="summary-chip">全校模式</span>' +
      '<span class="summary-text">先选学院 / 专业，可以把推荐、排序、详情评测都切换到对应培养方向。</span>';
  }

  function filteredCompetitions() {
    const normalizedSearch = currentState.search.trim().toLowerCase();
    let list = store.competitions.filter(function (competition) {
      if (currentState.levels.length && currentState.levels.indexOf(competition.level) === -1) {
        return false;
      }
      if (currentState.statuses.length && currentState.statuses.indexOf(competition.status) === -1) {
        return false;
      }
      if (currentState.months.length && !competition.monthTags.some(function (month) {
        return currentState.months.indexOf(month) !== -1;
      })) {
        return false;
      }
      if (currentState.trackTypes.length && !competition.trackTypes.some(function (type) {
        return currentState.trackTypes.indexOf(type) !== -1;
      })) {
        return false;
      }
      if (currentState.recommendations.length) {
        const view = contextualView(competition.id);
        if (!view || currentState.recommendations.indexOf(view.recommendation) === -1) {
          return false;
        }
      }
      if (!normalizedSearch) {
        return true;
      }
      const view = contextualView(competition.id);
      const terms = [
        competition.name,
        competition.trackType,
        competition.summary,
        competition.tags.join(" "),
        competition.sharpComment || "",
        view ? view.reason : "",
        view ? view.gain : "",
        view ? view.barrier : "",
      ]
        .join(" ")
        .toLowerCase();
      return terms.indexOf(normalizedSearch) !== -1;
    });

    list = list.slice().sort(function (left, right) {
      const leftView = contextualView(left.id);
      const rightView = contextualView(right.id);
      const leftRecommendation = leftView ? RECOMMENDATION_ORDER[leftView.recommendation] : 0;
      const rightRecommendation = rightView ? RECOMMENDATION_ORDER[rightView.recommendation] : 0;
      if (rightRecommendation !== leftRecommendation) return rightRecommendation - leftRecommendation;
      if (rightView && leftView && rightView.priorityScore !== leftView.priorityScore) {
        return rightView.priorityScore - leftView.priorityScore;
      }
      if (STATUS_ORDER[right.status] !== STATUS_ORDER[left.status]) {
        return STATUS_ORDER[right.status] - STATUS_ORDER[left.status];
      }
      if (LEVEL_ORDER[right.level] !== LEVEL_ORDER[left.level]) {
        return LEVEL_ORDER[right.level] - LEVEL_ORDER[left.level];
      }
      return left.id.localeCompare(right.id);
    });
    return list;
  }

  function renderCard(competition, options) {
    const view = contextualView(competition.id);
    const badge = recommendationBadge(competition.id);
    const reason = view ? view.reason : "选择专业后显示该培养方向下的推荐结论。";
    const officialButtons = [
      competition.officialSite
        ? '<a class="mini-link" href="' + escapeHtml(competition.officialSite) + '" target="_blank" rel="noreferrer">官网</a>'
        : '<span class="mini-link is-disabled">暂无官网</span>',
      competition.officialNotice
        ? '<a class="mini-link" href="' + escapeHtml(competition.officialNotice) + '" target="_blank" rel="noreferrer">通知</a>'
        : '<span class="mini-link is-disabled">暂无通知</span>',
      '<button class="mini-link mini-button" data-action="share-competition" data-id="' +
        escapeHtml(competition.id) +
        '" type="button">分享</button>',
    ]
      .join("");

    return (
      '<article class="competition-card" data-action="open-competition" data-id="' +
      escapeHtml(competition.id) +
      '">' +
      '<div class="card-header">' +
      '<div>' +
      '<span class="card-id">#' +
      escapeHtml(competition.id) +
      "</span>" +
      "<h3>" +
      escapeHtml(competition.name) +
      "</h3>" +
      "</div>" +
      '<span class="status-pill status-' +
      escapeHtml(competition.status) +
      '">' +
      escapeHtml(competition.status) +
      "</span>" +
      "</div>" +
      '<div class="card-chips">' +
      '<span class="chip chip-contrast">' +
      escapeHtml(badge.label) +
      "</span>" +
      '<span class="chip">' +
      escapeHtml(competition.level) +
      "</span>" +
      '<span class="chip">' +
      escapeHtml(competition.trackType) +
      "</span>" +
      "</div>" +
      '<p class="card-summary">' +
      escapeHtml(options && options.compact ? competition.summary : reason) +
      "</p>" +
      '<div class="card-meta">' +
      '<span><strong>时间</strong>' +
      escapeHtml(competition.displayTime) +
      "</span>" +
      '<span><strong>状态</strong>' +
      escapeHtml(competition.infoStatus) +
      "</span>" +
      "</div>" +
      '<div class="card-links">' +
      officialButtons +
      "</div>" +
      "</article>"
    );
  }

  function topStats(competitions) {
    const upcoming = competitions.filter(function (item) {
      return item.status === "未开始";
    }).length;
    const running = competitions.filter(function (item) {
      return item.status === "进行中";
    }).length;
    const published = competitions.filter(function (item) {
      return item.status !== "未发布";
    }).length;
    return { upcoming: upcoming, running: running, published: published };
  }

  function majorRecommendationBuckets(competitions) {
    const buckets = { 主推: 0, 可参加: 0, 不建议: 0 };
    competitions.forEach(function (competition) {
      const view = contextualView(competition.id);
      if (view) {
        buckets[view.recommendation] += 1;
      }
    });
    return buckets;
  }

  function quickTopicLink(label, patch) {
    const next = normalizeState({ ...currentState, route: "competitions", ...patch });
    const hash = buildHash(next);
    return (
      '<a class="topic-card" href="' +
      escapeHtml(hash) +
      '">' +
      "<strong>" +
      escapeHtml(label) +
      "</strong>" +
      "<span>按当前上下文跳转</span>" +
      "</a>"
    );
  }

  function renderHome() {
    const major = currentMajor();
    const college = currentCollege();
    const cluster = currentCluster();
    const list = filteredCompetitions();
    const stats = topStats(store.competitions);
    const recommendationCounts = majorRecommendationBuckets(store.competitions);
    const featured = list.slice(0, 6);
    const timeline = store.competitions
      .filter(function (competition) {
        return competition.status !== "未发布";
      })
      .slice()
      .sort(function (left, right) {
        return (left.startDate || "9999").localeCompare(right.startDate || "9999");
      })
      .slice(0, 8);

    let heroTitle = "从专业出发看 103 项竞赛";
    let heroText =
      "先切学院，再切专业。推荐排序、详情评测、搜索命中和分享链接都会跟着当前培养方向变化。";
    let sideContent =
      '<div class="insight-panel">' +
      "<h3>当前数据口径</h3>" +
      "<p>覆盖 26 个学院、103 个本科专业、103 项竞赛。时间状态以 2026-05-07 为当前观察点。</p>" +
      '<p class="muted">结构来自 lakebook，官网/通知/时间字段做了二次核验并保留原始调研 Markdown。</p>' +
      "</div>";

    if (major) {
      heroTitle = college.name + " · " + major.name;
      heroText = major.summary || "已切到专业视角。当前页面会把推荐、筛选和详情解释都按这个专业排序。";
      sideContent =
        '<div class="insight-panel">' +
        "<h3>" +
        escapeHtml(cluster ? cluster.label : "专业画像") +
        "</h3>" +
        "<p><strong>核心能力：</strong>" +
        escapeHtml((major.coreSkills || []).join("、") || "待补充") +
        "</p>" +
        "<p><strong>主线方向：</strong>" +
        escapeHtml(major.mainline || "待补充") +
        "</p>" +
        "</div>";
    } else if (college) {
      heroTitle = college.name + " 竞赛地图";
      heroText = "当前先按学院聚合排序。继续选择专业后，系统会切换到更精细的推荐权重和替代项建议。";
      sideContent =
        '<div class="insight-panel">' +
        "<h3>学院覆盖</h3>" +
        "<p>本院共收录 " +
        String(store.majors.filter(function (majorItem) {
          return majorItem.collegeId === college.id;
        }).length) +
        " 个本科专业。</p>" +
        "</div>";
    }

    elements.app.innerHTML =
      '<section class="hero-panel">' +
      '<div class="hero-copy">' +
      '<p class="eyebrow">JSU MATCH / PROFESSIONAL VIEW</p>' +
      "<h1>" +
      escapeHtml(heroTitle) +
      "</h1>" +
      "<p>" +
      escapeHtml(heroText) +
      "</p>" +
      '<div class="hero-actions">' +
      '<a class="primary-button" href="#/competitions">浏览全量赛事</a>' +
      '<button class="ghost-button" type="button" data-action="share-page">分享当前页面</button>' +
      "</div>" +
      "</div>" +
      '<div class="hero-side">' +
      sideContent +
      "</div>" +
      "</section>" +
      '<section class="stats-grid">' +
      statCard("赛事总数", String(store.competitions.length), "固定基线") +
      statCard("已发布赛历", String(stats.published), "有明确 2026 节点") +
      statCard("进行中", String(stats.running), "按 2026-05-07 计算") +
      statCard("未开始", String(stats.upcoming), "适合提前卡位") +
      (major
        ? statCard("主推数量", String(recommendationCounts["主推"]), "与当前专业强匹配")
        : statCard("当前结果", String(list.length), "受搜索和筛选影响")) +
      "</section>" +
      '<section class="home-grid">' +
      '<div class="panel-panel wide-panel">' +
      '<div class="panel-head"><h2>当前上下文推荐</h2><span>' +
      escapeHtml(major ? "按专业排序" : college ? "按学院排序" : "按全校默认排序") +
      "</span></div>" +
      '<div class="card-grid">' +
      featured.map(function (competition) {
        return renderCard(competition, { compact: true });
      }).join("") +
      "</div>" +
      "</div>" +
      '<div class="panel-panel">' +
      '<div class="panel-head"><h2>专题入口</h2><span>快速切到筛选视图</span></div>' +
      '<div class="topic-grid">' +
      quickTopicLink("A+ 高含金量", { levels: ["A+"], statuses: [], months: [], trackTypes: [], recommendations: [] }) +
      quickTopicLink("已发布赛历", { statuses: ["进行中", "未开始", "已结束"], levels: [], months: [], trackTypes: [], recommendations: [] }) +
      quickTopicLink("待发布补位", { statuses: ["未发布"], levels: [], months: [], trackTypes: [], recommendations: [] }) +
      quickTopicLink("网络安全 / 编程", { trackTypes: ["security", "programming"], statuses: [], levels: [], months: [] }) +
      quickTopicLink("创新创业线", { trackTypes: ["innovation"], statuses: [], levels: [], months: [] }) +
      (major
        ? quickTopicLink("只看主推", { recommendations: ["主推"], statuses: [], levels: [], months: [], trackTypes: [] })
        : quickTopicLink("先选专业再细筛", { route: "home" })) +
      "</div>" +
      "</div>" +
      "</section>" +
      '<section class="panel-panel timeline-panel">' +
      '<div class="panel-head"><h2>时间线预览</h2><span>显示有明确赛历的赛事</span></div>' +
      '<div class="timeline-list">' +
      timeline
        .map(function (competition) {
          return (
            '<button class="timeline-item" type="button" data-action="open-competition" data-id="' +
            escapeHtml(competition.id) +
            '">' +
            '<span class="timeline-month">' +
            escapeHtml(competition.monthTags.join(" · ")) +
            "</span>" +
            '<span class="timeline-name">' +
            escapeHtml(competition.name) +
            "</span>" +
            '<span class="timeline-status">' +
            escapeHtml(competition.status) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      "</section>";
  }

  function statCard(label, value, hint) {
    return (
      '<article class="stat-box">' +
      '<span class="stat-label">' +
      escapeHtml(label) +
      "</span>" +
      '<strong class="stat-value">' +
      escapeHtml(value) +
      "</strong>" +
      '<small class="stat-hint">' +
      escapeHtml(hint) +
      "</small>" +
      "</article>"
    );
  }

  function filterBlock(label, name, items, selectedItems, disabled) {
    return (
      '<section class="filter-block">' +
      "<h3>" +
      escapeHtml(label) +
      "</h3>" +
      '<div class="filter-chip-grid">' +
      items
        .map(function (item) {
          const checked = selectedItems.indexOf(item.value) !== -1;
          return (
            '<label class="filter-chip' +
            (checked ? " is-active" : "") +
            (disabled ? " is-disabled" : "") +
            '">' +
            '<input type="checkbox" data-filter-name="' +
            escapeHtml(name) +
            '" value="' +
            escapeHtml(item.value) +
            '"' +
            (checked ? " checked" : "") +
            (disabled ? " disabled" : "") +
            " />" +
            "<span>" +
            escapeHtml(item.label) +
            "</span>" +
            "</label>"
          );
        })
        .join("") +
      "</div>" +
      "</section>"
    );
  }

  function renderCompetitions() {
    const list = filteredCompetitions();
    const recommendationDisabled = !currentState.majorId && !currentState.collegeId;
    const filterSummary = [
      currentState.levels.length ? "等级 " + currentState.levels.join(" / ") : "",
      currentState.statuses.length ? "状态 " + currentState.statuses.join(" / ") : "",
      currentState.months.length ? "月份 " + currentState.months.join(" / ") : "",
      currentState.trackTypes.length
        ? "赛道 " +
          currentState.trackTypes
            .map(function (item) {
              return TRACK_LABELS[item] || item;
            })
            .join(" / ")
        : "",
      currentState.recommendations.length ? "推荐 " + currentState.recommendations.join(" / ") : "",
      currentState.search ? "搜索 “" + currentState.search + "”" : "",
    ]
      .filter(Boolean)
      .join(" · ");

    elements.app.innerHTML =
      '<section class="directory-layout">' +
      '<aside class="filters-panel panel-panel">' +
      '<div class="panel-head"><h2>组合筛选</h2><button class="mini-link mini-button" data-action="reset-filters" type="button">清空</button></div>' +
      filterBlock(
        "赛事等级",
        "levels",
        ["A+", "A", "B"].map(function (item) {
          return { value: item, label: item };
        }),
        currentState.levels,
        false,
      ) +
      filterBlock(
        "举办月份",
        "months",
        ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "待发布/未知"].map(function (item) {
          return { value: item, label: item };
        }),
        currentState.months,
        false,
      ) +
      filterBlock(
        "状态",
        "statuses",
        ["未发布", "未开始", "进行中", "已结束"].map(function (item) {
          return { value: item, label: item };
        }),
        currentState.statuses,
        false,
      ) +
      filterBlock(
        "赛制类型",
        "trackTypes",
        Object.keys(TRACK_LABELS).map(function (key) {
          return { value: key, label: TRACK_LABELS[key] };
        }),
        currentState.trackTypes,
        false,
      ) +
      filterBlock(
        "专业推荐",
        "recommendations",
        ["主推", "可参加", "不建议"].map(function (item) {
          return { value: item, label: item };
        }),
        currentState.recommendations,
        recommendationDisabled,
      ) +
      (recommendationDisabled
        ? '<p class="panel-tip">推荐等级依赖学院 / 专业上下文。先在顶部选择学院或专业，再启用这一组筛选。</p>'
        : "") +
      "</aside>" +
      '<section class="results-panel panel-panel">' +
      '<div class="panel-head"><div><h2>赛事浏览</h2><p class="muted">' +
      escapeHtml(filterSummary || "当前未启用额外筛选，展示全量排序结果。") +
      "</p></div><span>" +
      String(list.length) +
      " 项结果</span></div>" +
      '<div class="card-grid">' +
      (list.length
        ? list.map(function (competition) {
            return renderCard(competition, { compact: false });
          }).join("")
        : '<div class="empty-panel">没有匹配结果。可以先清空筛选，或更换专业上下文再试。</div>') +
      "</div>" +
      "</section>" +
      "</section>";
  }

  function detailMetaList(competition) {
    const items = [
      ["赛事等级", competition.level],
      ["赛制类型", competition.trackType],
      ["当前状态", competition.status],
      ["时间口径", competition.displayTime],
      ["信息状态", competition.infoStatus],
    ];
    return items
      .map(function (pair) {
        return (
          '<div class="meta-row"><span>' +
          escapeHtml(pair[0]) +
          "</span><strong>" +
          escapeHtml(pair[1] || "待补充") +
          "</strong></div>"
        );
      })
      .join("");
  }

  function renderFitHighlights(items) {
    if (!items.length) {
      return '<div class="empty-inline">暂无全校适配摘要。</div>';
    }
    return items
      .map(function (item) {
        return (
          '<article class="fit-item">' +
          '<span class="chip">' +
          escapeHtml(item.badge) +
          "</span>" +
          "<h4>" +
          escapeHtml(item.major) +
          "</h4>" +
          "<p>" +
          escapeHtml(item.reason) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderLowFitGroups(items) {
    if (!items.length) {
      return '<div class="empty-inline">暂无明确低性价比专业组说明。</div>';
    }
    return items
      .map(function (item) {
        return (
          '<article class="fit-item fit-item-weak">' +
          "<h4>" +
          escapeHtml(item.group) +
          "</h4>" +
          "<p>" +
          escapeHtml(item.reason) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderDetailView(competition) {
    const view = contextualView(competition.id);
    const major = currentMajor();
    const college = currentCollege();
    const officialButtons = [
      competition.officialSite
        ? '<a class="primary-button" href="' + escapeHtml(competition.officialSite) + '" target="_blank" rel="noreferrer">官网直达</a>'
        : '<span class="ghost-button disabled-button">暂无可信官网入口</span>',
      competition.officialNotice
        ? '<a class="ghost-button" href="' + escapeHtml(competition.officialNotice) + '" target="_blank" rel="noreferrer">通知直达</a>'
        : '<span class="ghost-button disabled-button">暂无可信通知入口</span>',
      competition.signupLink
        ? '<a class="ghost-button" href="' + escapeHtml(competition.signupLink) + '" target="_blank" rel="noreferrer">报名入口</a>'
        : '<span class="ghost-button disabled-button">暂无报名入口</span>',
      '<button class="ghost-button" type="button" data-action="share-page">分享本页</button>',
    ].join("");

    const recommendationTitle = major
      ? college.name + " · " + major.name + " 视角"
      : college
      ? college.name + " 聚合视角"
      : "当前未指定专业";

    const alternatives =
      view && view.alternatives.length
        ? view.alternatives
            .map(function (competitionId) {
              const item = store.competitionsById.get(competitionId);
              if (!item) return "";
              return (
                '<a class="related-link" href="#/competition/' +
                escapeHtml(item.id) +
                "?college=" +
                encodeURIComponent(currentState.collegeId) +
                "&major=" +
                encodeURIComponent(currentState.majorId) +
                '">' +
                escapeHtml(item.name) +
                "</a>"
              );
            })
            .join("")
        : '<span class="empty-inline">当前上下文下暂无替代项建议。</span>';

    elements.app.innerHTML =
      '<section class="detail-shell">' +
      '<div class="detail-top panel-panel">' +
      '<div class="panel-head"><a class="mini-link" href="#/competitions">返回赛事库</a><span>#' +
      escapeHtml(competition.id) +
      "</span></div>" +
      '<div class="detail-hero">' +
      '<div class="detail-copy">' +
      "<h1>" +
      escapeHtml(competition.name) +
      "</h1>" +
      "<p>" +
      escapeHtml(competition.summary) +
      "</p>" +
      '<div class="chip-row">' +
      '<span class="chip chip-contrast">' +
      escapeHtml(recommendationBadge(competition.id).label) +
      "</span>" +
      '<span class="chip">' +
      escapeHtml(competition.level) +
      "</span>" +
      '<span class="chip">' +
      escapeHtml(competition.trackType) +
      "</span>" +
      '<span class="chip status-' +
      escapeHtml(competition.status) +
      '">' +
      escapeHtml(competition.status) +
      "</span>" +
      "</div>" +
      '<div class="button-row">' +
      officialButtons +
      "</div>" +
      "</div>" +
      '<div class="detail-meta-card">' +
      detailMetaList(competition) +
      "</div>" +
      "</div>" +
      "</div>" +
      '<section class="detail-grid">' +
      '<article class="panel-panel">' +
      "<h2>" +
      escapeHtml(recommendationTitle) +
      "</h2>" +
      (view
        ? '<div class="view-score"><span class="chip chip-contrast">' +
          escapeHtml(view.recommendation) +
          "</span><strong>优先级分数 " +
          escapeHtml(String(view.priorityScore)) +
          "</strong></div>" +
          "<p>" +
          escapeHtml(view.reason) +
          "</p>" +
          '<p><strong>能力收益：</strong>' +
          escapeHtml(view.gain) +
          "</p>" +
          '<p><strong>投入门槛：</strong>' +
          escapeHtml(view.barrier) +
          "</p>"
        : '<p>当前还没有指定学院 / 专业，所以这里只显示全校结构化结论。顶部选择专业后会切换到对应培养方向的评测。</p>') +
      "</article>" +
      '<article class="panel-panel">' +
      "<h2>全校通用视角</h2>" +
      '<div class="fit-stack">' +
      renderFitHighlights(competition.fitHighlights) +
      "</div>" +
      "</article>" +
      '<article class="panel-panel">' +
      "<h2>低性价比专业提醒</h2>" +
      '<div class="fit-stack">' +
      renderLowFitGroups(competition.lowFitGroups) +
      "</div>" +
      "</article>" +
      '<article class="panel-panel">' +
      "<h2>难度 / 竞争 / 资源门槛</h2>" +
      '<div class="resource-grid">' +
      '<div class="resource-card"><span>难度</span><strong>' +
      escapeHtml(String((competition.securityScores || {}).difficulty || "—")) +
      "/5</strong></div>" +
      '<div class="resource-card"><span>竞争压力</span><strong>' +
      escapeHtml(String((competition.securityScores || {}).pressure || "—")) +
      "/5</strong></div>" +
      '<div class="resource-card"><span>性价比</span><strong>' +
      escapeHtml(String((competition.securityScores || {}).roi || "—")) +
      "/5</strong></div>" +
      "</div>" +
      resourceNoteList(competition.resourceNotes) +
      "</article>" +
      '<article class="panel-panel">' +
      "<h2>获奖策略与判断</h2>" +
      '<div class="bullet-list">' +
      competition.awardNotes
        .map(function (item) {
          return "<p>" + escapeHtml(item) + "</p>";
        })
        .join("") +
      (competition.sharpComment
        ? '<p class="sharp-comment"><strong>锐利评价：</strong>' + escapeHtml(competition.sharpComment) + "</p>"
        : "") +
      "</div>" +
      "</article>" +
      '<article class="panel-panel">' +
      "<h2>同上下文替代项</h2>" +
      '<div class="related-links">' +
      alternatives +
      "</div>" +
      "</article>" +
      "</section>" +
      '<section class="panel-panel markdown-panel">' +
      "<h2>原始调研 Markdown</h2>" +
      '<p class="panel-tip">下方保留的是原始调研条目，主要承接 2026 赛事研究内容；本页上方的结构化结论已经切换到当前专业或学院上下文。</p>' +
      '<article id="markdown-content" class="markdown-body"><p class="loading-text">正在加载 Markdown…</p></article>' +
      "</section>" +
      "</section>";

    loadMarkdown(competition);
  }

  function resourceNoteList(resourceNotes) {
    const entries = Object.entries(resourceNotes || {});
    if (!entries.length) {
      return '<div class="empty-inline">暂无额外资源门槛说明。</div>';
    }
    return (
      '<div class="resource-note-list">' +
      entries
        .map(function (entry) {
          return (
            '<div class="meta-row"><span>' +
            escapeHtml(entry[0]) +
            "</span><strong>" +
            escapeHtml(entry[1]) +
            "</strong></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  async function loadMarkdown(competition) {
    const container = document.getElementById("markdown-content");
    if (!container) return;
    if (store.markdownCache.has(competition.id)) {
      container.innerHTML = store.markdownCache.get(competition.id);
      return;
    }
    try {
      const response = await fetch(competition.mdPath);
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      const markdown = await response.text();
      const htmlContent = window.marked.parse(markdown, { gfm: true, breaks: true });
      store.markdownCache.set(competition.id, htmlContent);
      container.innerHTML = htmlContent;
    } catch (error) {
      container.innerHTML = '<p class="empty-inline">Markdown 加载失败：' + escapeHtml(error.message) + "</p>";
    }
  }

  function render() {
    if (!store.ready) {
      elements.app.innerHTML = '<section class="panel-panel loading-panel"><p>正在载入竞赛知识库…</p></section>';
      return;
    }
    fillSelectors();
    renderContextBar();
    if (currentState.route === "competition" && currentState.competitionId) {
      const competition = store.competitionsById.get(currentState.competitionId);
      if (!competition) {
        elements.app.innerHTML = '<section class="panel-panel empty-panel">没有找到对应比赛。</section>';
        return;
      }
      renderDetailView(competition);
      return;
    }
    if (currentState.route === "competitions") {
      renderCompetitions();
      return;
    }
    renderHome();
  }

  async function shareCurrentState(compId) {
    const hash =
      compId && store.competitionsById.has(compId)
        ? buildHash({ ...currentState, route: "competition", competitionId: compId })
        : buildHash(currentState);
    const url = window.location.origin + window.location.pathname + hash;
    const title = compId && store.competitionsById.has(compId) ? store.competitionsById.get(compId).name : "JSU Match 2.0";
    if (navigator.share) {
      try {
        await navigator.share({ title: title, url: url });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") {
          return;
        }
      }
    }
    await navigator.clipboard.writeText(url);
    showToast("链接已复制");
  }

  function handleAppClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "open-competition") {
      const competitionId = target.getAttribute("data-id");
      setState({ route: "competition", competitionId: competitionId }, { replace: false });
      return;
    }
    if (action === "share-page") {
      shareCurrentState("");
      return;
    }
    if (action === "share-competition") {
      event.stopPropagation();
      const competitionId = target.getAttribute("data-id");
      shareCurrentState(competitionId);
      return;
    }
    if (action === "reset-filters") {
      setState(
        {
          route: "competitions",
          levels: [],
          statuses: [],
          months: [],
          trackTypes: [],
          recommendations: [],
          search: "",
        },
        { replace: true },
      );
    }
  }

  function handleAppChange(event) {
    const input = event.target;
    if (!input.matches("[data-filter-name]")) return;
    const name = input.getAttribute("data-filter-name");
    const nextValues = Array.from(document.querySelectorAll('[data-filter-name="' + name + '"]:checked')).map(function (item) {
      return item.value;
    });
    const patch = {};
    patch[name] = nextValues;
    setState({ route: "competitions", competitionId: "", ...patch }, { replace: true });
  }

  function reindexData() {
    store.colleges = store.majorsPayload.colleges;
    store.majors = store.majorsPayload.majors;
    store.competitions = store.competitionsPayload.competitions;
    store.views = store.viewsPayload.views;

    store.collegesById = new Map(store.colleges.map(function (college) {
      return [college.id, college];
    }));
    store.majorsById = new Map(store.majors.map(function (major) {
      return [major.id, major];
    }));
    store.competitionsById = new Map(store.competitions.map(function (competition) {
      return [competition.id, competition];
    }));
    store.majorViewsByKey = new Map();
    store.collegeViewsByKey = new Map();

    store.views.forEach(function (view) {
      if (view.majorId) {
        store.majorViewsByKey.set(viewKey(view.competitionId, view.majorId), view);
      } else {
        store.collegeViewsByKey.set(viewKey(view.competitionId, view.collegeId), view);
      }
    });
  }

  async function init() {
    const responses = await Promise.all(
      Object.values(DATA_URLS).map(function (url) {
        return fetch(url).then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
          return response.json();
        });
      }),
    );
    store.majorsPayload = responses[0];
    store.competitionsPayload = responses[1];
    store.viewsPayload = responses[2];
    reindexData();
    store.ready = true;
    currentState = normalizeState(parseHashState());
    render();
  }

  elements.collegeSelect.addEventListener("change", function () {
    const collegeId = elements.collegeSelect.value;
    const keepMajor = currentState.majorId && store.majorsById.get(currentState.majorId) && store.majorsById.get(currentState.majorId).collegeId === collegeId;
    setState(
      {
        collegeId: collegeId,
        majorId: keepMajor ? currentState.majorId : "",
        route: currentState.route === "competition" ? "competition" : "home",
      },
      { replace: true },
    );
  });

  elements.majorSelect.addEventListener("change", function () {
    const majorId = elements.majorSelect.value;
    const major = majorId ? store.majorsById.get(majorId) : null;
    setState(
      {
        majorId: majorId,
        collegeId: major ? major.collegeId : currentState.collegeId,
        route: currentState.route === "competition" ? "competition" : "home",
      },
      { replace: true },
    );
  });

  elements.searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    setState(
      {
        search: elements.searchInput.value.trim(),
        route: currentState.route === "competition" ? "competition" : "competitions",
      },
      { replace: true },
    );
  });

  elements.shareContextButton.addEventListener("click", function () {
    shareCurrentState("");
  });
  elements.app.addEventListener("click", handleAppClick);
  elements.app.addEventListener("change", handleAppChange);

  window.addEventListener("hashchange", function () {
    currentState = normalizeState(parseHashState());
    render();
  });

  init().catch(function (error) {
    elements.app.innerHTML =
      '<section class="panel-panel empty-panel"><h2>初始化失败</h2><p>' +
      escapeHtml(error.message) +
      "</p></section>";
  });
})();
