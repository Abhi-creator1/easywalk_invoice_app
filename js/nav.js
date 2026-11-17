function switchView(viewName) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  document.getElementById(`view-${viewName}`).classList.add("active");
  document.querySelector(`.nav-btn[data-view="${viewName}"]`).classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.querySelectorAll(".link-btn[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.goto));
  });
});
