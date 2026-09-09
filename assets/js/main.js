// Metanama — shared site behaviour
(function () {
  "use strict";

  // Mobile bottom tool bar — replaces the header nav on small screens.
  // Root-relative hrefs (leading "/") so this works the same from any
  // folder depth (/, /pdf/, /convert/, /blog/).
  (function buildBottomNav() {
    var items = [
      {
        key: "home",
        href: "/index.html",
        label: "خانه",
        test: function (p) { return p === "/" || p === "/index.html"; },
        icon: '<path d="M4 11.5 12 4l8 7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v8.5a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1V10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
      },
      {
        key: "photo",
        href: "/photo.html",
        label: "ابزار عکس",
        test: function (p) { return p === "/photo.html"; },
        icon: '<path d="M4 8.5C4 7.12 5.12 6 6.5 6h1.2c.5 0 .96-.28 1.19-.72l.4-.78A1.5 1.5 0 0 1 10.63 4h2.74c.55 0 1.05.31 1.34.8l.4.78c.23.44.7.72 1.19.72h1.2C18.88 6 20 7.12 20 8.5v8c0 1.38-1.12 2.5-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12.5" r="3.3" stroke="currentColor" stroke-width="1.6"/>'
      },
      {
        key: "music",
        href: "/music.html",
        label: "ابزار موزیک",
        test: function (p) { return p === "/music.html"; },
        icon: '<path d="M9 18V6.6a1 1 0 0 1 .78-.98l8-1.8A1 1 0 0 1 19 4.8V16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6.5" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="16.5" cy="16" r="2.5" stroke="currentColor" stroke-width="1.6"/>'
      },
      {
        key: "pdf",
        href: "/pdf/index.html",
        label: "ابزار PDF",
        test: function (p) { return p.indexOf("/pdf/") === 0; },
        icon: '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6"/><path d="M9 13.5h6M9 16.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
      },
      {
        key: "convert",
        href: "/convert/index.html",
        label: "تبدیل",
        test: function (p) { return p.indexOf("/convert/") === 0; },
        icon: '<rect x="3" y="4" width="8" height="8" rx="1.6" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="12" width="8" height="8" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="m11 8 4 0m0 0-2-2m2 2-2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      }
    ];

    var path = window.location.pathname;
    var activeKey = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].test(path)) { activeKey = items[i].key; break; }
    }

    // Hide whichever item matches the current page so exactly 5 remain
    // (falls back to showing all 6 on pages that match none, e.g. 404).
    var visible = activeKey ? items.filter(function (it) { return it.key !== activeKey; }) : items;

    var nav = document.createElement("nav");
    nav.className = "bottom-nav";
    nav.setAttribute("aria-label", "ناوبری پایین صفحه");
    nav.innerHTML = visible.map(function (it) {
      return (
        '<a href="' + it.href + '" class="bn-item">' +
          '<span class="bn-ico"><svg viewBox="0 0 24 24" fill="none">' + it.icon + '</svg></span>' +
          '<span class="bn-label">' + it.label + '</span>' +
        '</a>'
      );
    }).join("");

    document.body.appendChild(nav);
  })();

  // Mobile nav toggle
  const burger = document.querySelector(".nav-burger");
  const sheet = document.querySelector(".nav-sheet");
  if (burger && sheet) {
    burger.addEventListener("click", () => {
      const open = sheet.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    sheet.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => sheet.classList.remove("open"))
    );
  }

  // Generic tab switching, used by the photo and music tool workbenches
  document.querySelectorAll(".tabs").forEach((tabs) => {
    const panels = tabs.parentElement.querySelectorAll(".tab-panel");
    tabs.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        const target = tabs.parentElement.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`);
        if (target) target.classList.add("active");
      });
    });
  });

  // FAQ accordion
  document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-q");
    if (!q) return;
    q.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      item.closest(".faq-list")?.querySelectorAll(".faq-item.open").forEach((other) => {
        if (other !== item) other.classList.remove("open");
      });
      item.classList.toggle("open", !isOpen);
    });
  });

  // Footer year
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // Simple toast utility, shared by tool pages
  window.metanamaToast = function (message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.innerHTML = '<span class="dot"></span><span class="msg"></span>';
      document.body.appendChild(toast);
    }
    toast.querySelector(".msg").textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  // Human-readable byte size (used by both tools)
  window.metanamaFormatBytes = function (bytes) {
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };
})();
