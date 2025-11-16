document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "https://youtube-trending-analytics-copilot.up.railway.app";
  const SNAPSHOT_KEY = "yt_trending_snapshots";

  const regionSelect = document.getElementById("region");
  const limitInput = document.getElementById("limit");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  const categoryFilterSelect = document.getElementById("categoryFilter");
  const loadBtn = document.getElementById("loadBtn");
  const statusEl = document.getElementById("status");

  const metricsGrid = document.getElementById("metricsGrid");
  const videosTableBody = document.getElementById("videosTableBody");

  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");

  const saveSnapshotBtn = document.getElementById("saveSnapshotBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const savedInfoEl = document.getElementById("savedInfo");

  const snapshotsEmptyEl = document.getElementById("snapshotsEmpty");
  const snapshotsTableContainer = document.getElementById("snapshotsTableContainer");
  const snapshotsTableBody = document.getElementById("snapshotsTableBody");

  let lastRawTrending = null;
  let lastFilteredVideos = null;
  let lastMetrics = null;

  // ---------- Utility helpers ----------
  function formatInt(n) {
    if (n == null) return "N/A";
    return n.toLocaleString("en-IN");
  }

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "N/A";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h) parts.push(h + "h");
    if (m) parts.push(m + "m");
    if (s && !h) parts.push(s + "s");
    return parts.join(" ");
  }

  function videoDate(v) {
    return (v.published_at || "").slice(0, 10);
  }

  function applyDateFilter(videos, startDate, endDate) {
    if (!startDate && !endDate) return videos;
    return videos.filter(v => {
      const d = videoDate(v);
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }

  function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function computeMetricsFromVideos(videos, region) {
    if (!videos || !videos.length) {
      return {
        region,
        totalVideos: 0,
        totalViews: 0,
        avgViews: 0,
        medianViews: 0,
        topChannelByVideos: null,
        topChannelVideoCount: 0,
        topChannelByViews: null,
        topChannelTotalViews: 0,
        medianLikeRate: 0,
        medianCommentRate: 0
      };
    }

    const viewsArr = videos.map(v => v.view_count || 0);
    const totalViews = viewsArr.reduce((a, b) => a + b, 0);
    const avgViews = totalViews / viewsArr.length;
    const medianViews = median(viewsArr);

    const likeRates = [];
    const commentRates = [];
    for (const v of videos) {
      if (v.view_count && v.like_count != null) {
        likeRates.push(v.like_count / v.view_count);
      }
      if (v.view_count && v.comment_count != null) {
        commentRates.push(v.comment_count / v.view_count);
      }
    }
    const medianLikeRate = median(likeRates);
    const medianCommentRate = median(commentRates);

    const channelCounts = new Map();
    const channelViews = new Map();
    for (const v of videos) {
      const ch = v.channel_title || "Unknown";
      channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
      channelViews.set(ch, (channelViews.get(ch) || 0) + (v.view_count || 0));
    }

    let topChannelByVideos = null;
    let topChannelVideoCount = 0;
    for (const [ch, count] of channelCounts.entries()) {
      if (count > topChannelVideoCount) {
        topChannelVideoCount = count;
        topChannelByVideos = ch;
      }
    }

    let topChannelByViews = null;
    let topChannelTotalViews = 0;
    for (const [ch, v] of channelViews.entries()) {
      if (v > topChannelTotalViews) {
        topChannelTotalViews = v;
        topChannelByViews = ch;
      }
    }

    return {
      region,
      totalVideos: videos.length,
      totalViews,
      avgViews,
      medianViews,
      topChannelByVideos,
      topChannelVideoCount,
      topChannelByViews,
      topChannelTotalViews,
      medianLikeRate,
      medianCommentRate
    };
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#fca5a5" : "#9ca3af";
  }

  // ---------- Chat ----------
  function appendChatMessage(sender, text) {
    const div = document.createElement("div");
    div.className = "chat-message " + (sender === "user" ? "user" : "bot");

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble " + (sender === "user" ? "user" : "bot");
    bubble.textContent = text;

    div.appendChild(bubble);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function isControlCommand(text) {
    const lower = text.toLowerCase();
    return /(show|create|build|make|load|dashboard|trending)/.test(lower);
  }

  function answerQuestionFromDashboard(question) {
    if (!lastFilteredVideos || !lastFilteredVideos.length || !lastMetrics) {
      return "First load trending data and choose a date/category range, then ask questions about it.";
    }

    const q = question.toLowerCase();
    const m = lastMetrics;
    const videos = lastFilteredVideos;
    const region = m.region;

    const hasAny = (...words) => words.some(w => q.includes(w));

    // build categories for fuzzy matching
    const categoryObjs = [];
    const seenCats = new Set();
    for (const v of videos) {
      const name = v.category_name || `Category ${v.category_id}`;
      const lower = name.toLowerCase();
      if (!seenCats.has(lower)) {
        seenCats.add(lower);
        categoryObjs.push({ name, lower });
      }
    }

    function findCategoryInQuestion() {
      for (const cat of categoryObjs) {
        if (q.includes(cat.lower)) return cat;
      }
      const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
      for (const token of tokens) {
        for (const cat of categoryObjs) {
          if (cat.lower.includes(token) && token.length >= 4) {
            return cat;
          }
        }
      }
      return null;
    }

    function findChannelInQuestion() {
      for (const v of videos) {
        const ch = v.channel_title || "";
        const lower = ch.toLowerCase();
        if (lower && q.includes(lower)) {
          return ch;
        }
      }
      return null;
    }

    const catFromQuestion = findCategoryInQuestion();

    // category-specific top video
    if (catFromQuestion && hasAny("view", "views", "top", "highest", "most", "popular", "best")) {
      const categoryVideos = videos.filter(
        v =>
          (v.category_name || `Category ${v.category_id}`).toLowerCase() ===
          catFromQuestion.lower
      );
      if (categoryVideos.length) {
        const topCatVideo = [...categoryVideos].sort(
          (a, b) => b.view_count - a.view_count
        )[0];
        return `In the "${topCatVideo.category_name || catFromQuestion.name}" category for ${region} in this range, the top trending video by views is "${topCatVideo.title}" by "${topCatVideo.channel_title}" with ${formatInt(
          topCatVideo.view_count
        )} views, published on ${videoDate(topCatVideo)}.`;
      }
    }

    // category-specific best channel
    if (catFromQuestion && hasAny("channel")) {
      const categoryVideos = videos.filter(
        v =>
          (v.category_name || `Category ${v.category_id}`).toLowerCase() ===
          catFromQuestion.lower
      );
      if (categoryVideos.length) {
        const map = new Map();
        for (const v of categoryVideos) {
          const ch = v.channel_title || "Unknown";
          map.set(ch, (map.get(ch) || 0) + (v.view_count || 0));
        }
        let bestCh = null;
        let bestViews = 0;
        for (const [ch, val] of map.entries()) {
          if (val > bestViews) {
            bestViews = val;
            bestCh = ch;
          }
        }
        return `Within the "${catFromQuestion.name}" category for ${region}, the strongest channel by views is "${bestCh}" with ${formatInt(
          bestViews
        )} views in the current trending set.`;
      }
    }

    // channel-focused stats
    if (hasAny("this channel", "that channel") || (hasAny("channel") && !hasAny("which channel"))) {
      const chName = findChannelInQuestion();
      if (chName) {
        const videosForChannel = videos.filter(
          v => (v.channel_title || "").toLowerCase() === chName.toLowerCase()
        );
        const totalViews = videosForChannel.reduce(
          (sum, v) => sum + (v.view_count || 0),
          0
        );
        return `Channel "${chName}" has ${videosForChannel.length} videos in the current trending dashboard for ${region}, with a total of ${formatInt(
          totalViews
        )} views.`;
      }
    }

    // total views
    if (hasAny("total views", "overall views", "sum of views", "all views")) {
      return `The ${m.totalVideos} videos in the selected date/category range for ${region} have a total of ${formatInt(
        m.totalViews
      )} views.`;
    }

    // average views
    if (hasAny("average views", "avg views", "mean views", "typical views")) {
      return `Average views per trending video in this range for ${region} are about ${formatInt(
        Math.round(m.avgViews)
      )}.`;
    }

    // median views
    if (hasAny("median views", "middle views", "50th percentile")) {
      return `Median views per trending video in this range for ${region} are roughly ${formatInt(
        Math.round(m.medianViews)
      )}.`;
    }

    // top channel overall
    if (
      hasAny("top channel", "which channel", "most videos", "most trending videos", "best channel")
    ) {
      return `In the selected range for ${region}, the channel with the most trending videos is "${
        m.topChannelByVideos
      }" with ${m.topChannelVideoCount} videos. The channel with the highest total views is "${
        m.topChannelByViews
      }" with ${formatInt(m.topChannelTotalViews)} views across its trending videos.`;
    }

    // highest viewed video overall
    if (
      (hasAny("highest", "most", "top", "maximum", "max", "best") &&
        hasAny("view", "views", "popular")) ||
      hasAny("highest viewed video", "most viewed video", "top video", "best video")
    ) {
      const sorted = [...videos].sort((a, b) => b.view_count - a.view_count);
      const top = sorted[0];
      return `The most viewed trending video in this range for ${region} is "${top.title}" by "${
        top.channel_title
      }" with ${formatInt(top.view_count)} views, published on ${videoDate(top)}.`;
    }

    // engagement style question
    if (hasAny("engagement", "sentiment", "like ratio", "likes to views", "audience reaction")) {
      const withLikeRate = videos
        .filter(v => v.view_count && v.like_count != null)
        .map(v => ({
          v,
          rate: v.like_count / v.view_count
        }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 3);

      if (!withLikeRate.length) {
        return "Not enough like information is available to analyse engagement for this dashboard.";
      }

      const parts = withLikeRate.map(({ v, rate }) => {
        return `"${v.title}" (${v.channel_title}) has a like-to-view ratio of ${(rate * 100).toFixed(
          2
        )}%`;
      });

      return `Based on like-to-view ratio, the most positively engaged videos in this dashboard are: ${parts.join(
        "; "
      )}.`;
    }

    // "why is it trending" explanation
    if (hasAny("why") && hasAny("trending", "popular", "viral")) {
      const sorted = [...videos].sort((a, b) => b.view_count - a.view_count);
      const top = sorted[0];

      const index = sorted.findIndex(v => v.video_id === top.video_id);
      const percentile = 100 - (index / sorted.length) * 100;

      const likeRate =
        top.view_count && top.like_count != null
          ? top.like_count / top.view_count
          : null;
      const commentRate =
        top.view_count && top.comment_count != null
          ? top.comment_count / top.view_count
          : null;

      const parts = [];
      parts.push(
        `"${top.title}" is trending in ${region} because it has a very high view count of ${formatInt(
          top.view_count
        )}, placing it around the top ${percentile.toFixed(1)}% of videos in this dashboard.`
      );

      if (likeRate != null && m.medianLikeRate) {
        if (likeRate > m.medianLikeRate * 1.5) {
          parts.push(
            `Its like-to-view ratio (~${(likeRate * 100).toFixed(
              2
            )}%) is well above the dashboard median, suggesting strong audience approval.`
          );
        } else if (likeRate < m.medianLikeRate * 0.7) {
          parts.push(
            `Its like-to-view ratio (~${(likeRate * 100).toFixed(
              2
            )}%) is below the typical video here, indicating mixed reactions despite high views.`
          );
        }
      }

      if (commentRate != null && m.medianCommentRate) {
        if (commentRate > m.medianCommentRate * 1.5) {
          parts.push(
            `It also drives a lot of discussion, with a high comments-per-view rate versus other trending videos.`
          );
        }
      }

      const pubDate = videoDate(top);
      if (pubDate) {
        const today = new Date();
        const d = new Date(pubDate);
        const diffDays = Math.round(
          (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 3) {
          parts.push("It is also very recent, published within the last few days.");
        } else if (diffDays <= 7) {
          parts.push("It was published within the last week, so it is still fresh content.");
        }
      }

      return parts.join(" ");
    }

    // how many videos
    if (
      hasAny("how many videos", "number of videos", "video count", "how many are trending", "videos are trending")
    ) {
      return `There are ${m.totalVideos} trending videos in the selected date/category range for ${region}.`;
    }

    // fallback summary
    return `Summary for ${region} in the selected filters: ${m.totalVideos} trending videos with a total of ${formatInt(
      m.totalViews
    )} views, average ${formatInt(Math.round(m.avgViews))} views per video. ` +
      `The channel with the most trending videos is "${m.topChannelByVideos}" (${m.topChannelVideoCount} videos), ` +
      `and the channel with the highest total views is "${m.topChannelByViews}" (${formatInt(
        m.topChannelTotalViews
      )} views).`;
  }

  async function handleChatSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendChatMessage("user", text);
    chatInput.value = "";
    chatInput.focus();
    chatSendBtn.disabled = true;

    try {
      if (isControlCommand(text)) {
        const currentRegion = regionSelect.value || "US";
        const currentLimit = parseInt(limitInput.value, 10) || 25;

        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            default_region: currentRegion,
            default_limit: currentLimit
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Chat error");
        }

        const data = await res.json();
        appendChatMessage("bot", data.reply);

        regionSelect.value = data.region;
        limitInput.value = data.limit;

        await loadTrending(data.region, data.limit);
      } else {
        const ans = answerQuestionFromDashboard(text);
        appendChatMessage("bot", ans);
      }
    } catch (err) {
      console.error(err);
      appendChatMessage("bot", "Sorry, something went wrong while processing that message.");
    } finally {
      chatSendBtn.disabled = false;
    }
  }

  chatSendBtn.addEventListener("click", handleChatSend);
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleChatSend();
    }
  });

  appendChatMessage(
    "bot",
    'Hi! I can load dashboards like "Show top 20 trending videos in India" and answer questions about the selected date & category such as "Which video has highest views in gaming category?", "Which channel performs best?", or "Why is this video trending?".'
  );

  // ---------- Rendering ----------
  function renderMetrics(m) {
    metricsGrid.innerHTML = "";
    if (!m) return;

    const cards = [
      { label: "Region", value: m.region },
      { label: "Trending videos (filtered)", value: m.totalVideos },
      { label: "Total views", value: formatInt(m.totalViews) },
      { label: "Average views per video", value: formatInt(Math.round(m.avgViews)) },
      { label: "Median views per video", value: formatInt(Math.round(m.medianViews)) },
      {
        label: "Top channel by videos",
        value: m.topChannelByVideos
          ? `${m.topChannelByVideos} (${m.topChannelVideoCount})`
          : "N/A"
      },
      {
        label: "Top channel by views",
        value: m.topChannelByViews
          ? `${m.topChannelByViews} (${formatInt(m.topChannelTotalViews)} views)`
          : "N/A"
      }
    ];

    for (const c of cards) {
      const div = document.createElement("div");
      div.className = "metric-card";
      div.innerHTML = `
        <div class="metric-label">${c.label}</div>
        <div class="metric-value">${c.value ?? "N/A"}</div>
      `;
      metricsGrid.appendChild(div);
    }
  }

  function renderCharts(videos) {
    if (!videos || !videos.length) {
      Plotly.purge("views-chart");
      Plotly.purge("category-chart");
      return;
    }

    const sorted = [...videos].sort((a, b) => b.view_count - a.view_count).slice(0, 15);
    const labels = sorted.map(v => v.title);
    const views = sorted.map(v => v.view_count);

    const viewsTrace = {
      x: views,
      y: labels,
      type: "bar",
      orientation: "h",
      name: "Views"
    };

    const viewsLayout = {
      margin: { l: 180, r: 20, t: 10, b: 40 },
      paper_bgcolor: "#020617",
      plot_bgcolor: "#020617",
      xaxis: {
        title: "Views",
        gridcolor: "#1f2937",
        zerolinecolor: "#1f2937"
      },
      yaxis: {
        automargin: true
      },
      showlegend: false
    };

    Plotly.newPlot("views-chart", [viewsTrace], viewsLayout, { responsive: true });

    const categoryMap = new Map();
    for (const v of videos) {
      const cat = v.category_name || `Category ${v.category_id}`;
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + (v.view_count || 0));
    }
    const catEntries = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
    const catNames = catEntries.map(([name]) => name);
    const catViews = catEntries.map(([, value]) => value);

    const catTrace = { x: catNames, y: catViews, type: "bar", name: "Views" };

    const catLayout = {
      margin: { l: 40, r: 20, t: 10, b: 80 },
      paper_bgcolor: "#020617",
      plot_bgcolor: "#020617",
      xaxis: {
        tickangle: -45,
        gridcolor: "#1f2937",
        zerolinecolor: "#1f2937"
      },
      yaxis: {
        title: "Total views",
        gridcolor: "#1f2937",
        zerolinecolor: "#1f2937"
      },
      showlegend: false
    };

    Plotly.newPlot("category-chart", [catTrace], catLayout, { responsive: true });
  }

  function renderTable(videos) {
    videosTableBody.innerHTML = "";
    if (!videos || !videos.length) return;

    videos.forEach((v, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${v.title}</td>
        <td>${v.channel_title}</td>
        <td><span class="badge">${v.category_name || "N/A"}</span></td>
        <td>${formatInt(v.view_count)}</td>
        <td>${v.like_count != null ? formatInt(v.like_count) : "N/A"}</td>
        <td>${v.comment_count != null ? formatInt(v.comment_count) : "N/A"}</td>
        <td>${formatDuration(v.duration_seconds)}</td>
        <td>${videoDate(v) || "N/A"}</td>
      `;
      videosTableBody.appendChild(tr);
    });
  }

  // ---------- Snapshots helpers ----------
  function getSnapshots() {
    try {
      return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function setSnapshots(arr) {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr));
  }

  function renderSnapshotsList() {
    const snapshots = getSnapshots();
    snapshotsTableBody.innerHTML = "";

    if (!snapshots.length) {
      snapshotsEmptyEl.style.display = "block";
      snapshotsTableContainer.style.display = "none";
      return;
    }

    snapshotsEmptyEl.style.display = "none";
    snapshotsTableContainer.style.display = "block";

    snapshots.forEach((snap, idx) => {
      const tr = document.createElement("tr");

      const datesLabel =
        (snap.startDate || "min") + " → " + (snap.endDate || "max");

      const categoryLabel =
        snap.category === "__ALL__" || !snap.category
          ? "All"
          : snap.category;

      const savedAtShort = snap.savedAt
        ? snap.savedAt.replace("T", " ").slice(0, 16)
        : "";

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${snap.region}</td>
        <td>${datesLabel}</td>
        <td>${categoryLabel}</td>
        <td>${savedAtShort}</td>
        <td class="snapshot-actions"></td>
      `;

      const actionsTd = tr.querySelector(".snapshot-actions");

      const loadBtnEl = document.createElement("button");
      loadBtnEl.textContent = "Load";
      loadBtnEl.className = "btn-secondary";
      loadBtnEl.addEventListener("click", () => loadSnapshot(idx));

      const deleteBtnEl = document.createElement("button");
      deleteBtnEl.textContent = "Delete";
      deleteBtnEl.className = "btn-danger";
      deleteBtnEl.addEventListener("click", () => deleteSnapshot(idx));

      actionsTd.appendChild(loadBtnEl);
      actionsTd.appendChild(deleteBtnEl);

      snapshotsTableBody.appendChild(tr);
    });
  }

  function loadSnapshot(index) {
    const snapshots = getSnapshots();
    const snap = snapshots[index];
    if (!snap) return;

    regionSelect.value = snap.region || regionSelect.value;
    startDateInput.value = snap.startDate || "";
    endDateInput.value = snap.endDate || "";

    const videos = snap.videos || [];
    const catSet = new Set();
    videos.forEach(v => {
      const name = v.category_name || `Category ${v.category_id}`;
      catSet.add(name);
    });
    categoryFilterSelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "__ALL__";
    allOpt.textContent = "All categories";
    categoryFilterSelect.appendChild(allOpt);
    Array.from(catSet)
      .sort()
      .forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        categoryFilterSelect.appendChild(opt);
      });

    if (snap.category && snap.category !== "__ALL__") {
      categoryFilterSelect.value = snap.category;
    } else {
      categoryFilterSelect.value = "__ALL__";
    }

    lastRawTrending = {
      region: snap.region,
      videos: videos
    };

    applyFiltersAndRender();
    setStatus(
      `Loaded snapshot #${index + 1} for ${snap.region} (${snap.startDate || "min"} → ${
        snap.endDate || "max"
      }, category: ${snap.category === "__ALL__" || !snap.category ? "All" : snap.category}).`
    );
  }

  function deleteSnapshot(index) {
    const snapshots = getSnapshots();
    if (index < 0 || index >= snapshots.length) return;
    snapshots.splice(index, 1);
    setSnapshots(snapshots);
    renderSnapshotsList();
    savedInfoEl.textContent = "Snapshot deleted.";
    savedInfoEl.style.color = "#9ca3af";
  }

  // ---------- Load + filter + save/export ----------
  async function loadTrending(region, limit) {
    loadBtn.disabled = true;
    setStatus(`Loading top ${limit} trending videos for ${region}...`);

    try {
      const url = `${API_BASE}/api/trending?region=${encodeURIComponent(region)}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText);
      }

      const data = await res.json();
      lastRawTrending = data;

      const videos = data.videos || [];
      if (!videos.length) {
        lastFilteredVideos = [];
        lastMetrics = null;
        renderMetrics(null);
        renderCharts([]);
        renderTable([]);
        setStatus("No trending videos found.", true);
        return;
      }

      const catSet = new Set();
      videos.forEach(v => {
        const name = v.category_name || `Category ${v.category_id}`;
        catSet.add(name);
      });
      categoryFilterSelect.innerHTML = "";
      const allOpt = document.createElement("option");
      allOpt.value = "__ALL__";
      allOpt.textContent = "All categories";
      categoryFilterSelect.appendChild(allOpt);
      Array.from(catSet)
        .sort()
        .forEach(name => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          categoryFilterSelect.appendChild(opt);
        });
      categoryFilterSelect.value = "__ALL__";

      const dates = videos
        .map(videoDate)
        .filter(d => d)
        .sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      if (!startDateInput.value && minDate) startDateInput.value = minDate;
      if (!endDateInput.value && maxDate) endDateInput.value = maxDate;

      applyFiltersAndRender();
      setStatus(`Loaded trending videos for ${data.region}.`);
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Error while loading trending videos.", true);
    } finally {
      loadBtn.disabled = false;
    }
  }

  function applyFiltersAndRender() {
    if (!lastRawTrending) return;

    const allVideos = lastRawTrending.videos || [];
    const region = lastRawTrending.region;

    const startDate = startDateInput.value || null;
    const endDate = endDateInput.value || null;
    const categoryValue = categoryFilterSelect.value || "__ALL__";

    let filtered = applyDateFilter(allVideos, startDate, endDate);
    if (categoryValue !== "__ALL__") {
      filtered = filtered.filter(
        v => (v.category_name || `Category ${v.category_id}`) === categoryValue
      );
    }

    lastFilteredVideos = filtered;
    lastMetrics = computeMetricsFromVideos(filtered, region);

    renderMetrics(lastMetrics);
    renderCharts(filtered);
    renderTable(filtered);
  }

  startDateInput.addEventListener("change", applyFiltersAndRender);
  endDateInput.addEventListener("change", applyFiltersAndRender);
  categoryFilterSelect.addEventListener("change", applyFiltersAndRender);

  loadBtn.addEventListener("click", () => {
    const region = regionSelect.value || "US";
    let limit = parseInt(limitInput.value, 10) || 25;
    if (limit < 1) limit = 1;
    if (limit > 50) limit = 50;
    limitInput.value = limit;
    loadTrending(region, limit);
  });

  function saveSnapshot() {
    if (!lastFilteredVideos || !lastFilteredVideos.length || !lastMetrics) {
      savedInfoEl.textContent = "Load a dashboard before saving a snapshot.";
      savedInfoEl.style.color = "#fca5a5";
      return;
    }

    const snapshot = {
      savedAt: new Date().toISOString(),
      region: lastMetrics.region,
      startDate: startDateInput.value || null,
      endDate: endDateInput.value || null,
      category: categoryFilterSelect.value || "__ALL__",
      metrics: lastMetrics,
      videos: lastFilteredVideos
    };

    const existing = getSnapshots();
    existing.push(snapshot);
    setSnapshots(existing);

    savedInfoEl.textContent = `Saved snapshot #${existing.length} for ${snapshot.region} (${snapshot.startDate || "min"} → ${
      snapshot.endDate || "max"
    }; category: ${snapshot.category === "__ALL__" ? "All" : snapshot.category}).`;
    savedInfoEl.style.color = "#9ca3af";

    renderSnapshotsList();
  }

  function exportCsv() {
    if (!lastFilteredVideos || !lastFilteredVideos.length || !lastMetrics) {
      savedInfoEl.textContent = "Nothing to export. Load and filter data first.";
      savedInfoEl.style.color = "#fca5a5";
      return;
    }

    const headers = [
      "video_id",
      "title",
      "channel_title",
      "category_name",
      "view_count",
      "like_count",
      "comment_count",
      "duration_seconds",
      "published_at"
    ];

    const rows = lastFilteredVideos.map(v => [
      v.video_id,
      v.title,
      v.channel_title,
      v.category_name,
      v.view_count,
      v.like_count,
      v.comment_count,
      v.duration_seconds,
      v.published_at
    ]);

    const csvLines = [];
    csvLines.push(headers.join(","));
    for (const row of rows) {
      const escaped = row.map(val => {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvLines.push(escaped.join(","));
    }

    const blob = new Blob([csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `youtube_trending_${lastMetrics.region}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    savedInfoEl.textContent = "Exported current dashboard as CSV.";
    savedInfoEl.style.color = "#9ca3af";
  }

  saveSnapshotBtn.addEventListener("click", saveSnapshot);
  exportCsvBtn.addEventListener("click", exportCsv);

  // initial load
  renderMetrics(null);
  renderTable([]);
  renderSnapshotsList();
  loadTrending(regionSelect.value || "US", parseInt(limitInput.value, 10) || 25);
});




