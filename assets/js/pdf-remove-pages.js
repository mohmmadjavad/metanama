// Metanama — Remove PDF pages tool (pdf.js for preview, pdf-lib for editing)
(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const bench = document.getElementById("bench");
  const fileNameEl = document.getElementById("fileName");
  const fileSubEl = document.getElementById("fileSub");
  const pageGrid = document.getElementById("pageGrid");
  const countEl = document.getElementById("markedCount");
  const btnMarkAll = document.getElementById("btnMarkAll");
  const btnClearMarks = document.getElementById("btnClearMarks");
  const btnDownload = document.getElementById("btnDownload");
  const btnReset = document.getElementById("btnReset");
  const statusLine = document.getElementById("statusLine");
  const resultBox = document.getElementById("resultBox");
  const btnDownloadLink = document.getElementById("btnDownloadLink");

  let arrayBuf = null;
  let originalFile = null;
  let numPages = 0;
  let marked = new Set();

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  function setStatus(text, loading) {
    if (!statusLine) return;
    statusLine.classList.toggle("loading", !!loading);
    statusLine.querySelector(".txt").textContent = text || "";
  }

  function bytesFmt(n) {
    return window.metanamaFormatBytes ? window.metanamaFormatBytes(n) : `${(n / 1024).toFixed(0)} KB`;
  }

  function updateCount() {
    countEl.innerHTML = `<strong>${marked.size}</strong> صفحه برای حذف علامت خورده از <strong>${numPages}</strong> صفحه`;
    btnDownload.disabled = marked.size === 0 || marked.size >= numPages;
    if (marked.size >= numPages && numPages > 0) {
      countEl.innerHTML += " — نمی‌توانید همه‌ی صفحات را حذف کنید";
    }
  }

  async function loadFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      window.metanamaToast && window.metanamaToast("فقط فایل PDF پشتیبانی می‌شود");
      return;
    }
    originalFile = file;
    marked = new Set();
    dropzone.hidden = true;
    bench.hidden = false;
    resultBox.hidden = true;
    fileNameEl.textContent = file.name;
    fileSubEl.textContent = bytesFmt(file.size);
    pageGrid.innerHTML = "";
    setStatus("در حال بارگذاری صفحات…", true);

    arrayBuf = await file.arrayBuffer();

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuf.slice(0) });
      const pdf = await loadingTask.promise;
      numPages = pdf.numPages;
      updateCount();

      for (let i = 1; i <= numPages; i++) {
        const cell = document.createElement("div");
        cell.className = "page-cell";
        cell.dataset.page = String(i);
        cell.innerHTML = `
          <div class="page-thumb"><span class="spin"></span><span class="num">${i}</span>
            <span class="mark-icon" hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </div>
          <span class="label">صفحه ${i}</span>
        `;
        cell.addEventListener("click", () => toggleMark(i, cell));
        pageGrid.appendChild(cell);
        renderThumb(pdf, i, cell.querySelector(".page-thumb"));
      }
      setStatus("", false);
    } catch (e) {
      console.error(e);
      setStatus("خطا در خواندن فایل. ممکن است رمزدار یا خراب باشد.", false);
    }
  }

  async function renderThumb(pdf, pageNum, container) {
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const scale = 220 / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      const spin = container.querySelector(".spin");
      if (spin) spin.remove();
      container.prepend(canvas);
    } catch (e) {
      console.error("thumb render failed", e);
    }
  }

  function toggleMark(pageNum, cell) {
    const isMarked = marked.has(pageNum);
    if (isMarked) {
      marked.delete(pageNum);
      cell.classList.remove("marked");
      cell.querySelector(".mark-icon").hidden = true;
    } else {
      marked.add(pageNum);
      cell.classList.add("marked");
      cell.querySelector(".mark-icon").hidden = false;
    }
    updateCount();
  }

  function markAll() {
    document.querySelectorAll(".page-cell").forEach((cell) => {
      const n = Number(cell.dataset.page);
      marked.add(n);
      cell.classList.add("marked");
      cell.querySelector(".mark-icon").hidden = false;
    });
    updateCount();
  }

  function clearMarks() {
    marked = new Set();
    document.querySelectorAll(".page-cell").forEach((cell) => {
      cell.classList.remove("marked");
      cell.querySelector(".mark-icon").hidden = true;
    });
    updateCount();
  }

  async function doRemove() {
    if (!marked.size || marked.size >= numPages) return;
    btnDownload.disabled = true;
    setStatus("در حال ساخت فایل خروجی…", true);
    resultBox.hidden = true;
    try {
      const doc = await window.PDFLib.PDFDocument.load(arrayBuf.slice(0), { ignoreEncryption: true });
      const toRemove = Array.from(marked).sort((a, b) => b - a); // reverse order
      toRemove.forEach((pageNum) => doc.removePage(pageNum - 1));
      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const base = (originalFile.name || "file.pdf").replace(/\.pdf$/i, "");
      btnDownloadLink.href = url;
      btnDownloadLink.download = `${base}-ویرایش‌شده.pdf`;
      resultBox.hidden = false;
      setStatus("فایل با موفقیت آماده شد.", false);
      window.metanamaToast && window.metanamaToast("فایل جدید آماده‌ی دانلود است");
    } catch (e) {
      console.error(e);
      setStatus("خطا در ساخت فایل خروجی.", false);
    } finally {
      updateCount();
    }
  }

  function resetAll() {
    arrayBuf = null;
    originalFile = null;
    numPages = 0;
    marked = new Set();
    fileInput.value = "";
    dropzone.hidden = false;
    bench.hidden = true;
    resultBox.hidden = true;
    pageGrid.innerHTML = "";
    setStatus("", false);
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });
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
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  btnMarkAll.addEventListener("click", markAll);
  btnClearMarks.addEventListener("click", clearMarks);
  btnDownload.addEventListener("click", doRemove);
  btnReset.addEventListener("click", resetAll);
})();
