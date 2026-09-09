// Metanama — Image format converter (shared engine for all convert/*.html pages)
// Reads window.METANAMA_CONVERT = { from: 'png'|'jpg'|'webp'|'svg', to: 'png'|'jpg'|'webp'|'svg' }
(function () {
  "use strict";

  const CFG = window.METANAMA_CONVERT;
  if (!CFG) return;

  const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
  const EXT = { png: "png", jpg: "jpg", webp: "webp", svg: "svg" };
  const ACCEPT = {
    png: "image/png,.png",
    jpg: "image/jpeg,.jpg,.jpeg",
    webp: "image/webp,.webp",
    svg: "image/svg+xml,.svg",
  };
  const LOSSY = { jpg: true, webp: true };

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const bench = document.getElementById("bench");
  const batchList = document.getElementById("batchList");
  const btnAddMore = document.getElementById("btnAddMore");
  const btnConvertAll = document.getElementById("btnConvertAll");
  const btnDownloadZip = document.getElementById("btnDownloadZip");
  const btnReset = document.getElementById("btnReset");
  const statusLine = document.getElementById("statusLine");
  const qualityRow = document.getElementById("qualityRow");
  const qualityInput = document.getElementById("qualityInput");
  const qualityVal = document.getElementById("qualityVal");

  if (!dropzone || !fileInput) return;

  fileInput.setAttribute("accept", ACCEPT[CFG.from] || "image/*");

  let items = []; // { id, file, status, blob, url, name }
  let uid = 0;
  let quality = 0.92;

  if (qualityRow) {
    qualityRow.hidden = !LOSSY[CFG.to];
  }
  if (qualityInput) {
    qualityInput.addEventListener("input", () => {
      quality = Number(qualityInput.value) / 100;
      if (qualityVal) qualityVal.textContent = `${qualityInput.value}%`;
    });
  }

  function setStatus(text, loading) {
    if (!statusLine) return;
    statusLine.classList.toggle("loading", !!loading);
    statusLine.querySelector(".txt").textContent = text || "";
  }

  function bytesFmt(n) {
    return window.metanamaFormatBytes ? window.metanamaFormatBytes(n) : `${(n / 1024).toFixed(0)} KB`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function matchesSource(file) {
    const name = file.name.toLowerCase();
    if (CFG.from === "jpg") return file.type === "image/jpeg" || /\.jpe?g$/.test(name);
    if (CFG.from === "svg") return file.type === "image/svg+xml" || /\.svg$/.test(name);
    return file.type === MIME[CFG.from] || name.endsWith("." + CFG.from);
  }

  function addFiles(fileList) {
    const files = Array.from(fileList).filter(matchesSource);
    const rejected = fileList.length - files.length;
    if (rejected > 0) {
      window.metanamaToast && window.metanamaToast(`${rejected} فایل نامعتبر (فرمت ورودی باید ${CFG.from.toUpperCase()} باشد) نادیده گرفته شد`);
    }
    if (!files.length) return;

    dropzone.hidden = true;
    bench.hidden = false;

    files.forEach((file) => {
      const id = ++uid;
      items.push({ id, file, status: "wait", blob: null, url: null });
    });
    renderList();
  }

  function renderList() {
    batchList.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "batch-item";
      row.dataset.id = item.id;
      const stateTxt =
        item.status === "done" ? "آماده" : item.status === "error" ? "خطا" : item.status === "working" ? "در حال تبدیل…" : "در انتظار";
      row.innerHTML = `
        <span class="thumb"><img alt="" data-role="thumb" /></span>
        <span class="info">
          <span class="name">${escapeHtml(item.file.name)}</span>
          <span class="sub">${bytesFmt(item.file.size)}${item.blob ? ` ← ${bytesFmt(item.blob.size)}` : ""}</span>
        </span>
        <span class="state ${item.status === "done" ? "ok" : "wait"}">${stateTxt}</span>
        ${item.status === "done" ? `<button type="button" class="dl-btn">دانلود</button>` : ""}
        <button type="button" class="remove-btn" title="حذف">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      const thumbImg = row.querySelector('[data-role="thumb"]');
      if (item.previewUrl) thumbImg.src = item.previewUrl;
      else if (CFG.from !== "svg") {
        const u = URL.createObjectURL(item.file);
        item.previewUrl = u;
        thumbImg.src = u;
      }

      const dl = row.querySelector(".dl-btn");
      if (dl) dl.addEventListener("click", () => downloadItem(item));
      row.querySelector(".remove-btn").addEventListener("click", () => {
        items = items.filter((i) => i.id !== item.id);
        renderList();
        if (!items.length) resetAll();
      });
      batchList.appendChild(row);
    });
    btnConvertAll.disabled = items.every((i) => i.status === "done") || !items.length;
    btnDownloadZip.hidden = !(items.length > 1 && items.some((i) => i.status === "done"));
  }

  function downloadItem(item) {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function outName(originalName) {
    const base = originalName.replace(/\.[^.]+$/, "");
    return `${base}.${EXT[CFG.to]}`;
  }

  // ---- Rasterizing helpers ----

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => resolve({ img, url });
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  async function getSvgIntrinsicSize(file) {
    const text = await file.text();
    let w = 0,
      h = 0;
    const wm = text.match(/width=["']?([\d.]+)/);
    const hm = text.match(/height=["']?([\d.]+)/);
    if (wm) w = parseFloat(wm[1]);
    if (hm) h = parseFloat(hm[1]);
    if (!w || !h) {
      const vb = text.match(/viewBox=["']?\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/);
      if (vb) {
        w = parseFloat(vb[3]);
        h = parseFloat(vb[4]);
      }
    }
    if (!w || !h) {
      w = 1200;
      h = 1200;
    }
    // Cap the largest dimension for a reasonable raster size
    const MAX = 2000;
    if (Math.max(w, h) > MAX) {
      const ratio = MAX / Math.max(w, h);
      w *= ratio;
      h *= ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  async function fileToCanvas(file) {
    if (CFG.from === "svg") {
      const { w, h } = await getSvgIntrinsicSize(file);
      const { img, url } = await loadImageFromFile(file);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return canvas;
    }
    const { img, url } = await loadImageFromFile(file);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (CFG.to === "jpg") {
      // JPG has no alpha channel — flatten onto white first
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return canvas;
  }

  function canvasToBlob(canvas, mime, q) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, q));
  }

  async function convertToSvgBlob(canvas) {
    const dataUrl = canvas.toDataURL("image/png");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">\n<image width="${canvas.width}" height="${canvas.height}" href="${dataUrl}"/>\n</svg>`;
    return new Blob([svg], { type: "image/svg+xml" });
  }

  async function convertOne(item) {
    item.status = "working";
    renderList();
    try {
      const canvas = await fileToCanvas(item.file);
      let blob;
      if (CFG.to === "svg") {
        blob = await convertToSvgBlob(canvas);
      } else {
        blob = await canvasToBlob(canvas, MIME[CFG.to], LOSSY[CFG.to] ? quality : undefined);
      }
      if (!blob) throw new Error("empty blob");
      item.blob = blob;
      item.url = URL.createObjectURL(blob);
      item.name = outName(item.file.name);
      item.status = "done";
    } catch (e) {
      console.error(e);
      item.status = "error";
    }
    renderList();
  }

  async function convertAll() {
    btnConvertAll.disabled = true;
    setStatus(`در حال تبدیل ${items.length} فایل…`, true);
    for (const item of items) {
      if (item.status !== "done") await convertOne(item);
    }
    setStatus("تبدیل انجام شد.", false);
    window.metanamaToast && window.metanamaToast("تبدیل فایل‌ها انجام شد");
    // Auto-download single file result
    const done = items.filter((i) => i.status === "done");
    if (done.length === 1) downloadItem(done[0]);
  }

  async function downloadZip() {
    const done = items.filter((i) => i.status === "done");
    if (!done.length || !window.JSZip) return;
    setStatus("در حال ساخت فایل ZIP…", true);
    const zip = new window.JSZip();
    done.forEach((item) => zip.file(item.name, item.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metanama-${CFG.from}-to-${CFG.to}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus("", false);
  }

  function resetAll() {
    items.forEach((i) => {
      if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      if (i.url) URL.revokeObjectURL(i.url);
    });
    items = [];
    fileInput.value = "";
    dropzone.hidden = false;
    bench.hidden = true;
    batchList.innerHTML = "";
    setStatus("", false);
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });
  fileInput.addEventListener("change", (e) => addFiles(e.target.files));
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  btnAddMore.addEventListener("click", () => fileInput.click());
  btnConvertAll.addEventListener("click", convertAll);
  btnDownloadZip.addEventListener("click", downloadZip);
  btnReset.addEventListener("click", resetAll);
})();
