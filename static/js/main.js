"use strict";

// ── DOM refs ───────────────────────────────────────────────────────────────
const fileInput       = document.getElementById("csv-file");
const csvBtn          = document.getElementById("csv-btn");
const fileNameDisplay = document.getElementById("file-name-display");
const dropZone        = document.getElementById("drop-zone");
const errorMsg        = document.getElementById("error-msg");

const resultEmpty = document.getElementById("result-empty");
const resultCard  = document.getElementById("result-card");
const batchDiv    = document.getElementById("batch-results");

// ── File input handling ────────────────────────────────────────────────────
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    fileNameDisplay.textContent = fileInput.files[0].name;
    csvBtn.disabled = false;
  }
});

// Drag & drop visual feedback
dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith(".csv")) {
    fileInput.files = e.dataTransfer.files; // may not work in all browsers, fallback handled
    fileNameDisplay.textContent = f.name;
    csvBtn.disabled = false;
  } else {
    showError("Please drop a .csv file.");
  }
});

// ── Error helper ──────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.add("visible");
  setTimeout(() => {
    errorMsg.classList.remove("visible");
    errorMsg.textContent = "";
  }, 5000);
}

function clearError() {
  errorMsg.classList.remove("visible");
  errorMsg.textContent = "";
}

// ── Loading state helpers ─────────────────────────────────────────────────
function setLoading(btn, loading, originalHTML) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Identifying…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

// ── Show empty state ──────────────────────────────────────────────────────
function showEmpty() {
  resultEmpty.style.display = "flex";
  resultCard.style.display  = "none";
  batchDiv.style.display    = "none";
}

// ── Manual prediction ─────────────────────────────────────────────────────
async function predictManual() {
  clearError();
  const btn = document.getElementById("predict-btn");
  const origHTML = btn.innerHTML;

  const sl = document.getElementById("sepal_length").value.trim();
  const sw = document.getElementById("sepal_width").value.trim();
  const pl = document.getElementById("petal_length").value.trim();
  const pw = document.getElementById("petal_width").value.trim();

  if (!sl || !sw || !pl || !pw) {
    showError("Please fill in all four measurements.");
    return;
  }

  setLoading(btn, true, origHTML);

  try {
    const resp = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sepal_length: sl,
        sepal_width:  sw,
        petal_length: pl,
        petal_width:  pw,
      }),
    });
    const data = await resp.json();

    if (data.error) { showError(data.error); return; }

    displaySingleResult(data);
  } catch (err) {
    showError("Network error — is the Flask server running?");
  } finally {
    setLoading(btn, false, origHTML);
  }
}

// ── CSV batch prediction ──────────────────────────────────────────────────
async function predictCSV() {
  clearError();
  const btn = document.getElementById("csv-btn");
  const origHTML = btn.innerHTML;

  const file = fileInput.files[0];
  if (!file) { showError("No file selected."); return; }

  const form = new FormData();
  form.append("file", file);

  setLoading(btn, true, origHTML);

  try {
    const resp = await fetch("/predict_csv", { method: "POST", body: form });
    const data = await resp.json();

    if (data.error) { showError(data.error); return; }

    if (data.results.length === 1) {
      // treat single row like manual
      displaySingleResult(data.results[0]);
    } else {
      displayBatchResults(data.results, data.total);
    }
  } catch (err) {
    showError("Network error — is the Flask server running?");
  } finally {
    setLoading(btn, false, origHTML);
  }
}

// ── Render: single result ─────────────────────────────────────────────────
function displaySingleResult(data) {
  resultEmpty.style.display = "none";
  batchDiv.style.display    = "none";

  // Force re-trigger animation
  resultCard.style.display = "none";
  void resultCard.offsetWidth;
  resultCard.style.display = "block";

  // Clean up species name: capitalise each word, replace dashes/underscores
  const rawName = data.species || "Unknown";
  const displayName = rawName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());

  document.getElementById("result-header").style.background = "#f0f7f0";
  document.getElementById("result-emoji").textContent = "🌿";
  document.getElementById("result-name").textContent  = displayName;
  document.getElementById("result-desc").textContent  = "";
  document.getElementById("result-facts").innerHTML   = "";

  // Probability bars
  const probaSection = document.getElementById("proba-section");
  const probaBars    = document.getElementById("proba-bars");
  probaBars.innerHTML = "";

  if (data.proba && Object.keys(data.proba).length) {
    probaSection.style.display = "block";
    // Sort descending by confidence
    Object.entries(data.proba)
      .sort((a, b) => b[1] - a[1])
      .forEach(([label, pct]) => {
        const cleanLabel = label.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const row = document.createElement("div");
        row.className = "proba-row";
        row.innerHTML = `
          <span class="proba-label">${cleanLabel}</span>
          <div class="proba-track">
            <div class="proba-fill" style="width:0%" data-target="${pct}"></div>
          </div>
          <span class="proba-pct">${pct}%</span>
        `;
        probaBars.appendChild(row);
      });
    requestAnimationFrame(() => {
      document.querySelectorAll(".proba-fill").forEach(el => {
        el.style.width = el.dataset.target + "%";
      });
    });
  } else {
    probaSection.style.display = "none";
  }
}

// ── Render: batch results ─────────────────────────────────────────────────
function displayBatchResults(results, total) {
  resultEmpty.style.display = "none";
  resultCard.style.display  = "none";

  batchDiv.style.display = "block";
  document.getElementById("batch-count").textContent = `${total} rows`;

  const list = document.getElementById("batch-list");
  list.innerHTML = "";

  results.forEach((r, i) => {
    const displayName = (r.species || "Unknown")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
    const item = document.createElement("div");
    item.className = "batch-item";
    item.style.animationDelay = `${i * 0.04}s`;
    item.innerHTML = `
      <span class="batch-row-num">#${r.row}</span>
      <span class="batch-name">${displayName}</span>
    `;
    list.appendChild(item);
  });
}