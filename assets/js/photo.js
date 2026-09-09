// Metanama — Photo metadata tool
(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const bench = document.getElementById("bench");
  const previewImg = document.getElementById("previewImg");
  const fileNameEl = document.getElementById("fileName");
  const fileSubEl = document.getElementById("fileSub");
  const statusLine = document.getElementById("statusLine");
  const summaryTable = document.getElementById("summaryTable");
  const summaryAlert = document.getElementById("summaryAlert");
  const rawTable = document.getElementById("rawTable");
  const editNotice = document.getElementById("editNotice");
  const editForm = document.getElementById("editForm");
  const btnDownloadClean = document.getElementById("btnDownloadClean");
  const btnReset = document.getElementById("btnReset");
  const btnClearGps = document.getElementById("btnClearGps");

  let currentFile = null;
  let currentDataUrl = null;
  let currentMeta = null;
  let currentDims = { w: 0, h: 0 };
  let isJpeg = false;

  const FRIENDLY_LABELS = {
    Make: "سازنده‌ی دوربین",
    Model: "مدل دوربین",
    LensModel: "مدل لنز",
    Software: "نرم‌افزار",
    DateTimeOriginal: "تاریخ ضبط",
    CreateDate: "تاریخ ایجاد",
    ModifyDate: "تاریخ ویرایش",
    Artist: "هنرمند / عکاس",
    Copyright: "کپی‌رایت",
    ImageDescription: "توضیحات تصویر",
    ExposureTime: "زمان نوردهی",
    FNumber: "دیافراگم (f-number)",
    ISO: "ISO",
    FocalLength: "فاصله‌ی کانونی",
    Orientation: "جهت تصویر",
  };

  /* -------------------------------- Helpers -------------------------------- */

  function setStatus(text, loading) {
    statusLine.classList.toggle("loading", !!loading);
    statusLine.querySelector(".txt").textContent = text || "";
  }

  function fmtValue(v) {
    if (v === null || v === undefined) return "—";
    if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 19);
    if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
      const len = v.byteLength !== undefined ? v.byteLength : v.length;
      return `[داده‌ی باینری، ${len} بایت]`;
    }
    if (Array.isArray(v)) {
      if (v.length > 8) return `[آرایه با ${v.length} عضو]`;
      return v.map((x) => (typeof x === "number" ? round(x) : String(x))).join(", ");
    }
    if (typeof v === "number") return round(v);
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch (e) {
        return String(v);
      }
    }
    return String(v);
  }

  function round(n) {
    return Number.isInteger(n) ? n : Math.round(n * 10000) / 10000;
  }

  function addRow(table, key, val) {
    const tr = document.createElement("tr");
    const tdKey = document.createElement("td");
    tdKey.className = "key";
    tdKey.textContent = key;
    const tdVal = document.createElement("td");
    tdVal.className = "val";
    tdVal.textContent = val;
    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    table.appendChild(tr);
  }

  function emptyState(container, message) {
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    wrap.innerHTML = `
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/></svg>
      <strong>${message}</strong>
      <span>این می‌تواند خبر خوبی باشد — یعنی این فایل ردپای کمی از خودش به‌جا گذاشته.</span>`;
    container.appendChild(wrap);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function dataURLtoBlob(dataUrl) {
    const [header, b64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function baseName(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
  }
  function extName(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot) : "";
  }

  /* ----------------------------- Dropzone wiring ---------------------------- */

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
  });

  btnReset.addEventListener("click", () => {
    currentFile = null;
    currentDataUrl = null;
    currentMeta = null;
    fileInput.value = "";
    bench.hidden = true;
    dropzone.hidden = false;
    setStatus("", false);
  });

  /* -------------------------------- Core flow ------------------------------- */

  function handleFile(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      window.metanamaToast("فرمت پشتیبانی نمی‌شود. JPEG، PNG یا WEBP انتخاب کنید.");
      return;
    }
    currentFile = file;
    isJpeg = file.type === "image/jpeg";

    const reader = new FileReader();
    reader.onload = () => {
      currentDataUrl = reader.result;
      previewImg.src = currentDataUrl;
      previewImg.onload = () => {
        currentDims = { w: previewImg.naturalWidth, h: previewImg.naturalHeight };
        fileSubEl.textContent = `${currentDims.w}×${currentDims.h} · ${window.metanamaFormatBytes(file.size)} · ${file.type}`;
      };
      fileNameEl.textContent = file.name;
      fileSubEl.textContent = `${window.metanamaFormatBytes(file.size)} · ${file.type}`;

      dropzone.hidden = true;
      bench.hidden = false;
      readMetadata(file);
    };
    reader.readAsDataURL(file);
  }

  function readMetadata(file) {
    setStatus("در حال خواندن متادیتا…", true);
    summaryTable.innerHTML = "";
    rawTable.innerHTML = "";
    summaryAlert.innerHTML = "";

    window.exifr
      .parse(file, {
        tiff: true,
        ifd0: true,
        exif: true,
        gps: true,
        interop: true,
        iptc: true,
        xmp: true,
        icc: false,
        jfif: true,
        mergeOutput: true,
        translateValues: true,
        reviveValues: true,
      })
      .then((output) => {
        currentMeta = output || {};
        renderSummary(currentMeta);
        renderRaw(currentMeta);
        prefillEditForm(currentMeta);
        setStatus("متادیتا با موفقیت خوانده شد.", false);
      })
      .catch((err) => {
        currentMeta = {};
        renderSummary({});
        renderRaw({});
        prefillEditForm({});
        setStatus("خواندن متادیتا با خطا مواجه شد؛ احتمالاً این فایل متادیتایی ندارد.", false);
        console.warn("exifr error:", err);
      });

    editNotice.hidden = isJpeg;
    Array.from(editForm.elements).forEach((el) => (el.disabled = !isJpeg));
    btnClearGps.disabled = !isJpeg;
  }

  function renderSummary(meta) {
    const keys = Object.keys(meta || {});
    const hasSomething = keys.length > 0;

    summaryTable.innerHTML = "";
    addRow(summaryTable, "ابعاد تصویر", `${currentDims.w || "—"} × ${currentDims.h || "—"}`);
    addRow(summaryTable, "حجم فایل", window.metanamaFormatBytes(currentFile.size));
    addRow(summaryTable, "نوع فایل", currentFile.type);

    Object.keys(FRIENDLY_LABELS).forEach((k) => {
      if (meta[k] !== undefined) addRow(summaryTable, FRIENDLY_LABELS[k], fmtValue(meta[k]));
    });

    if (typeof meta.latitude === "number" && typeof meta.longitude === "number") {
      addRow(summaryTable, "موقعیت مکانی (GPS)", `${round(meta.latitude)}, ${round(meta.longitude)}`);
      summaryAlert.innerHTML = `
        <div class="alert danger">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3h.01M12 3l9 16H3L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          <span>این فایل موقعیت مکانی دقیق ثبت‌شده دارد. اگر قصد اشتراک‌گذاری آن را دارید، پیشنهاد می‌کنیم موقعیت مکانی را پاک کنید.</span>
        </div>`;
    } else if (!hasSomething) {
      summaryAlert.innerHTML = `
        <div class="alert success">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/></svg>
          <span>هیچ متادیتای قابل‌توجهی در این فایل پیدا نشد.</span>
        </div>`;
    }
  }

  function renderRaw(meta) {
    const keys = Object.keys(meta || {});
    if (keys.length === 0) {
      emptyState(rawTable.parentElement, "هیچ فیلد متادیتایی پیدا نشد");
      return;
    }
    rawTable.innerHTML = "";
    keys.sort().forEach((k) => addRow(rawTable, k, fmtValue(meta[k])));
  }

  function prefillEditForm(meta) {
    document.getElementById("f-make").value = meta.Make || "";
    document.getElementById("f-model").value = meta.Model || "";
    document.getElementById("f-software").value = meta.Software || "";
    document.getElementById("f-artist").value = meta.Artist || "";
    document.getElementById("f-copyright").value = meta.Copyright || "";
    document.getElementById("f-desc").value = meta.ImageDescription || "";
    const dateVal = meta.DateTimeOriginal || meta.CreateDate;
    document.getElementById("f-date").value = dateVal ? formatExifDate(dateVal) : "";
    document.getElementById("f-lat").value = typeof meta.latitude === "number" ? round(meta.latitude) : "";
    document.getElementById("f-lon").value = typeof meta.longitude === "number" ? round(meta.longitude) : "";
  }

  function formatExifDate(v) {
    if (v instanceof Date) {
      const p = (n) => String(n).padStart(2, "0");
      return `${v.getFullYear()}:${p(v.getMonth() + 1)}:${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
    }
    return String(v);
  }

  /* -------------------------- Clean download (any type) ---------------------- */

  btnDownloadClean.addEventListener("click", () => {
    if (!currentFile) return;
    setStatus("در حال ساخت نسخه‌ی پاک…", true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const mime = currentFile.type === "image/png" ? "image/png" : currentFile.type === "image/webp" ? "image/webp" : "image/jpeg";
      const quality = mime === "image/png" ? undefined : 0.95;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setStatus("ساخت فایل خروجی ناموفق بود.", false);
            return;
          }
          downloadBlob(blob, `${baseName(currentFile.name)}-clean${extName(currentFile.name) || ".jpg"}`);
          setStatus("نسخه‌ی پاک‌شده دانلود شد — بدون هیچ متادیتا.", false);
          window.metanamaToast("فایل پاک‌شده دانلود شد ✓");
        },
        mime,
        quality
      );
    };
    img.onerror = () => setStatus("بارگذاری تصویر برای پاک‌سازی ناموفق بود.", false);
    img.src = currentDataUrl;
  });

  /* ------------------------------ GPS <-> DMS -------------------------------- */

  function decToDmsRational(deg) {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const minFloat = (abs - d) * 60;
    const m = Math.floor(minFloat);
    const s = (minFloat - m) * 60;
    return [
      [d, 1],
      [m, 1],
      [Math.round(s * 1000), 1000],
    ];
  }

  function buildExifDict(baseDict, edits) {
    // baseDict: piexif dict loaded from the file ({"0th":{}, "Exif":{}, "GPS":{}, "1st":{}, "thumbnail":null})
    const P = window.piexif;
    const dict = baseDict;
    dict["0th"] = dict["0th"] || {};
    dict["Exif"] = dict["Exif"] || {};
    dict["GPS"] = dict["GPS"] || {};

    function setOrDelete(ifd, tag, value) {
      // undefined = "not part of this edit call" -> leave the existing tag untouched
      // (this lets the GPS-only clear action skip touching camera/artist fields)
      if (value === undefined) return;
      if (value === null || value === "") {
        delete dict[ifd][tag];
      } else {
        dict[ifd][tag] = value;
      }
    }

    setOrDelete("0th", P.ImageIFD.Make, edits.make);
    setOrDelete("0th", P.ImageIFD.Model, edits.model);
    setOrDelete("0th", P.ImageIFD.Software, edits.software);
    setOrDelete("0th", P.ImageIFD.Artist, edits.artist);
    setOrDelete("0th", P.ImageIFD.Copyright, edits.copyright);
    setOrDelete("0th", P.ImageIFD.ImageDescription, edits.description);
    setOrDelete("Exif", P.ExifIFD.DateTimeOriginal, edits.date);

    if (edits.clearGps) {
      dict["GPS"] = {};
    } else if (typeof edits.lat === "number" && typeof edits.lon === "number" && !isNaN(edits.lat) && !isNaN(edits.lon)) {
      dict["GPS"][P.GPSIFD.GPSLatitudeRef] = edits.lat >= 0 ? "N" : "S";
      dict["GPS"][P.GPSIFD.GPSLatitude] = decToDmsRational(edits.lat);
      dict["GPS"][P.GPSIFD.GPSLongitudeRef] = edits.lon >= 0 ? "E" : "W";
      dict["GPS"][P.GPSIFD.GPSLongitude] = decToDmsRational(edits.lon);
    }
    return dict;
  }

  function applyExifAndDownload(edits, suffix) {
    if (!isJpeg) {
      window.metanamaToast("ویرایش دستی فقط برای JPEG پشتیبانی می‌شود.");
      return;
    }
    setStatus("در حال اعمال تغییرات…", true);
    try {
      let dict;
      try {
        dict = window.piexif.load(currentDataUrl);
      } catch (e) {
        dict = { "0th": {}, "Exif": {}, "GPS": {}, "1st": {}, thumbnail: null };
      }
      dict = buildExifDict(dict, edits);
      const exifBytes = window.piexif.dump(dict);
      const newDataUrl = window.piexif.insert(exifBytes, currentDataUrl);
      const blob = dataURLtoBlob(newDataUrl);
      downloadBlob(blob, `${baseName(currentFile.name)}${suffix}${extName(currentFile.name) || ".jpg"}`);
      setStatus("فایل ویرایش‌شده دانلود شد.", false);
      window.metanamaToast("تغییرات اعمال و فایل دانلود شد ✓");
    } catch (err) {
      console.error(err);
      setStatus("اعمال تغییرات با خطا مواجه شد.", false);
      window.metanamaToast("مشکلی پیش آمد. فایل را دوباره امتحان کنید.");
    }
  }

  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const edits = {
      make: document.getElementById("f-make").value.trim(),
      model: document.getElementById("f-model").value.trim(),
      software: document.getElementById("f-software").value.trim(),
      artist: document.getElementById("f-artist").value.trim(),
      copyright: document.getElementById("f-copyright").value.trim(),
      description: document.getElementById("f-desc").value.trim(),
      date: document.getElementById("f-date").value.trim(),
      lat: parseFloat(document.getElementById("f-lat").value),
      lon: parseFloat(document.getElementById("f-lon").value),
    };
    applyExifAndDownload(edits, "-edited");
  });

  btnClearGps.addEventListener("click", () => {
    applyExifAndDownload({ clearGps: true }, "-no-gps");
  });
})();
