(() => {
  "use strict";

  const state = {
    articles: [],
    policies: [],
    claims: [],
    matches: []
  };

  const $ = (id) => document.getElementById(id);

  const samplePolicies = [
    { plate: "34 ABC 123", policyNo: "KSK-2026-00124", status: "ACTIVE", insured: "Demo Sigortalı 1" },
    { plate: "06 FRD 61", policyNo: "KSK-2026-00125", status: "ACTIVE", insured: "Demo Sigortalı 2" },
    { plate: "74 AA 741", policyNo: "KSK-2026-00126", status: "ACTIVE", insured: "Demo Sigortalı 3" },
    { plate: "35 TKS 35", policyNo: "KSK-2026-00127", status: "ACTIVE", insured: "Demo Sigortalı 4" }
  ];

  const sampleClaims = [
    { plate: "06 FRD 61", claimNo: "HSR-2026-0441", status: "OPEN", lossDate: "2026-08-06" }
  ];

  const riskRules = [
    { words: ["alkollü", "alkol", "drunk", "intoxicated"], points: 35, label: "Alkol şüphesi" },
    { words: ["kaçtı", "kaçma", "olay yerinden", "hit and run", "fled"], points: 28, label: "Olay yerinden kaçma" },
    { words: ["ağır hasar", "hurdaya", "takla", "devrildi", "heavy damage", "rollover"], points: 22, label: "Ağır hasar" },
    { words: ["yaralandı", "yaralı", "ölü", "hayatını kaybetti", "injured", "killed"], points: 16, label: "Yaralanma / can kaybı" },
    { words: ["polis", "jandarma", "gözaltı", "police", "arrested"], points: 9, label: "Kolluk müdahalesi" },
    { words: ["kaza", "çarpıştı", "çarpışma", "crash", "accident", "collision"], points: 8, label: "Kaza haberi" }
  ];

  function normalizePlate(p) {
    return String(p || "")
      .toLocaleUpperCase("tr-TR")
      .replace(/[^0-9A-ZÇĞİÖŞÜ]/g, "");
  }

  function formatPlate(raw) {
    const n = normalizePlate(raw);
    const m = n.match(/^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,4})$/);
    if (!m) return raw.trim();
    return `${m[1]} ${m[2]} ${m[3]}`;
  }

  function extractPlates(text) {
    const clean = String(text || "")
      .toLocaleUpperCase("tr-TR")
      .replace(/\u00A0/g, " ");

    // Examples:
    // 34 ABC 123
    // 34ABC123
    // 34-ABC-123
    // 34 ABC-123
    // "34 ABC 123 plakalı..."
    const patterns = [
      /(?:^|[^0-9A-ZÇĞİÖŞÜ])([0-8][0-9])\s*[-./]?\s*([A-ZÇĞİÖŞÜ]{1,3})\s*[-./]?\s*(\d{2,4})(?=$|[^0-9A-ZÇĞİÖŞÜ])/g,
      /(?:PLAKA(?:SI)?|PLAKALI)\s*[:\-]?\s*([0-8][0-9])\s*[-./]?\s*([A-ZÇĞİÖŞÜ]{1,3})\s*[-./]?\s*(\d{2,4})/g
    ];

    const out = new Set();
    for (const rx of patterns) {
      let m;
      while ((m = rx.exec(clean)) !== null) {
        const province = Number(m[1]);
        if (province >= 1 && province <= 81) {
          out.add(formatPlate(m[1] + m[2] + m[3]));
        }
      }
    }
    return [...out];
  }

  function analyzeRisk(text, hasPolicy, hasClaim) {
    const lower = String(text || "").toLocaleLowerCase("tr-TR");
    let score = 0;
    const signals = [];
    for (const rule of riskRules) {
      if (rule.words.some(w => lower.includes(w))) {
        score += rule.points;
        signals.push(rule.label);
      }
    }
    if (hasPolicy) {
      score += 12;
      signals.push("Aktif poliçe eşleşmesi");
    }
    if (hasClaim) {
      score += 18;
      signals.push("Hasar dosyası eşleşmesi");
    } else if (hasPolicy) {
      score += 10;
      signals.push("Hasar ihbarı henüz yok");
    }
    score = Math.min(100, score);
    const level = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
    return { score, level, signals: [...new Set(signals)] };
  }

  function parseCSV(text) {
    const rows = String(text || "").replace(/\r/g, "").split("\n").filter(Boolean);
    if (!rows.length) return [];
    const header = rows[0].split(",").map(x => x.trim());
    return rows.slice(1).map(line => {
      const cols = line.split(",").map(x => x.trim().replace(/^"|"$/g, ""));
      const obj = {};
      header.forEach((h, i) => obj[h] = cols[i] || "");
      return obj;
    });
  }

  function showToast(msg) {
    const toast = $("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function setView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(v => v.classList.remove("active"));
    $("view-" + name).classList.add("active");
    document.querySelector(`.nav-item[data-view="${name}"]`)?.classList.add("active");
  }

  function articleText(a) {
    return [a.title, a.context, a.domain].filter(Boolean).join(" ");
  }

  function findPolicy(plate) {
    const n = normalizePlate(plate);
    return state.policies.find(p => normalizePlate(p.plate) === n && String(p.status || "").toUpperCase() !== "CANCELLED");
  }

  function findClaim(plate) {
    const n = normalizePlate(plate);
    return state.claims.find(c => normalizePlate(c.plate) === n && String(c.status || "").toUpperCase() !== "CLOSED");
  }

  function recomputeMatches() {
    const matches = [];
    for (const a of state.articles) {
      const text = articleText(a);
      const plates = extractPlates(text);
      for (const plate of plates) {
        const policy = findPolicy(plate);
        const claim = findClaim(plate);
        const risk = analyzeRisk(text, !!policy, !!claim);
        matches.push({ plate, article: a, policy, claim, ...risk });
      }
    }
    state.matches = matches.sort((a,b) => b.score - a.score);
    renderAll();
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function badge(level) {
    return `<span class="badge ${String(level).toLowerCase()}">${esc(level)}</span>`;
  }

  function displayDate(s) {
    if (!s) return "-";
    const raw = String(s).trim();

    // GDELT formats seen in the wild:
    // 20260807101500
    // 20260807T101500Z
    let m = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
    if (m) {
      const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("tr-TR");
    }

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleString("tr-TR");
  }

  function renderKPIs() {
    $("kpiNews").textContent = state.articles.length;
    const plateSignals = state.articles.reduce((n,a) => n + extractPlates(articleText(a)).length, 0);
    $("kpiPlates").textContent = plateSignals;
    $("kpiPolicy").textContent = state.matches.filter(m => m.policy).length;
    $("kpiHigh").textContent = state.matches.filter(m => ["HIGH","CRITICAL"].includes(m.level)).length;
  }

  function renderNews() {
    const body = $("newsTableBody");
    if (!state.articles.length) {
      body.innerHTML = `<tr><td colspan="6" class="empty-cell">Henüz canlı haber çekilmedi.</td></tr>`;
      $("dashboardNews").className = "list empty-state";
      $("dashboardNews").innerHTML = "Henüz canlı haber çekilmedi.";
      return;
    }
    body.innerHTML = state.articles.map(a => {
      const text = articleText(a);
      const plates = extractPlates(text);
      const base = analyzeRisk(text, false, false);
      return `<tr>
        <td>${esc(displayDate(a.seendate || a.date))}</td>
        <td>
          <strong>${esc(a.domain || a.sourcecountry || "Kaynak")}</strong><br>
          ${esc(a.title || "Başlıksız haber")}
          ${a.context ? `<div style="margin-top:6px;color:#6c778a;font-size:12px;line-height:1.45">${esc(a.context)}</div>` : ""}
          ${a.apiSource ? `<div style="margin-top:5px"><span class="pill">${esc(a.apiSource)}</span></div>` : ""}
        </td>
        <td>${plates.length ? plates.map(p=>`<span class="pill">${esc(p)}</span>`).join(" ") : "—"}</td>
        <td>${base.signals.length ? esc(base.signals.slice(0,2).join(", ")) : "Genel trafik haberi"}</td>
        <td>${badge(base.level)}</td>
        <td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Haberi aç ↗</a>` : ""}</td>
      </tr>`;
    }).join("");

    const dash = $("dashboardNews");
    dash.className = "list";
    dash.innerHTML = state.articles.slice(0,5).map(a => {
      const plates = extractPlates(articleText(a));
      return `<div class="list-item">
        <div class="list-item-top">
          <div class="list-title">${esc(a.title || a.context || "Haber")}</div>
          ${plates[0] ? `<span class="pill">${esc(plates[0])}</span>` : ""}
        </div>
        <div class="meta"><span>${esc(a.domain || "Kaynak")}</span><span>${esc(displayDate(a.seendate || a.date))}</span></div>
      </div>`;
    }).join("");
  }

  function renderMatches() {
    const grid = $("matchesGrid");
    if (!state.matches.length) {
      grid.innerHTML = `<div class="panel empty-state">Henüz plaka eşleşmesi yok. Canlı haberlerde plaka geçtiğinde burada görüntülenir.</div>`;
      $("dashboardMatches").className = "list empty-state";
      $("dashboardMatches").innerHTML = "Henüz eşleşme oluşmadı.";
      return;
    }
    grid.innerHTML = state.matches.map(m => `<article class="match-card">
      <div class="match-head">
        <div>
          <div class="match-plate">${esc(m.plate)}</div>
          <div class="meta"><span>${esc(m.article.domain || "Haber")}</span><span>${esc(displayDate(m.article.seendate || m.article.date))}</span></div>
        </div>
        <div>
          ${badge(m.level)}
          <div class="score">${m.score}<small>/100</small></div>
        </div>
      </div>
      <div class="match-grid">
        <div class="info-box"><span>Poliçe</span><strong>${m.policy ? esc(m.policy.policyNo || "Eşleşti") : "Eşleşme yok"}</strong></div>
        <div class="info-box"><span>Hasar</span><strong>${m.claim ? esc(m.claim.claimNo || "Eşleşti") : (m.policy ? "İhbar bekleniyor" : "Eşleşme yok")}</strong></div>
      </div>
      <p class="muted">${esc(m.signals.join(" • ") || "Risk sinyali bulunamadı")}</p>
      ${m.article.url ? `<a href="${esc(m.article.url)}" target="_blank" rel="noopener noreferrer">Kaynak haberi aç ↗</a>` : ""}
    </article>`).join("");

    const dash = $("dashboardMatches");
    dash.className = "list";
    dash.innerHTML = state.matches.slice(0,5).map(m => `<div class="list-item">
      <div class="list-item-top">
        <div class="list-title">${esc(m.plate)} • ${m.policy ? "Poliçe eşleşti" : "Poliçe bulunamadı"}</div>
        ${badge(m.level)}
      </div>
      <div class="meta"><span>Risk ${m.score}/100</span><span>${m.claim ? "Hasar dosyası var" : "Hasar dosyası yok"}</span></div>
    </div>`).join("");
  }

  function renderData() {
    $("policyCount").textContent = `${state.policies.length} kayıt`;
    $("claimCount").textContent = `${state.claims.length} kayıt`;
    const wrap = $("dataPreview");
    if (!state.policies.length && !state.claims.length) {
      wrap.className = "data-preview empty-state";
      wrap.innerHTML = "Henüz veri yüklenmedi.";
      return;
    }
    wrap.className = "data-preview";
    const table = (rows, type) => {
      if (!rows.length) return `<div class="preview-block"><h3>${type}</h3><p class="muted">Kayıt yok.</p></div>`;
      const keys = Object.keys(rows[0]);
      return `<div class="preview-block"><h3>${type}</h3><table><thead><tr>${keys.map(k=>`<th>${esc(k)}</th>`).join("")}</tr></thead>
        <tbody>${rows.slice(0,10).map(r=>`<tr>${keys.map(k=>`<td>${esc(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    };
    wrap.innerHTML = table(state.policies,"Poliçeler") + table(state.claims,"Hasarlar");
  }

  function renderAll() {
    renderKPIs();
    renderNews();
    renderMatches();
    renderData();
  }

  async function fetchGdelt() {
    const btns = [$("searchBtn"), $("refreshBtn")];
    btns.forEach(b => b.disabled = true);

    const status = $("apiStatus");
    status.className = "api-status";
    status.textContent = "Plaka odaklı GDELT Context taraması yapılıyor…";

    const userQuery = $("queryInput").value.trim() || "plakalı (kaza OR çarpıştı OR çarptı OR devrildi OR takla)";
    let timespan = $("timespan").value || "24h";

    // Context 2.0 currently supports a rolling window up to 72 hours.
    if (timespan === "7d" || timespan === "1m") timespan = "72h";

    const contextUrl = "https://api.gdeltproject.org/api/v2/context/context?" + new URLSearchParams({
      query: userQuery,
      mode: "artlist",
      maxrecords: "200",
      format: "json",
      sort: "datedesc",
      timespan,
      searchlang: "turkish"
    });

    // Fallback list query: useful for coverage, but it generally has no article-body snippet.
    const docUrl = "https://api.gdeltproject.org/api/v2/doc/doc?" + new URLSearchParams({
      query: "(accident OR crash OR collision OR traffic) sourcelang:turkish sourcecountry:turkey",
      mode: "artlist",
      maxrecords: "75",
      format: "json",
      sort: "datedesc",
      timespan
    });

    function mapArticle(a, source) {
      const context =
        a.context ||
        a.snippet ||
        a.sentence ||
        a.text ||
        a.excerpt ||
        a.description ||
        "";

      return {
        title: a.title || "",
        url: a.url || "",
        domain: a.domain || "",
        seendate: a.seendate || a.date || "",
        socialimage: a.socialimage || "",
        language: a.language || "",
        sourcecountry: a.sourcecountry || "",
        context,
        apiSource: source
      };
    }

    function dedupeArticles(rows) {
      const seen = new Set();
      return rows.filter(a => {
        const key = a.url || `${a.domain}|${a.title}|${a.context}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    try {
      let contextArticles = [];
      let docArticles = [];
      let contextError = null;

      try {
        const contextRes = await fetch(contextUrl, { headers: { "Accept": "application/json" } });
        if (!contextRes.ok) throw new Error(`Context HTTP ${contextRes.status}`);
        const contextData = await contextRes.json();
        const rawContext = Array.isArray(contextData.articles)
          ? contextData.articles
          : Array.isArray(contextData.results)
            ? contextData.results
            : [];
        contextArticles = rawContext.map(a => mapArticle(a, "CONTEXT"));
      } catch (err) {
        contextError = err;
        console.warn("Context API başarısız, DOC fallback kullanılacak:", err);
      }

      // Also retrieve general coverage so the screen does not become empty
      // when no "plakalı" sentence was indexed in the selected window.
      try {
        const docRes = await fetch(docUrl, { headers: { "Accept": "application/json" } });
        if (docRes.ok) {
          const docData = await docRes.json();
          const rawDoc = Array.isArray(docData.articles) ? docData.articles : [];
          docArticles = rawDoc.map(a => mapArticle(a, "DOC"));
        }
      } catch (err) {
        console.warn("DOC API fallback başarısız:", err);
      }

      // Put Context results first because these have sentence snippets
      // and therefore are much more likely to expose the plate.
      state.articles = dedupeArticles([...contextArticles, ...docArticles]);

      if (!state.articles.length) {
        throw contextError || new Error("Seçilen zaman aralığında sonuç bulunamadı.");
      }

      recomputeMatches();

      const withPlate = state.articles.filter(a => extractPlates(articleText(a)).length > 0).length;
      const contextCount = state.articles.filter(a => a.apiSource === "CONTEXT").length;

      status.className = "api-status success";
      status.textContent =
        `${state.articles.length} gerçek haber alındı • ${contextCount} Context cümlesi • ` +
        `${withPlate} haberde plaka numarası yakalandı. ` +
        (withPlate === 0
          ? "Bu zaman aralığında GDELT'in döndürdüğü cümlelerde açık plaka numarası bulunmadı; haberde plaka olsa bile kaynak GDELT'e cümle metni vermemiş olabilir."
          : "Plakalar poliçe/hasar kayıtlarıyla eşleştirildi.");

      showToast(withPlate > 0 ? `${withPlate} plaka sinyali bulundu.` : "Haberler geldi; açık plaka numarası bulunamadı.");
    } catch (err) {
      console.error(err);
      status.className = "api-status error";
      status.textContent = "Canlı haber API'sine erişilemedi: " + err.message;
      showToast("API erişim hatası.");
    } finally {
      btns.forEach(b => b.disabled = false);
    }
  }

  async function loadFile(input, target) {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (target === "policies") {
      state.policies = rows.map(r => ({...r, plate: formatPlate(r.plate || "")}));
    } else {
      state.claims = rows.map(r => ({...r, plate: formatPlate(r.plate || "")}));
    }
    recomputeMatches();
    showToast(`${rows.length} kayıt yüklendi.`);
  }

  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.go)));
  $("searchBtn").addEventListener("click", fetchGdelt);
  $("refreshBtn").addEventListener("click", () => { setView("news"); fetchGdelt(); });
  $("policyFile").addEventListener("change", e => loadFile(e.target, "policies"));
  $("claimFile").addEventListener("change", e => loadFile(e.target, "claims"));
  $("samplePolicyBtn").addEventListener("click", () => { state.policies = samplePolicies.map(x=>({...x})); recomputeMatches(); showToast("Sentetik poliçe verisi yüklendi."); });
  $("sampleClaimBtn").addEventListener("click", () => { state.claims = sampleClaims.map(x=>({...x})); recomputeMatches(); showToast("Sentetik hasar verisi yüklendi."); });
  $("clearPolicyBtn").addEventListener("click", () => { state.policies = []; recomputeMatches(); });
  $("clearClaimBtn").addEventListener("click", () => { state.claims = []; recomputeMatches(); });

  // Start public demo with safe synthetic internal data.
  state.policies = samplePolicies.map(x=>({...x}));
  state.claims = sampleClaims.map(x=>({...x}));
  renderAll();
})();
