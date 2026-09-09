// Metanama — Split PDF tool (pdf.js for preview, pdf-lib for splitting, JSZip for packaging)
(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const bench = document.getElementById("bench");
  const fileNameEl = document.getElementById("fileName");
  const fileSubEl = document.getElementById("fileSub");
  const pageFlow = document.getElementById("pageFlow");
  const rangesSummary = document.getElementById("rangesSummary");
  const btnSplitEach = document.getElementById("btnSplitEach");
  const btnClearSplits = document.getElementById("btnClearSplits");
  const btnDownload = document.getElementById("btnDownload");
  const btnReset = document.getElementById("btnReset");
  const statusLine = document.getElementById("statusLine");
  const resultBox = document.getElementById("resultBox");
  const btnDownloadLink = document.getElementById("btnDownloadLink");

  let arrayBuf = null;
  let originalFile = null;
  let numPages = 0;
  let splitAfter = new Set(); // page numbers after which a split happens

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

  function computeRanges() {
    const points = Array.from(splitAfter).sort((a, b) => a - b);
    const ranges = [];
    let start = 1;
    points.forEach((p) => {
      ranges.push([start, p]);
      start = p + 1;
    });
    ranges.push([start, numPages]);
    return ranges.filter((r) => r[0] <= r[1]);
  }

  function updateSummary() {
    const ranges = computeRanges();
    if (ranges.length <= 1) {
      rangesSummary.textContent = "برای تقسیم، بین صفحات روی علامت قیچی کلیک کنید تا نقطه‌ی برش اضافه شود.";
      btnDownload.disabled = true;
    } else {
      const txt = ranges.map((r) => (r[0] === r[1] ? `صفحه ${r[0]}` : `صفحات ${r[0]} تا ${r[1]}`)).join(" · ");
      rangesSummary.textContent = `${ranges.length} فایل ساخته می‌شود: ${txt}`;
      btnDownload.disabled = false;
    }
  }

  async function loadFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      window.metanamaToast && window.metanamaToast("فقط فایل PDF پشتیبانی می‌شود");
      return;
    }
    originalFile = file;
    splitAfter = new Set();
    dropzone.hidden = true;
    bench.hidden = false;
    resultBox.hidden = true;
    fileNameEl.textContent = file.name;
    fileSubEl.textContent = bytesFmt(file.size);
    pageFlow.innerHTML = "";
    setStatus("در حال بارگذاری صفحات…", true);

    arrayBuf = await file.arrayBuffer();

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuf.slice(0) });
      const pdf = await loadingTask.promise;
      numPages = pdf.numPages;
      updateSummary();

      for (let i = 1; i <= numPages; i++) {
        const cell = document.createElement("div");
        cell.className = "page-cell";
        cell.innerHTML = `
          <div class="page-thumb"><span class="spin"></span><span class="num">${i}</span></div>
          <span class="label">صفحه ${i}</span>
        `;
        pageFlow.appendChild(cell);
        renderThumb(pdf, i, cell.querySelector(".page-thumb"));

        if (i < numPages) {
          const divider = document.createElement("div");
          divider.className = "split-divider";
          divider.dataset.after = String(i);
          divider.title = "کلیک برای افزودن نقطه‌ی برش";
          divider.innerHTML = `
            <span class="line"></span>
            <span class="scissors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9.5 9.5 20 20M20 4 9.5 14.5M7 17a2.5 2.5 0 1 1-3-2.5 2.5 2.5 0 0 1 3 2.5Zm0-10a2.5 2.5 0 1 1-3 2.5A2.5 2.5 0 0 1 7 7Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          `;
          divider.addEventListener("click", () => toggleSplit(i, divider));
          pageFlow.appendChild(divider);
        }
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
      const scale = 200 / viewport.width;
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

  function toggleSplit(afterPage, el) {
    if (splitAfter.has(afterPage)) {
      splitAfter.delete(afterPage);
      el.classList.remove("active");
    } else {
      splitAfter.add(afterPage);
      el.classList.add("active");
    }
    updateSummary();
  }

  function splitEach() {
    splitAfter = new Set();
    for (let i = 1; i < numPages; i++) splitAfter.add(i);
    document.querySelectorAll(".split-divider").forEach((d) => d.classList.add("active"));
    updateSummary();
  }

  function clearSplits() {
    splitAfter = new Set();
    document.querySelectorAll(".split-divider").forEach((d) => d.classList.remove("active"));
    updateSummary();
  }

  async function doSplit() {
    const ranges = computeRanges();
    if (ranges.length <= 1) return;
    btnDownload.disabled = true;
    setStatus("در حال ساخت فایل‌های خروجی…", true);
    resultBox.hidden = true;
    try {
      const zip = new window.JSZip();
      const base = (originalFile.name || "file.pdf").replace(/\.pdf$/i, "");
      for (let i = 0; i < ranges.length; i++) {
        const [start, end] = ranges[i];
        const srcDoc = await window.PDFLib.PDFDocument.load(arrayBuf.slice(0), { ignoreEncryption: true });
        const outDoc = await window.PDFLib.PDFDocument.create();
        const indices = [];
        for (let p = start; p <= end; p++) indices.push(p - 1);
        const copied = await outDoc.copyPages(srcDoc, indices);
        copied.forEach((p) => outDoc.addPage(p));
        const bytes = await outDoc.save();
        const rangeLabel = start === end ? `صفحه-${start}` : `صفحات-${start}-تا-${end}`;
        zip.file(`${base}-${rangeLabel}.pdf`, bytes);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      btnDownloadLink.href = url;
      btnDownloadLink.download = `${base}-تقسیم‌شده.zip`;
      resultBox.hidden = false;
      setStatus(`${ranges.length} فایل با موفقیت ساخته شد.`, false);
      window.metanamaToast && window.metanamaToast("فایل ZIP آماده‌ی دانلود است");
    } catch (e) {
      console.error(e);
      setStatus("خطا در ساخت فایل‌های خروجی.", false);
    } finally {
      updateSummary();
    }
  }

  function resetAll() {
    arrayBuf = null;
    originalFile = null;
    numPages = 0;
    splitAfter = new Set();
    fileInput.value = "";
    dropzone.hidden = false;
    bench.hidden = true;
    resultBox.hidden = true;
    pageFlow.innerHTML = "";
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

  btnSplitEach.addEventListener("click", splitEach);
  btnClearSplits.addEventListener("click", clearSplits);
  btnDownload.addEventListener("click", doSplit);
  btnReset.addEventListener("click", resetAll);
})();
