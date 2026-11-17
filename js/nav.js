function switchView(viewName) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  document.getElementById("view-" + viewName).classList.add("active");
  const button = document.querySelector('.nav-btn[data-view="' + viewName + '"]');
  if (button) {
    button.classList.add("active");
    // On a phone the nav scrolls sideways, so bring the active tab into view.
    if (button.scrollIntoView) {
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  if (typeof closeDatePicker === "function") closeDatePicker();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  document.dispatchEvent(new CustomEvent("easywalk:viewchange", { detail: viewName }));
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.querySelectorAll(".link-btn[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.goto));
  });
});
