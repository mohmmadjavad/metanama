// Metanama — Music metadata tool
(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const bench = document.getElementById("bench");
  const coverImg = document.getElementById("coverImg");
  const coverFallback = document.getElementById("coverFallback");
  const fileNameEl = document.getElementById("fileName");
  const fileSubEl = document.getElementById("fileSub");
  const statusLine = document.getElementById("statusLine");
  const summaryTable = document.getElementById("summaryTable");
  const summaryAlert = document.getElementById("summaryAlert");
  const rawTable = document.getElementById("rawTable");
  const editForm = document.getElementById("editForm");
  const coverInput = document.getElementById("coverInput");
  const editCoverPreview = document.getElementById("editCoverPreview");
  const removeCoverCheck = document.getElementById("removeCoverCheck");
  const btnDownloadClean = document.getElementById("btnDownloadClean");
  const btnReset = document.getElementById("btnReset");

  let currentFile = null;
  let currentBuffer = null;
  let currentParsed = null;
  let overrideCover = null; // {mime, data: Uint8Array} when the user picks a new cover
  let duration = null;

  /* -------------------------------- Helpers -------------------------------- */

  function setStatus(text, loading) {
    statusLine.classList.toggle("loading", !!loading);
    statusLine.querySelector(".txt").textContent = text || "";
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

  function baseName(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
  }

  function fmtDuration(sec) {
    if (!Number.isFinite(sec)) return "—";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function frameDescription(frame, tags) {
    if (frame.id === "APIC" || frame.id === "PIC") {
      const pic = tags.picture;
      return pic ? `[عکس کاور، ${pic.mime}، ${window.metanamaFormatBytes(pic.data.length)}]` : "[عکس کاور]";
    }
    // Text-information frames all start with "T" (TIT2, TPE1, TYER, TXXX…) and share the
    // same [encoding byte + encoded string] layout, so the shared decoder handles them.
    if (frame.id[0] === "T" || frame.id[0] === "W") {
      const text = window.MetanamaID3.decodeTextFrame(frame.data).trim();
      if (text) return text;
    }
    return `[داده‌ی باینری، ${frame.size} بایت]`;
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
    currentBuffer = null;
    currentParsed = null;
    overrideCover = null;
    fileInput.value = "";
    coverInput.value = "";
    removeCoverCheck.checked = false;
    bench.hidden = true;
    dropzone.hidden = false;
    setStatus("", false);
  });

  /* -------------------------------- Core flow ------------------------------- */

  function handleFile(file) {
    const isMp3 = file.type === "audio/mpeg" || /\.mp3$/i.test(file.name);
    if (!isMp3) {
      window.metanamaToast("فقط فایل MP3 پشتیبانی می‌شود.");
      return;
    }
    currentFile = file;
    overrideCover = null;
    coverInput.value = "";
    removeCoverCheck.checked = false;

    fileNameEl.textContent = file.name;
    fileSubEl.textContent = window.metanamaFormatBytes(file.size);
    dropzone.hidden = true;
    bench.hidden = false;
    setStatus("در حال خواندن فایل…", true);

    const audioProbe = new Audio();
    audioProbe.preload = "metadata";
    audioProbe.onloadedmetadata = () => {
      duration = audioProbe.duration;
      if (currentParsed) renderSummary(currentParsed.tags); // refresh with duration once known
      URL.revokeObjectURL(audioProbe.src);
    };
    audioProbe.src = URL.createObjectURL(file);

    const reader = new FileReader();
    reader.onload = () => {
      currentBuffer = reader.result;
      try {
        currentParsed = window.MetanamaID3.parse(currentBuffer);
        renderCover(currentParsed.tags.picture);
        renderSummary(currentParsed.tags);
        renderRaw(currentParsed);
        prefillEditForm(currentParsed.tags);
        setStatus("تگ‌ها با موفقیت خوانده شد.", false);
      } catch (err) {
        console.error(err);
        currentParsed = { frames: [], tags: {} };
        renderCover(null);
        renderSummary({});
        renderRaw(currentParsed);
        prefillEditForm({});
        setStatus("خواندن تگ‌ها با خطا مواجه شد؛ احتمالاً این فایل تگی ندارد.", false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderCover(pic) {
    if (pic && pic.data && pic.data.length) {
      const blob = new Blob([pic.data], { type: pic.mime || "image/jpeg" });
      coverImg.src = URL.createObjectURL(blob);
      coverImg.hidden = false;
      coverFallback.hidden = true;
      editCoverPreview.innerHTML = "";
      const img = document.createElement("img");
      img.src = coverImg.src;
      editCoverPreview.appendChild(img);
    } else {
      coverImg.hidden = true;
      coverFallback.hidden = false;
    }
  }

  function renderSummary(tags) {
    summaryTable.innerHTML = "";
    summaryAlert.innerHTML = "";
    addRow(summaryTable, "نام آهنگ", tags.title || "—");
    addRow(summaryTable, "خواننده", tags.artist || "—");
    addRow(summaryTable, "آلبوم", tags.album || "—");
    addRow(summaryTable, "سال انتشار", tags.year || "—");
    addRow(summaryTable, "ژانر", tags.genre || "—");
    addRow(summaryTable, "مدت زمان", fmtDuration(duration));
    addRow(summaryTable, "حجم فایل", window.metanamaFormatBytes(currentFile.size));
    addRow(summaryTable, "عکس کاور", tags.picture ? "دارد" : "ندارد");

    const hasAny = tags.title || tags.artist || tags.album || tags.year || tags.genre || tags.picture;
    if (!hasAny) {
      summaryAlert.innerHTML = `
        <div class="alert success">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/></svg>
          <span>هیچ تگ متادیتایی در این فایل پیدا نشد.</span>
        </div>`;
    }
  }

  function renderRaw(parsed) {
    rawTable.innerHTML = "";
    if (!parsed.frames || parsed.frames.length === 0) {
      if (parsed.hasID3v1) {
        addRow(rawTable, "ID3v1 title", parsed.id3v1.title || "—");
        addRow(rawTable, "ID3v1 artist", parsed.id3v1.artist || "—");
        addRow(rawTable, "ID3v1 album", parsed.id3v1.album || "—");
        addRow(rawTable, "ID3v1 year", parsed.id3v1.year || "—");
        return;
      }
      emptyState(rawTable.parentElement, "هیچ فریم ID3 پیدا نشد");
      return;
    }
    parsed.frames.forEach((f) => addRow(rawTable, f.id, frameDescription(f, parsed.tags)));
  }

  function prefillEditForm(tags) {
    document.getElementById("f-title").value = tags.title || "";
    document.getElementById("f-artist").value = tags.artist || "";
    document.getElementById("f-album").value = tags.album || "";
    document.getElementById("f-year").value = tags.year || "";
    document.getElementById("f-genre").value = tags.genre || "";
  }

  /* ------------------------------ Cover upload ------------------------------- */

  coverInput.addEventListener("change", () => {
    const f = coverInput.files && coverInput.files[0];
    if (!f) return;
    removeCoverCheck.checked = false;
    const reader = new FileReader();
    reader.onload = () => {
      overrideCover = { mime: f.type || "image/jpeg", data: new Uint8Array(reader.result) };
      editCoverPreview.innerHTML = "";
      const img = document.createElement("img");
      img.src = URL.createObjectURL(f);
      editCoverPreview.appendChild(img);
    };
    reader.readAsArrayBuffer(f);
  });

  /* -------------------------- Clean download (strip all) ---------------------- */

  btnDownloadClean.addEventListener("click", () => {
    if (!currentFile || !currentParsed) return;
    setStatus("در حال ساخت نسخه‌ی پاک…", true);
    const audioBytes = new Uint8Array(currentBuffer).subarray(currentParsed.audioStart, currentParsed.audioEnd);
    const blob = new Blob([audioBytes], { type: "audio/mpeg" });
    downloadBlob(blob, `${baseName(currentFile.name)}-clean.mp3`);
    setStatus("نسخه‌ی پاک‌شده دانلود شد — بدون هیچ تگی.", false);
    window.metanamaToast("فایل پاک‌شده دانلود شد ✓");
  });

  /* --------------------------------- Apply edits -------------------------------- */

  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentFile || !currentParsed) return;
    setStatus("در حال اعمال تغییرات…", true);
    try {
      let picture;
      if (removeCoverCheck.checked) {
        picture = undefined;
      } else if (overrideCover) {
        picture = overrideCover;
      } else if (currentParsed.tags.picture) {
        picture = currentParsed.tags.picture;
      }

      const fields = {
        title: document.getElementById("f-title").value.trim(),
        artist: document.getElementById("f-artist").value.trim(),
        album: document.getElementById("f-album").value.trim(),
        year: document.getElementById("f-year").value.trim(),
        genre: document.getElementById("f-genre").value.trim(),
        picture,
      };

      const tagBytes = window.MetanamaID3.buildTag(fields);
      const audioBytes = new Uint8Array(currentBuffer).subarray(currentParsed.audioStart, currentParsed.audioEnd);
      const finalBytes = window.MetanamaID3.concatBytes(tagBytes, audioBytes);
      const blob = new Blob([finalBytes], { type: "audio/mpeg" });
      downloadBlob(blob, `${baseName(currentFile.name)}-edited.mp3`);
      setStatus("فایل ویرایش‌شده دانلود شد.", false);
      window.metanamaToast("تغییرات اعمال و فایل دانلود شد ✓");
    } catch (err) {
      console.error(err);
      setStatus("اعمال تغییرات با خطا مواجه شد.", false);
      window.metanamaToast("مشکلی پیش آمد. فایل را دوباره امتحان کنید.");
    }
  });
})();
