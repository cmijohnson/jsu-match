(function () {
  const DATA_URLS = {
    majors: "./data/majors.json",
    competitions: "./data/competitions.json",
    views: "./data/profession-views.json",
  };

  const LEVEL_ORDER = { "A+": 3, A: 2, B: 1 };
  const STATUS_ORDER = { 进行中: 4, 未开始: 3, 已结束: 2, 未发布: 1 };
  const RECOMMENDATION_ORDER = { 主推: 3, 可参加: 2, 不建议: 1, 待选专业: 0 };
  const MONTH_OPTIONS = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
    "待发布/未知",
  ];
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
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
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
    return value ? value.split(",").map(function (item) { return item.trim(); }).filter(Boolean) : [];
  }

  function dedupe(values) {
    return Array.from(new Set(values));
  }

  function viewKey(competitionId, scopeId) {
    return competitionId + "::" + scopeId;
  }

  function parseHashState() {
    const raw = window.location.hash.replace(/^#/, "") || "/home";
    const parts = raw.split("?");
    const pathPart = parts[0] || "/home";
    const queryPart = parts[1] || "";
    const params = new URLSearchParams(queryPart);
    const routeState = { ...DEFAULT_STATE };
    let path = pathPart;

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

    if (!store.ready) {
      return state;
    }

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

    if (!state.collegeId && !state.majorId) {
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
      render();
      return;
    }
    if (window.location.hash !== nextHash) {
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
    return currentState.majorId ? store.majorsById.get(currentState.majorId) || null : null;
  }

  function currentCollege() {
    if (currentState.majorId) {
      const major = currentMajor();
      return major ? store.collegesById.get(major.collegeId) || null : null;
    }
    return currentState.collegeId ? store.collegesById.get(currentState.collegeId) || null : null;
  }

  function currentCluster() {
    const major = currentMajor();
    if (!major || !store.majorsPayload || !store.majorsPayload.clusters) {
      return null;
    }
    return store.majorsPayload.clusters.find(function (cluster) {
      return cluster.id === major.clusterId;
    }) || null;
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
    if (view.recommendation === "主推") {
      return { label: view.recommendation, tone: "strong" };
    }
    if (view.recommendation === "可参加") {
      return { label: view.recommendation, tone: "mid" };
    }
    return { label: view.recommendation, tone: "weak" };
  }

  function statusClass(status) {
    if (status === "未开始") return "is-upcoming";
    if (status === "进行中") return "is-running";
    if (status === "已结束") return "is-ended";
    return "is-unpublished";
  }

  function recommendationClass(tone) {
    if (tone === "strong") return "is-strong";
    if (tone === "mid") return "is-mid";
    if (tone === "weak") return "is-weak";
    return "is-neutral";
  }

  function syncNav() {
    const activeKey = currentState.route === "home" ? "/home" : "/competitions";
    document.querySelectorAll("[data-nav-link]").forEach(function (link) {
      const target = link.getAttribute("href");
      const isActive = activeKey === "/home" ? target === "#/home" : target === "#/competitions";
      link.classList.toggle("is-active", isActive);
    });
  }

  function fillSelectors() {
    const collegeOptions = ['<option value="">全校视角</option>']
      .concat(
        store.colleges.map(function (college) {
          return '<option value="' + escapeHtml(college.id) + '">' + escapeHtml(college.name) + "</option>";
        }),
      )
      .join("");

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

    elements.collegeSelect.innerHTML = collegeOptions;
    elements.majorSelect.innerHTML = majorOptions;
    elements.collegeSelect.value = currentState.collegeId;
    elements.majorSelect.value = currentState.majorId;
    elements.searchInput.value = currentState.search;
  }

  function renderContextBar() {
    const major = currentMajor();
    const college = currentCollege();
    const cluster = currentCluster();
    const breadcrumb = ['<a href="#/home">全校</a>'];

    if (college) {
      breadcrumb.push(escapeHtml(college.name));
    }
    if (major) {
      breadcrumb.push(escapeHtml(major.name));
    }
    elements.contextBreadcrumb.innerHTML = breadcrumb.join('<span class="slash">/</span>');

    if (major) {
      const coreSkills = (major.coreSkills || []).slice(0, 4).join("、") || "待补充";
      const clusterLabel = cluster ? cluster.label : "专业视角";
      elements.contextSummary.innerHTML =
        '<span class="summary-chip">专业上下文</span>' +
        '<span>' + escapeHtml(clusterLabel) + " · 核心能力：" + escapeHtml(coreSkills) + "</span>";
      return;
    }

    if (college) {
      elements.contextSummary.innerHTML =
        '<span class="summary-chip">学院上下文</span>' +
        "<span>当前按学院聚合推荐；继续选择专业后，会显示更细的适配度与替代赛事结论。</span>";
      return;
    }

    elements.contextSummary.innerHTML =
      '<span class="summary-chip">全校模式</span>' +
      "<span>先选择学院或专业，再用搜索和组合筛选定位适合本专业的竞赛条目。</span>";
  }

  function filteredCompetitions() {
    const normalizedSearch = currentState.search.trim().toLowerCase();

    const list = store.competitions.filter(function (competition) {
      if (currentState.levels.length && currentState.levels.indexOf(competition.level) === -1) {
        return false;
      }
      if (currentState.statuses.length && currentState.statuses.indexOf(competition.status) === -1) {
        return false;
      }
      if (
        currentState.months.length &&
        !(competition.monthTags || []).some(function (month) {
          return currentState.months.indexOf(month) !== -1;
        })
      ) {
        return false;
      }
      if (
        currentState.trackTypes.length &&
        !(competition.trackTypes || []).some(function (type) {
          return currentState.trackTypes.indexOf(type) !== -1;
        })
      ) {
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
        competition.cardSummary || "",
        (competition.tags || []).join(" "),
        competition.sharpComment || "",
        view ? view.reason : "",
        view ? view.gain : "",
        view ? view.barrier : "",
      ]
        .join(" ")
        .toLowerCase();

      return terms.indexOf(normalizedSearch) !== -1;
    });

    return list.slice().sort(function (left, right) {
      const leftView = contextualView(left.id);
      const rightView = contextualView(right.id);
      const leftRecommendation = leftView ? RECOMMENDATION_ORDER[leftView.recommendation] || 0 : 0;
      const rightRecommendation = rightView ? RECOMMENDATION_ORDER[rightView.recommendation] || 0 : 0;

      if (rightRecommendation !== leftRecommendation) {
        return rightRecommendation - leftRecommendation;
      }
      if (rightView && leftView && rightView.priorityScore !== leftView.priorityScore) {
        return rightView.priorityScore - leftView.priorityScore;
      }
      if ((STATUS_ORDER[right.status] || 0) !== (STATUS_ORDER[left.status] || 0)) {
        return (STATUS_ORDER[right.status] || 0) - (STATUS_ORDER[left.status] || 0);
      }
      if ((LEVEL_ORDER[right.level] || 0) !== (LEVEL_ORDER[left.level] || 0)) {
        return (LEVEL_ORDER[right.level] || 0) - (LEVEL_ORDER[left.level] || 0);
      }
      return left.id.localeCompare(right.id);
    });
  }

  function topStats(competitions) {
    return {
      total: competitions.length,
      published: competitions.filter(function (item) { return item.status !== "未发布"; }).length,
      running: competitions.filter(function (item) { return item.status === "进行中"; }).length,
      upcoming: competitions.filter(function (item) { return item.status === "未开始"; }).length,
    };
  }

  function recommendationStats(competitions) {
    const counts = { 主推: 0, 可参加: 0, 不建议: 0 };
    competitions.forEach(function (competition) {
      const view = contextualView(competition.id);
      if (view && counts.hasOwnProperty(view.recommendation)) {
        counts[view.recommendation] += 1;
      }
    });
    return counts;
  }

  function trackLabel(type) {
    return TRACK_LABELS[type] || type;
  }

  function buildCompetitionHash(competitionId) {
    return buildHash({ ...currentState, route: "competition", competitionId: competitionId });
  }

  function renderActionAnchor(label, href, extraClass, title) {
    if (!href) {
      return '<span class="action-link disabled-link">' + escapeHtml(label) + "</span>";
    }
    return (
      '<a class="' +
      escapeHtml(extraClass || "action-link") +
      '" href="' +
      escapeHtml(href) +
      '" target="_blank" rel="noreferrer"' +
      (title ? ' title="' + escapeHtml(title) + '"' : "") +
      ">" +
      escapeHtml(label) +
      "</a>"
    );
  }

  function renderShareButton(competitionId) {
    return (
      '<button class="share-link" type="button" data-action="share-competition" data-id="' +
      escapeHtml(competitionId) +
      '">分享</button>'
    );
  }

  function renderEntry(competition, options) {
    const view = contextualView(competition.id);
    const badge = recommendationBadge(competition.id);
    const summary =
      options && options.useReason && view
        ? view.reason
        : competition.cardSummary || competition.summary || "暂无摘要";

    const tags = dedupe(
      []
        .concat((competition.trackTypes || []).map(trackLabel))
        .concat((competition.tags || []).filter(function (item) { return item !== competition.trackType; }).slice(0, 2)),
    ).slice(0, 4);

    return (
      '<article class="entry-row">' +
      '<div class="entry-main">' +
      '<div class="entry-title-line">' +
      '<span class="entry-id">#' + escapeHtml(competition.id) + "</span>" +
      '<a class="entry-title" href="' + escapeHtml(buildCompetitionHash(competition.id)) + '">' + escapeHtml(competition.name) + "</a>" +
      "</div>" +
      '<div class="entry-meta">' +
      '<span class="recommendation-badge ' + recommendationClass(badge.tone) + '">' + escapeHtml(badge.label) + "</span>" +
      '<span class="meta-chip">' + escapeHtml(competition.level) + "</span>" +
      '<span class="status-badge ' + statusClass(competition.status) + '">' + escapeHtml(competition.status) + "</span>" +
      '<span class="meta-chip">' + escapeHtml(competition.trackType) + "</span>" +
      "</div>" +
      '<p class="entry-summary">' + escapeHtml(summary) + "</p>" +
      '<div class="entry-tags">' +
      tags.map(function (tag) {
        return '<span class="soft-tag">' + escapeHtml(tag) + "</span>";
      }).join("") +
      "</div>" +
      "</div>" +
      '<div class="entry-aside">' +
      '<div class="entry-side-block">' +
      '<span class="entry-side-label">举办时间</span>' +
      '<span class="entry-side-value">' + escapeHtml(competition.displayTime || "待官方发布") + "</span>" +
      "</div>" +
      '<div class="entry-side-block">' +
      '<span class="entry-side-label">信息状态</span>' +
      '<span class="entry-side-value">' + escapeHtml(competition.infoStatus || "待补充") + "</span>" +
      "</div>" +
      '<div class="entry-actions">' +
      renderActionAnchor("官网", competition.officialSite, "action-link", "官方站点") +
      renderActionAnchor("通知", competition.officialNotice, "action-link", "官方通知或可信转发") +
      renderActionAnchor("报名", competition.signupLink, "action-link", "报名入口或报名说明") +
      renderShareButton(competition.id) +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function statBox(label, value, hint) {
    return (
      '<div class="stat-box">' +
      "<span>" + escapeHtml(label) + "</span>" +
      "<strong>" + escapeHtml(String(value)) + "</strong>" +
      '<small class="panel-tip">' + escapeHtml(hint) + "</small>" +
      "</div>"
    );
  }

  function quickLink(label, desc, patch) {
    const hash = buildHash(normalizeState({ ...currentState, route: "competitions", ...patch }));
    return (
      '<a class="quick-link" href="' + escapeHtml(hash) + '">' +
      "<span>" + escapeHtml(desc) + "</span>" +
      "<strong>" + escapeHtml(label) + "</strong>" +
      "</a>"
    );
  }

  function renderContextProfile() {
    const major = currentMajor();
    const college = currentCollege();
    const cluster = currentCluster();

    if (major) {
      return (
        '<div class="context-profile">' +
        '<div class="context-kv">' +
        '<div class="kv-box"><span>当前学院</span><strong>' + escapeHtml(college ? college.name : "未指定") + "</strong></div>" +
        '<div class="kv-box"><span>当前专业</span><strong>' + escapeHtml(major.name) + "</strong></div>" +
        '<div class="kv-box"><span>专业关键词</span><strong>' + escapeHtml((major.keywords || []).slice(0, 4).join("、") || "待补充") + "</strong></div>" +
        '<div class="kv-box"><span>核心能力</span><strong>' + escapeHtml((major.coreSkills || []).slice(0, 4).join("、") || "待补充") + "</strong></div>" +
        "</div>" +
        '<div class="note-box"><strong>推荐关注方向</strong><p>' + escapeHtml(major.mainline || (cluster ? cluster.strengths : "待补充")) + "</p></div>" +
        "</div>"
      );
    }

    if (college) {
      return (
        '<div class="context-profile">' +
        '<div class="context-kv">' +
        '<div class="kv-box"><span>当前学院</span><strong>' + escapeHtml(college.name) + "</strong></div>" +
        '<div class="kv-box"><span>当前专业</span><strong>未指定</strong></div>' +
        '<div class="kv-box"><span>已收录专业数</span><strong>' +
        escapeHtml(String(store.majors.filter(function (item) { return item.collegeId === college.id; }).length)) +
        "</strong></div>" +
        '<div class="kv-box"><span>当前视角</span><strong>学院聚合推荐</strong></div>' +
        "</div>" +
        '<div class="note-box"><strong>使用建议</strong><p>先按学院看整体可参赛版图，再切换到具体专业查看更精细的适配度和替代赛事。</p></div>' +
        "</div>"
      );
    }

    return (
      '<div class="context-profile">' +
      '<div class="context-kv">' +
      '<div class="kv-box"><span>当前学院</span><strong>全校视角</strong></div>' +
      '<div class="kv-box"><span>当前专业</span><strong>未指定</strong></div>' +
      '<div class="kv-box"><span>知识范围</span><strong>103 项竞赛条目</strong></div>' +
      '<div class="kv-box"><span>使用方式</span><strong>先选专业，再筛选</strong></div>' +
      "</div>" +
      '<div class="note-box"><strong>如何使用本站</strong><p>顶部选择学院与专业后，推荐排序、比赛详情评语、搜索结果与分享链接都会自动切换到对应上下文。</p></div>' +
      "</div>"
    );
  }

  function renderHome() {
    const stats = topStats(store.competitions);
    const major = currentMajor();
    const contextCounts = recommendationStats(store.competitions);
    const list = filteredCompetitions();
    const featuredIds = major ? major.featuredCompetitionIds || [] : [];
    const featuredList = featuredIds
      .map(function (id) {
        return store.competitionsById.get(id);
      })
      .filter(Boolean);
    const recommended = (featuredList.length ? featuredList : list).slice(0, 8);

    elements.app.innerHTML =
      '<section class="wiki-home">' +
      '<div class="portal-grid">' +
      '<section class="portal-panel">' +
      '<div class="portal-header">' +
      "<h1>江苏大学竞赛知识库</h1>" +
      '<p class="lede">按学院与专业切换视角，查看竞赛条目、结构化评估、官网入口与原始调研 Markdown。首页更像门户，详情页更像词条。</p>' +
      '<div class="article-meta-chips">' +
      '<span class="stat-badge">总赛事 ' + escapeHtml(String(stats.total)) + "</span>" +
      '<span class="meta-chip">已发布 ' + escapeHtml(String(stats.published)) + "</span>" +
      '<span class="meta-chip">进行中 ' + escapeHtml(String(stats.running)) + "</span>" +
      '<span class="meta-chip">未开始 ' + escapeHtml(String(stats.upcoming)) + "</span>" +
      (major
        ? '<span class="meta-chip">主推 ' + escapeHtml(String(contextCounts["主推"])) + "</span>"
        : "") +
      "</div>" +
      "</div>" +
      renderContextProfile() +
      "</section>" +
      '<aside class="portal-panel">' +
      '<div class="section-head"><div><h2>快速入口</h2><p>按照当前学院 / 专业上下文跳转到对应筛选结果。</p></div></div>' +
      '<div class="quick-links-grid">' +
      quickLink("主推赛事", "推荐等级", { recommendations: ["主推"] }) +
      quickLink("A+ 赛事", "赛事等级", { levels: ["A+"] }) +
      quickLink("未开始", "状态索引", { statuses: ["未开始"] }) +
      quickLink("待发布或未知", "月份索引", { months: ["待发布/未知"] }) +
      "</div>" +
      '<div class="stats-grid">' +
      statBox("总赛事数", stats.total, "固定基线") +
      statBox("已发布数", stats.published, "含明确 2026 节点") +
      statBox("当前可跟进", stats.running + stats.upcoming, "进行中 + 未开始") +
      statBox("当前专业主推", major ? contextCounts["主推"] : "—", major ? "基于当前专业视角" : "先选择专业") +
      "</div>" +
      "</aside>" +
      "</div>" +
      '<div class="portal-columns">' +
      '<section class="portal-panel">' +
      '<div class="section-head"><div><h2>推荐赛事</h2><p>默认按当前上下文排序；点击条目进入词条页。</p></div><a class="list-link" href="#/competitions">查看全部</a></div>' +
      '<div class="recommended-list">' +
      recommended.map(function (competition) { return renderEntry(competition, { useReason: true }); }).join("") +
      "</div>" +
      "</section>" +
      '<aside class="portal-panel">' +
      '<div class="section-head"><div><h2>导读</h2><p>先定专业，再定赛道，再看时间与状态。</p></div></div>' +
      '<div class="topic-grid">' +
      '<div class="topic-box"><span>步骤 1</span><strong>先选学院与专业</strong><p class="panel-tip">决定推荐排序、详情评语与替代赛事。</p></div>' +
      '<div class="topic-box"><span>步骤 2</span><strong>用总览页做组合筛选</strong><p class="panel-tip">支持等级、月份、状态、赛制类型和推荐等级多选。</p></div>' +
      '<div class="topic-box"><span>步骤 3</span><strong>进入词条页核对外链</strong><p class="panel-tip">每个条目都尽量保留官网、通知、报名入口和原始 Markdown。</p></div>' +
      "</div>" +
      "</aside>" +
      "</div>" +
      "</section>";
  }

  function filterBlock(title, name, items, selectedItems, disabled) {
    return (
      '<section class="filter-group">' +
      "<h3>" + escapeHtml(title) + "</h3>" +
      '<div class="filter-chip-grid">' +
      items.map(function (item) {
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
          "<span>" + escapeHtml(item.label) + "</span>" +
          "</label>"
        );
      }).join("") +
      "</div>" +
      "</section>"
    );
  }

  function renderCompetitions() {
    const list = filteredCompetitions();
    const recommendationDisabled = !currentState.collegeId && !currentState.majorId;
    const summaryParts = [];

    if (currentState.levels.length) summaryParts.push("等级：" + currentState.levels.join(" / "));
    if (currentState.statuses.length) summaryParts.push("状态：" + currentState.statuses.join(" / "));
    if (currentState.months.length) summaryParts.push("月份：" + currentState.months.join(" / "));
    if (currentState.trackTypes.length) {
      summaryParts.push(
        "赛制：" +
          currentState.trackTypes.map(function (item) {
            return TRACK_LABELS[item] || item;
          }).join(" / "),
      );
    }
    if (currentState.recommendations.length) summaryParts.push("推荐：" + currentState.recommendations.join(" / "));
    if (currentState.search) summaryParts.push('搜索：“' + currentState.search + "”");

    elements.app.innerHTML =
      '<section class="wiki-directory">' +
      '<section class="filter-panel">' +
      '<div class="section-head"><div><h2>赛事总览</h2><p>这里是维基式分类目录页，条目保持紧凑，筛选支持叠加。</p></div>' +
      '<button class="ghost-button" type="button" data-action="reset-filters">清空筛选</button></div>' +
      '<div class="filter-toolbar">' +
      filterBlock(
        "赛事等级",
        "levels",
        ["A+", "A", "B"].map(function (item) { return { value: item, label: item }; }),
        currentState.levels,
        false,
      ) +
      filterBlock(
        "举办月份",
        "months",
        MONTH_OPTIONS.map(function (item) { return { value: item, label: item }; }),
        currentState.months,
        false,
      ) +
      filterBlock(
        "状态",
        "statuses",
        ["未发布", "未开始", "进行中", "已结束"].map(function (item) { return { value: item, label: item }; }),
        currentState.statuses,
        false,
      ) +
      filterBlock(
        "赛制类型",
        "trackTypes",
        Object.keys(TRACK_LABELS).map(function (key) { return { value: key, label: TRACK_LABELS[key] }; }),
        currentState.trackTypes,
        false,
      ) +
      "</div>" +
      filterBlock(
        "推荐等级",
        "recommendations",
        ["主推", "可参加", "不建议"].map(function (item) { return { value: item, label: item }; }),
        currentState.recommendations,
        recommendationDisabled,
      ) +
      (recommendationDisabled
        ? '<p class="panel-tip">推荐等级依赖学院或专业上下文。先在顶部选择学院或专业，再启用这一组筛选。</p>'
        : "") +
      '<div class="toolbar-meta">' +
      '<p class="toolbar-summary">' +
      escapeHtml(summaryParts.length ? summaryParts.join(" · ") : "当前未启用额外筛选，展示按上下文排序的全量结果。") +
      "</p>" +
      '<span class="meta-chip">结果数 ' + escapeHtml(String(list.length)) + "</span>" +
      "</div>" +
      "</section>" +
      '<section class="entry-list">' +
      (list.length
        ? list.map(function (competition) { return renderEntry(competition, { useReason: false }); }).join("")
        : '<section class="empty-panel">没有匹配结果。可以清空筛选，或切换专业后再试。</section>') +
      "</section>" +
      "</section>";
  }

  function renderFitHighlights(items) {
    if (!items || !items.length) {
      return '<p class="empty-inline">暂无全校适配摘要。</p>';
    }
    return (
      '<div class="fit-list">' +
      items.slice(0, 6).map(function (item) {
        return (
          '<article class="fit-item">' +
          '<span class="soft-tag">' + escapeHtml(item.badge || "适配") + "</span>" +
          "<strong>" + escapeHtml(item.major || "未指定专业") + "</strong>" +
          "<p>" + escapeHtml(item.reason || "暂无说明") + "</p>" +
          "</article>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderLowFitGroups(items) {
    if (!items || !items.length) {
      return '<p class="empty-inline">暂无明确的不建议专业组提示。</p>';
    }
    return (
      '<div class="lowfit-list">' +
      items.slice(0, 6).map(function (item) {
        return (
          '<article class="lowfit-item">' +
          "<strong>" + escapeHtml(item.group || "待补充") + "</strong>" +
          "<p>" + escapeHtml(item.reason || "暂无说明") + "</p>" +
          "</article>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderResourceNotes(resourceNotes) {
    const entries = Object.entries(resourceNotes || {});
    if (!entries.length) {
      return '<p class="empty-inline">暂无额外资源门槛说明。</p>';
    }
    return (
      '<div class="detail-grid">' +
      entries.map(function (entry) {
        return (
          '<div class="note-box">' +
          "<strong>" + escapeHtml(entry[0]) + "</strong>" +
          "<p>" + escapeHtml(entry[1]) + "</p>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderAlternatives(view) {
    if (!view || !view.alternatives || !view.alternatives.length) {
      return '<p class="empty-inline">当前上下文下暂无替代赛事建议。</p>';
    }
    return (
      '<div class="related-list">' +
      view.alternatives.map(function (competitionId) {
        const item = store.competitionsById.get(competitionId);
        if (!item) return "";
        return (
          '<a class="list-link" href="' + escapeHtml(buildCompetitionHash(item.id)) + '">' +
          escapeHtml(item.name) +
          "</a>"
        );
      }).join("") +
      "</div>"
    );
  }

  function infoboxRow(label, value) {
    return (
      '<div class="infobox-row">' +
      "<dt>" + escapeHtml(label) + "</dt>" +
      "<dd>" + escapeHtml(value || "待补充") + "</dd>" +
      "</div>"
    );
  }

  function renderDetailView(competition) {
    const view = contextualView(competition.id);
    const badge = recommendationBadge(competition.id);
    const major = currentMajor();
    const college = currentCollege();
    const currentViewTitle = major
      ? (college ? college.name + " · " : "") + major.name + " 视角"
      : college
      ? college.name + " 聚合视角"
      : "当前未指定专业";

    elements.app.innerHTML =
      '<section class="wiki-detail">' +
      '<div class="article-main">' +
      '<div class="article-tools"><a class="back-link" href="#/competitions">返回赛事总览</a></div>' +
      '<article class="article-shell">' +
      '<header class="article-header">' +
      "<h1>" + escapeHtml(competition.name) + "</h1>" +
      '<p class="lede">' + escapeHtml(competition.summary || "暂无摘要") + "</p>" +
      '<div class="article-meta-chips">' +
      '<span class="recommendation-badge ' + recommendationClass(badge.tone) + '">' + escapeHtml(badge.label) + "</span>" +
      '<span class="meta-chip">' + escapeHtml(competition.level) + "</span>" +
      '<span class="status-badge ' + statusClass(competition.status) + '">' + escapeHtml(competition.status) + "</span>" +
      '<span class="meta-chip">' + escapeHtml(competition.trackType) + "</span>" +
      '<span class="meta-chip">#' + escapeHtml(competition.id) + "</span>" +
      "</div>" +
      "</header>" +
      '<section id="section-current-view" class="article-section">' +
      "<h2>当前专业视角评测</h2>" +
      (view
        ? '<div class="note-box"><strong>' + escapeHtml(currentViewTitle) + "</strong><p>" + escapeHtml(view.reason || "暂无说明") + "</p></div>" +
          '<div class="detail-grid">' +
          '<div class="note-box"><strong>能力收益</strong><p>' + escapeHtml(view.gain || "待补充") + "</p></div>" +
          '<div class="note-box"><strong>投入门槛</strong><p>' + escapeHtml(view.barrier || "待补充") + "</p></div>" +
          "</div>"
        : '<p class="article-note">当前未指定学院或专业，因此这里只显示全校结构化结论。顶部选择学院 / 专业后，这一节会切换到对应视角。</p>') +
      "</section>" +
      '<section id="section-general-view" class="article-section">' +
      "<h2>全校通用视角</h2>" +
      renderFitHighlights(competition.fitHighlights) +
      "</section>" +
      '<section id="section-format-resources" class="article-section">' +
      "<h2>赛制与资源门槛</h2>" +
      '<div class="resource-grid">' +
      '<div class="resource-box"><span>难度</span><strong>' + escapeHtml(String((competition.securityScores || {}).difficulty || "—")) + "/5</strong></div>" +
      '<div class="resource-box"><span>竞争压力</span><strong>' + escapeHtml(String((competition.securityScores || {}).pressure || "—")) + "/5</strong></div>" +
      '<div class="resource-box"><span>性价比</span><strong>' + escapeHtml(String((competition.securityScores || {}).roi || "—")) + "/5</strong></div>" +
      "</div>" +
      renderResourceNotes(competition.resourceNotes) +
      (competition.awardNotes && competition.awardNotes.length
        ? '<div class="article-stack">' +
          competition.awardNotes.map(function (item) {
            return '<div class="note-box"><p>' + escapeHtml(item) + "</p></div>";
          }).join("") +
          (competition.sharpComment ? '<div class="note-box"><strong>备注</strong><p>' + escapeHtml(competition.sharpComment) + "</p></div>" : "") +
          "</div>"
        : "") +
      "</section>" +
      '<section id="section-lowfit" class="article-section">' +
      "<h2>不建议或低性价比专业提醒</h2>" +
      renderLowFitGroups(competition.lowFitGroups) +
      "</section>" +
      '<section id="section-alternatives" class="article-section">' +
      "<h2>替代赛事</h2>" +
      renderAlternatives(view) +
      "</section>" +
      '<section id="section-original" class="markdown-shell">' +
      "<h2>原始 Markdown 条目</h2>" +
      '<p class="article-note">这一部分保留原始调研内容；上方几节则是结合当前专业上下文生成的结构化阅读入口。</p>' +
      '<article id="markdown-content" class="markdown-body"><p class="panel-tip">正在加载 Markdown…</p></article>' +
      "</section>" +
      "</article>" +
      "</div>" +
      '<aside class="article-sidebar">' +
      '<section class="infobox">' +
      "<h2>条目信息</h2>" +
      '<dl class="infobox-list">' +
      infoboxRow("赛事名称", competition.name) +
      infoboxRow("赛事等级", competition.level) +
      infoboxRow("当前状态", competition.status) +
      infoboxRow("举办时间", competition.displayTime || "待官方发布") +
      infoboxRow("推荐等级", badge.label) +
      infoboxRow("赛制类型", competition.trackType) +
      infoboxRow("信息状态", competition.infoStatus || "待补充") +
      "</dl>" +
      '<div class="infobox-actions">' +
      renderActionAnchor("官网", competition.officialSite, "action-link", "官方站点") +
      renderActionAnchor("通知", competition.officialNotice, "action-link", "官方通知或可信转发") +
      renderActionAnchor("报名入口", competition.signupLink, "action-link", "报名入口或报名说明") +
      '<button class="ghost-button" type="button" data-action="share-page">分享本页</button>' +
      "</div>" +
      "</section>" +
      '<section class="toc-box" id="detail-toc"><h3>目录</h3><div class="panel-tip">正在生成目录…</div></section>' +
      "</aside>" +
      "</section>";

    loadMarkdown(competition);
    renderDetailToc([]);
  }

  function slugify(value, index) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized ? "md-" + normalized : "md-section-" + String(index + 1);
  }

  function extractMarkdownHeadings(container) {
    const headings = [];
    const nodes = Array.from(container.querySelectorAll("h2, h3, h4"));
    nodes.forEach(function (heading, index) {
      if (!heading.id) {
        heading.id = slugify(heading.textContent, index);
      }
      headings.push({
        id: heading.id,
        text: heading.textContent || "未命名小节",
        level: Number(heading.tagName.slice(1)),
      });
    });
    return headings;
  }

  function renderDetailToc(markdownHeadings) {
    const toc = document.getElementById("detail-toc");
    if (!toc) return;

    const baseHeadings = [
      { id: "section-current-view", text: "当前专业视角评测", level: 2 },
      { id: "section-general-view", text: "全校通用视角", level: 2 },
      { id: "section-format-resources", text: "赛制与资源门槛", level: 2 },
      { id: "section-lowfit", text: "低性价比专业提醒", level: 2 },
      { id: "section-alternatives", text: "替代赛事", level: 2 },
      { id: "section-original", text: "原始 Markdown 条目", level: 2 },
    ].concat(markdownHeadings || []);

    toc.innerHTML =
      "<h3>目录</h3>" +
      '<ol class="toc-list">' +
      baseHeadings.map(function (item) {
        return (
          '<li class="toc-item level-' + escapeHtml(String(item.level)) + '">' +
          '<button class="toc-link" type="button" data-action="scroll-target" data-target="' + escapeHtml(item.id) + '">' + escapeHtml(item.text) + "</button>" +
          "</li>"
        );
      }).join("") +
      "</ol>";
  }

  async function loadMarkdown(competition) {
    const container = document.getElementById("markdown-content");
    if (!container) return;

    try {
      let htmlContent = store.markdownCache.get(competition.id);
      if (!htmlContent) {
        const response = await fetch(competition.mdPath);
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        const markdown = await response.text();
        htmlContent = window.marked
          ? window.marked.parse(markdown, { gfm: true, breaks: true })
          : "<pre>" + escapeHtml(markdown) + "</pre>";
        store.markdownCache.set(competition.id, htmlContent);
      }

      container.innerHTML = htmlContent;
      renderDetailToc(extractMarkdownHeadings(container));
    } catch (error) {
      container.innerHTML = '<p class="empty-inline">Markdown 加载失败：' + escapeHtml(error.message) + "</p>";
      renderDetailToc([]);
    }
  }

  async function shareCurrentState(compId) {
    const hash =
      compId && store.competitionsById.has(compId)
        ? buildHash({ ...currentState, route: "competition", competitionId: compId })
        : buildHash(currentState);
    const url = window.location.origin + window.location.pathname + hash;
    const title = compId && store.competitionsById.has(compId)
      ? store.competitionsById.get(compId).name
      : "JSU Match 竞赛知识库";

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
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.getAttribute("data-action");

    if (action === "share-page") {
      shareCurrentState("");
      return;
    }

    if (action === "share-competition") {
      const competitionId = actionTarget.getAttribute("data-id");
      shareCurrentState(competitionId);
      return;
    }

    if (action === "reset-filters") {
      setState(
        {
          route: "competitions",
          competitionId: "",
          search: "",
          levels: [],
          statuses: [],
          months: [],
          trackTypes: [],
          recommendations: [],
        },
        { replace: true },
      );
      return;
    }

    if (action === "scroll-target") {
      const targetId = actionTarget.getAttribute("data-target");
      const targetNode = targetId ? document.getElementById(targetId) : null;
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function handleAppChange(event) {
    const input = event.target;
    if (!input.matches("[data-filter-name]")) return;
    const name = input.getAttribute("data-filter-name");
    const checked = Array.from(document.querySelectorAll('[data-filter-name="' + name + '"]:checked')).map(function (item) {
      return item.value;
    });
    const patch = {};
    patch[name] = checked;
    setState({ route: "competitions", competitionId: "", ...patch }, { replace: true });
  }

  function reindexData() {
    store.colleges = store.majorsPayload.colleges || [];
    store.majors = store.majorsPayload.majors || [];
    store.competitions = store.competitionsPayload.competitions || [];
    store.views = store.viewsPayload.views || [];

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
      } else if (view.collegeId) {
        store.collegeViewsByKey.set(viewKey(view.competitionId, view.collegeId), view);
      }
    });
  }

  function render() {
    if (!store.ready) {
      elements.app.innerHTML = '<section class="loading-panel">正在载入竞赛知识库…</section>';
      return;
    }

    syncNav();
    fillSelectors();
    renderContextBar();

    if (currentState.route === "competition" && currentState.competitionId) {
      const competition = store.competitionsById.get(currentState.competitionId);
      if (!competition) {
        elements.app.innerHTML = '<section class="empty-panel">没有找到对应比赛。</section>';
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

  async function init() {
    const urls = Object.values(DATA_URLS);
    const responses = await Promise.all(
      urls.map(function (url) {
        return fetch(url).then(function (response) {
          if (!response.ok) {
            throw new Error("HTTP " + response.status + " for " + url);
          }
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
    const currentMajorId = currentState.majorId;
    const keepMajor =
      currentMajorId &&
      store.majorsById.has(currentMajorId) &&
      store.majorsById.get(currentMajorId).collegeId === collegeId;

    setState(
      {
        collegeId: collegeId,
        majorId: keepMajor ? currentMajorId : "",
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
        route: currentState.route === "competition" ? "competitions" : "competitions",
        competitionId: "",
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
      '<section class="empty-panel">初始化失败：' + escapeHtml(error.message) + "</section>";
  });
})();
