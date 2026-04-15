/* ===========================
   RapidForce — Shared Scripts
   =========================== */

document.addEventListener("DOMContentLoaded", () => {
  initSidebarNavigation();
});

/* --- Sidebar: highlight active link based on current page --- */
function initSidebarNavigation() {
  const currentPage = window.location.pathname.split("/").pop() || "chat.html";
  const navLinks = document.querySelectorAll(".sidebar__link");

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href && currentPage.includes(href.replace("./", ""))) {
      link.classList.add("sidebar__link--active");
    } else {
      link.classList.remove("sidebar__link--active");
    }
  });
}

/* --- Reusable: format timestamp --- */
function formatTime(date) {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}
