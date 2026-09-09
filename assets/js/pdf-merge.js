// Metanama — Merge PDF tool (fully client-side, pdf-lib)
(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const bench = document.getElementById("bench");
  const fileListEl = document.getElementById("fileList");
  const summaryEl = document.getElementById("fileListSummary");
  const btnAddMore = document.getElementById("btnAddMore");
  const btnMerge = document.getElementById("btnMerge");
  const btnReset = document.getElementById("btnReset");
  const statusLine = document.getElementById("statusLine");
  const resultBox = document.getElementById("resultBox");
  const btnDownload = document.getElementById("btnDownload");

  let items = []; // { id, file, pages, size }
  let uid = 0;
  let dragIndex = null;

  function setStatus(text, loading) {
    if (!statusLine) return;
    statusLine.classList.toggle("loading", !!loading);
    statusLine.querySelector(".txt").textContent = text || "";
  }

  function bytesFmt(n) {
    return window.metanamaFormatBytes ? window.metanamaFormatBytes(n) : `${(n / 1024).toFixed(0)} KB`;
  }

  async function addFiles(fileArr) {
    const pdfFiles = Array.from(fileArr).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfFiles.length) return;

    dropzone.hidden = true;
    bench.hidden = false;
    resultBox.hidden = true;

    for (const file of pdfFiles) {
      const id = ++uid;
      const entry = { id, file, pages: null, size: file.size };
      items.push(entry);
      renderList();
      try {
        const buf = await file.arrayBuffer();
        const doc = await window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        entry.pages = doc.getPageCount();
      } catch (e) {
        entry.pages = "؟";
        entry.error = true;
      }
      renderList();
    }
  }

  function renderList() {
    fileListEl.innerHTML = "";
    items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "file-item";
      row.draggable = true;
      row.dataset.id = item.id;
      row.innerHTML = `
        <span class="order">${idx + 1}</span>
        <span class="handle" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/></svg>
        </span>
        <span class="thumb">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6"/></svg>
        </span>
        <span class="info">
          <span class="name">${escapeHtml(item.file.name)}</span>
          <span class="sub">${item.pages === null ? "در حال خواندن…" : item.error ? "خطا در خواندن فایل" : `${item.pages} صفحه`} · ${bytesFmt(item.size)}</span>
        </span>
        <span class="move-btns">
          <button type="button" class="move-up" title="جابه‌جایی به بالا" ${idx === 0 ? "disabled" : ""}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="move-down" title="جابه‌جایی به پایین" ${idx === items.length - 1 ? "disabled" : ""}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </span>
        <button type="button" class="remove-btn" title="حذف از لیست">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      row.querySelector(".remove-btn").addEventListener("click", () => {
        items = items.filter((i) => i.id !== item.id);
        renderList();
        if (!items.length) resetAll();
      });
      row.querySelector(".move-up").addEventListener("click", () => moveItem(idx, idx - 1));
      row.querySelector(".move-down").addEventListener("click", () => moveItem(idx, idx + 1));

      row.addEventListener("dragstart", () => {
        dragIndex = idx;
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over");
        if (dragIndex === null || dragIndex === idx) return;
        moveItem(dragIndex, idx);
        dragIndex = null;
      });

      fileListEl.appendChild(row);
    });

    const totalPages = items.reduce((s, i) => s + (typeof i.pages === "number" ? i.pages : 0), 0);
    summaryEl.textContent = items.length
      ? `${items.length} فایل انتخاب شده · مجموعاً حدود ${totalPages} صفحه`
      : "";
    btnMerge.disabled = items.length < 2;
  }

  function moveItem(from, to) {
    if (to < 0 || to >= items.length) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    renderList();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function resetAll() {
    items = [];
    fileInput.value = "";
    dropzone.hidden = false;
    bench.hidden = true;
    resultBox.hidden = true;
    setStatus("", false);
  }

  async function doMerge() {
    if (items.length < 2) return;
    btnMerge.disabled = true;
    setStatus("در حال ادغام فایل‌ها…", true);
    resultBox.hidden = true;
    try {
      const outDoc = await window.PDFLib.PDFDocument.create();
      for (const item of items) {
        const buf = await item.file.arrayBuffer();
        const srcDoc = await window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        const copiedPages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach((p) => outDoc.addPage(p));
      }
      const bytes = await outDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      btnDownload.href = url;
      btnDownload.download = "merged-metanama.pdf";
      resultBox.hidden = false;
      setStatus("ادغام با موفقیت انجام شد.", false);
      window.metanamaToast && window.metanamaToast("فایل ادغام‌شده آماده‌ی دانلود است");
    } catch (e) {
      console.error(e);
      setStatus("خطا در ادغام فایل‌ها. مطمئن شوید فایل‌ها PDF سالم و بدون رمز هستند.", false);
      window.metanamaToast && window.metanamaToast("خطا در ادغام فایل‌ها");
    } finally {
      btnMerge.disabled = items.length < 2;
    }
  }

  // Dropzone wiring
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
  btnMerge.addEventListener("click", doMerge);
  btnReset.addEventListener("click", resetAll);
})();
