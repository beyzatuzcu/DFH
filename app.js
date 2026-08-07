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
    const clean = String(text || "").toLocaleUpperCase("tr-TR");
    // Turkish civilian plate: 2-digit province + 1-3 letters + 2-4 digits.
    const rx = /(?:^|[^0-9A-ZÇĞİÖŞÜ])([0-8][0-9])\s*[-.]?\s*([A-ZÇĞİÖŞÜ]{1,3})\s*[-.]?\s*(\d{2,4})(?=$|[^0-9A-ZÇĞİÖŞÜ])/g;
    const out = new Set();
    let m;
    while ((m = rx.exec(clean)) !== null) {
      const province = Number(m[1]);
      if (province >= 1 && province <= 81) out.add(formatPlate(m[1] + m[2] + m[3]));
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
    const raw = String(s);
    // GDELT often returns YYYYMMDDHHMMSS.
    if (/^\d{14}$/.test(raw)) {
      const d = new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(8,10)}:${raw.slice(10,12)}:${raw.slice(12,14)}Z`);
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
        <td><strong>${esc(a.domain || a.sourcecountry || "Kaynak")}</strong><br>${esc(a.title || a.context || "Başlıksız haber")}</td>
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
    status.textContent = "GDELT canlı haber akışı sorgulanıyor…";

    const query = $("queryInput").value.trim();
    const timespan = $("timespan").value;
    // DOC API returns title/url/date/source metadata. CORS is enabled by GDELT.
    const url = "https://api.gdeltproject.org/api/v2/doc/doc?" + new URLSearchParams({
      query,
      mode: "artlist",
      maxrecords: "75",
      format: "json",
      sort: "datedesc",
      timespan
    });

    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = Array.isArray(data.articles) ? data.articles : [];
      state.articles = raw.map(a => ({
        title: a.title || "",
        url: a.url || "",
        domain: a.domain || "",
        seendate: a.seendate || "",
        socialimage: a.socialimage || "",
        language: a.language || "",
        sourcecountry: a.sourcecountry || "",
        context: a.context || a.snippet || ""
      }));
      status.className = "api-status success";
      status.textContent = `${state.articles.length} gerçek haber kaydı alındı. Plaka ve fraud sinyalleri analiz edildi.`;
      recomputeMatches();
      showToast("Canlı haberler güncellendi.");
    } catch (err) {
      console.error(err);
      status.className = "api-status error";
      status.textContent = "Canlı haber API'sine erişilemedi: " + err.message + ". Birkaç saniye sonra tekrar deneyebilir veya sorguyu sadeleştirebilirsin.";
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
