/* ===========================
   RapidForce — My Models Scripts
   =========================== */

document.addEventListener("DOMContentLoaded", () => {
  initDownloadButtons();
  initNewGeneration();
  updateStorageBar();
});

/* --- Download buttons: simulate download --- */
function initDownloadButtons() {
  document.querySelectorAll("[data-action='download']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".model-card");
      const name = card
        ? card.querySelector(".model-card__name")?.textContent
        : "model";

      btn.innerHTML =
        '<span class="material-symbols-outlined text-xl">hourglass_top</span>';
      btn.disabled = true;

      setTimeout(() => {
        btn.innerHTML =
          '<span class="material-symbols-outlined text-xl">check_circle</span>';
        setTimeout(() => {
          btn.innerHTML =
            '<span class="material-symbols-outlined text-xl">download</span>';
          btn.disabled = false;
        }, 2000);
      }, 1500);

      console.log(`Downloading: ${name}`);
    });
  });
}

/* --- Empty slot: redirect to chat for new generation --- */
function initNewGeneration() {
  const emptySlot = document.querySelector(".model-card--empty");
  if (!emptySlot) return;

  emptySlot.addEventListener("click", () => {
    window.location.href = "./chat.html";
  });
}

/* --- Animate storage bar on load --- */
function updateStorageBar() {
  const fill = document.querySelector(".storage-card__bar-fill");
  if (!fill) return;

  const target = fill.dataset.percent || "60";
  fill.style.width = "0%";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.width = target + "%";
    });
  });
}
