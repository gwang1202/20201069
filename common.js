/* common.js ---------------------------------------------------- *
 * ① 사이드바 로드  ② active 표시  ③ 햄버거 토글
 * ④ 연도 표시      ⑤ FAQ 아코디언  ⑥ 클립보드 유틸
 * ------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  /* 1) ─ 사이드바 동적 삽입 ─────────────────────────────── */
  const slot = document.getElementById("sidebar-container");
  const loadSidebar = slot
    ? fetch("../sidebar.html")
        .then((res) => res.text())
        .then((html) => {
          slot.innerHTML = html;
        })
        .catch((err) => console.error("Sidebar load error:", err))
    : Promise.resolve();

  /* 2) ─ 사이드바 삽입 후 초기화 ------------------------- */
  loadSidebar.finally(() => {
    setCurrentYear(); // ④
    initActiveLink(); // ②
    initSidebarToggle(); // ③
    initFaqToggle(); // ⑤  ←★ 추가
  });

  /* ④ 연도 표시 ----------------------------------------- */
  function setCurrentYear() {
    const span = document.getElementById("currentYear");
    if (span) span.textContent = new Date().getFullYear();
  }

  /* ② 현재 페이지 active -------------------------------- */
  function initActiveLink() {
    const current = location.pathname.replace(/index\.html$/, "");
    document.querySelectorAll(".sidebar-link").forEach((a) => {
      if (a.pathname.replace(/index\.html$/, "") === current)
        a.classList.add("active");
    });
  }

  /* ③ 햄버거 토글 --------------------------------------- */
  function initSidebarToggle() {
    const sidebar = document.getElementById("sidebar");
    const oldToggle = document.getElementById("sidebarToggle");
    if (!sidebar || !oldToggle) return;

    const toggleBtn = oldToggle.cloneNode(true); // 중복 listener 방지
    oldToggle.replaceWith(toggleBtn);

    const toggle = () => {
      const opened = sidebar.classList.toggle("active");
      document.body.classList.toggle("no-scroll", opened);
    };

    toggleBtn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    document.addEventListener("pointerup", (e) => {
      if (
        sidebar.classList.contains("active") &&
        !sidebar.contains(e.target) &&
        !toggleBtn.contains(e.target)
      )
        toggle();
    });
  }

  /* ⑤ FAQ 아코디언 -------------------------------------- */
  function initFaqToggle() {
    document.querySelectorAll("#tipFaqCard .faq-question").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("open");
        const ans = btn.nextElementSibling;
        if (ans) {
          const shown = ans.style.display === "block";
          ans.style.display = shown ? "none" : "block";
        }
      });
    });
  }
});

/* ⑥ 클립보드 헬퍼 -------------------------------------- */
function copyToClipboard(text, button = null) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (!button) return;
      const backup = { html: button.innerHTML, color: button.style.color };
      button.innerHTML = '<i class="fas fa-check"></i>';
      button.style.color = "var(--success)";
      setTimeout(() => {
        button.innerHTML = backup.html;
        button.style.color = backup.color;
      }, 2000);
    })
    .catch((err) => console.error("클립보드 복사 실패:", err));
}
window.copyToClipboard = copyToClipboard;
