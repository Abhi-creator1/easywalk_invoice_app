// Multi-select calendar for treatment dates.
//
// Replaces the old pair of controls (a single date input with "+ Add Date", and
// a from/to pair with "+ Add Range"). One calendar now does all of it:
//
//   tap a day            -> toggle that single day
//   drag across days     -> select that whole span, like a hotel booking site
//   shift-tap a day      -> extend a span from the last day you tapped
//   drag from a selected day -> clear that span again
//   Whole month          -> the entire displayed month in one go
//
// Separate days and spans mix freely in one selection. The selection is just a
// Set of ISO dates; js/core/util.js collapses consecutive runs into range
// entries when the invoice is saved, which is what keeps the stored shape (and
// the "November 2025" labels) identical to before.
//
// Deliberately dependency-free: the desktop build has no network, so a CDN
// date-picker library is not an option.
(function () {
  const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
  const GRID_CELLS = 42; // six weeks, so the layout never jumps between months

  let popEl = null;
  let backdropEl = null;
  let gridEl = null;

  const state = {
    open: false,
    dates: new Set(),
    onChange: null,
    viewYear: 0,
    viewMonth: 0,        // 1-12
    lastAnchor: null,    // last plainly-tapped day, for shift-tap spans
    dragging: false,
    dragMode: "add",
    dragAnchor: null,
    dragBase: null,      // selection as it was when the drag started
    dragLast: null
  };

  // =======================
  // SELECTION
  // =======================
  function applySpan(base, fromIso, toIso, mode) {
    const dates = new Set(base);
    const start = fromIso <= toIso ? fromIso : toIso;
    const end = fromIso <= toIso ? toIso : fromIso;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (mode === "add") dates.add(d);
      else dates.delete(d);
    }
    return dates;
  }

  function commit(dates) {
    state.dates = dates;
    paintSelection();
    renderCount();
    if (state.onChange) state.onChange(new Set(dates));
  }

  // =======================
  // RENDERING
  // =======================
  function buildShell() {
    backdropEl = document.createElement("div");
    backdropEl.className = "dp-backdrop";
    backdropEl.addEventListener("pointerdown", close);

    popEl = document.createElement("div");
    popEl.className = "dp-pop";
    popEl.setAttribute("role", "dialog");
    popEl.setAttribute("aria-label", "Select treatment dates");
    popEl.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-step="-1" aria-label="Previous month">&#8249;</button>
        <select class="dp-month" aria-label="Month"></select>
        <input type="number" class="dp-year" aria-label="Year" step="1" />
        <button type="button" class="dp-nav" data-step="1" aria-label="Next month">&#8250;</button>
      </div>
      <div class="dp-weekdays">${WEEKDAY_LABELS.map(d => "<span>" + d + "</span>").join("")}</div>
      <div class="dp-grid"></div>
      <div class="dp-hint">Tap a date, or drag across dates for a range.</div>
      <div class="dp-quick">
        <button type="button" class="dp-action" data-action="month">Whole month</button>
        <button type="button" class="dp-action" data-action="weekdays">Weekdays</button>
        <button type="button" class="dp-action" data-action="clear">Clear all</button>
      </div>
      <div class="dp-foot">
        <span class="dp-count">0 dates selected</span>
        <button type="button" class="dp-done">Done</button>
      </div>
    `;

    const monthSelect = popEl.querySelector(".dp-month");
    monthSelect.innerHTML = MONTH_NAMES
      .map((name, i) => '<option value="' + (i + 1) + '">' + name + "</option>")
      .join("");
    monthSelect.addEventListener("change", () => {
      state.viewMonth = Number(monthSelect.value);
      renderGrid();
    });

    const yearInput = popEl.querySelector(".dp-year");
    yearInput.addEventListener("change", () => {
      const year = Number(yearInput.value);
      if (year >= 1900 && year <= 2200) {
        state.viewYear = year;
        renderGrid();
      } else {
        yearInput.value = state.viewYear;
      }
    });

    popEl.querySelectorAll(".dp-nav").forEach(btn => {
      btn.addEventListener("click", () => stepMonth(Number(btn.dataset.step)));
    });
    popEl.querySelectorAll(".dp-action").forEach(btn => {
      btn.addEventListener("click", () => runQuickAction(btn.dataset.action));
    });
    popEl.querySelector(".dp-done").addEventListener("click", close);

    gridEl = popEl.querySelector(".dp-grid");
    gridEl.addEventListener("pointerdown", onGridPointerDown);
    gridEl.addEventListener("pointermove", onGridPointerMove);
    gridEl.addEventListener("pointerup", endDrag);
    gridEl.addEventListener("pointercancel", endDrag);
    gridEl.addEventListener("dragstart", e => e.preventDefault());

    document.body.appendChild(backdropEl);
    document.body.appendChild(popEl);
  }

  function stepMonth(step) {
    let month = state.viewMonth + step;
    let year = state.viewYear;
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    state.viewMonth = month;
    state.viewYear = year;
    renderGrid();
  }

  // Builds the 42 day buttons. Called on open and on month change only -- never
  // during a drag, because replacing the cells mid-gesture drops the pointer
  // capture and the drag dies on touch devices.
  function renderGrid() {
    popEl.querySelector(".dp-month").value = String(state.viewMonth);
    popEl.querySelector(".dp-year").value = String(state.viewYear);

    const firstOfMonth = state.viewYear + "-" + pad2(state.viewMonth) + "-01";
    const leadingBlanks = new Date(isoToUtcMs(firstOfMonth)).getUTCDay(); // 0 = Sunday
    const gridStart = addDays(firstOfMonth, -leadingBlanks);
    const today = todayIso();

    let html = "";
    for (let i = 0; i < GRID_CELLS; i++) {
      const iso = addDays(gridStart, i);
      const inMonth = Number(iso.split("-")[1]) === state.viewMonth;
      const classes = ["dp-day"];
      if (!inMonth) classes.push("dp-other");
      if (iso === today) classes.push("dp-today");
      html += '<button type="button" class="' + classes.join(" ") + '" data-date="' + iso +
        '" tabindex="-1">' + Number(iso.split("-")[2]) + "</button>";
    }
    gridEl.innerHTML = html;
    paintSelection();
  }

  // Updates only the selection classes on the existing cells.
  function paintSelection() {
    if (!gridEl) return;
    gridEl.querySelectorAll(".dp-day").forEach(cell => {
      const iso = cell.dataset.date;
      const selected = state.dates.has(iso);
      cell.classList.toggle("dp-sel", selected);

      // Connected banding, so a 30-day span reads as one block.
      const prevSel = selected && state.dates.has(addDays(iso, -1));
      const nextSel = selected && state.dates.has(addDays(iso, 1));
      cell.classList.toggle("dp-mid", prevSel && nextSel);
      cell.classList.toggle("dp-start", !prevSel && nextSel);
      cell.classList.toggle("dp-end", prevSel && !nextSel);
    });
  }

  function renderCount() {
    const count = state.dates.size;
    popEl.querySelector(".dp-count").textContent =
      count === 1 ? "1 date selected" : count + " dates selected";
  }

  // =======================
  // INTERACTION
  // =======================
  function dayFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.classList && el.classList.contains("dp-day") ? el : null;
  }

  function onGridPointerDown(e) {
    const cell = e.target.closest(".dp-day");
    if (!cell) return;
    e.preventDefault();

    const iso = cell.dataset.date;

    // Shift-tap extends a span from the last plainly-tapped day.
    if (e.shiftKey && state.lastAnchor) {
      commit(applySpan(state.dates, state.lastAnchor, iso, "add"));
      state.lastAnchor = iso;
      return;
    }

    state.dragging = true;
    state.dragAnchor = iso;
    state.dragLast = iso;
    // Dragging out from an already-selected day clears that span instead.
    state.dragMode = state.dates.has(iso) ? "remove" : "add";
    state.dragBase = new Set(state.dates);
    state.lastAnchor = iso;

    try { gridEl.setPointerCapture(e.pointerId); } catch (ignored) { /* non-critical */ }
    commit(applySpan(state.dragBase, iso, iso, state.dragMode));
  }

  function onGridPointerMove(e) {
    if (!state.dragging) return;
    // Without pointer capture the event already targets the cell under the
    // pointer; with capture it always targets the grid, so fall back to
    // hit-testing the coordinates.
    const direct = e.target && e.target.closest ? e.target.closest(".dp-day") : null;
    const cell = direct || dayFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    const iso = cell.dataset.date;
    if (iso === state.dragLast) return;
    state.dragLast = iso;

    // Recomputed from the pre-drag snapshot every time, so sweeping back and
    // forth never leaves stray days behind.
    commit(applySpan(state.dragBase, state.dragAnchor, iso, state.dragMode));
  }

  function endDrag() {
    state.dragging = false;
    state.dragBase = null;
    state.dragAnchor = null;
    state.dragLast = null;
  }

  function runQuickAction(action) {
    if (action === "clear") {
      commit(new Set());
      return;
    }

    const total = daysInMonth(state.viewYear, state.viewMonth);
    const dates = new Set(state.dates);
    for (let day = 1; day <= total; day++) {
      const iso = state.viewYear + "-" + pad2(state.viewMonth) + "-" + pad2(day);
      if (action === "weekdays") {
        const weekday = new Date(isoToUtcMs(iso)).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
      }
      dates.add(iso);
    }
    commit(dates);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && state.open) close();
  }

  function position(anchorEl) {
    const narrow = window.matchMedia("(max-width: 820px)").matches;
    popEl.classList.toggle("dp-sheet", narrow);
    if (narrow) {
      popEl.style.top = "";
      popEl.style.left = "";
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const width = popEl.offsetWidth || 320;
    const height = popEl.offsetHeight || 400;

    // Preferred spot: directly below the button, flipping above it if there is
    // no room.
    let left = rect.left;
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 6;

    // Then clamped into the viewport outright. Flipping alone is not enough:
    // if the anchor itself is off-screen (scrolled past, or moved by the
    // on-screen keyboard) the calendar would otherwise be positioned where it
    // cannot be seen or tapped.
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    top = Math.min(Math.max(8, top), maxTop);
    left = Math.min(Math.max(8, left), maxLeft);

    popEl.style.left = left + "px";
    popEl.style.top = top + "px";
  }

  // =======================
  // PUBLIC API
  // =======================
  function openDatePicker(options) {
    if (!popEl) buildShell();

    state.open = true;
    state.dates = new Set(options.dates || []);
    state.onChange = options.onChange || null;
    state.lastAnchor = null;
    endDrag();

    // Opens on the month of the earliest selected date, else the current month.
    const firstSelected = [...state.dates].sort()[0] || todayIso();
    state.viewYear = Number(firstSelected.split("-")[0]);
    state.viewMonth = Number(firstSelected.split("-")[1]);

    backdropEl.classList.add("visible");
    popEl.classList.add("visible");
    renderGrid();
    renderCount();
    position(options.anchorEl);

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerup", endDrag);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    endDrag();
    backdropEl.classList.remove("visible");
    popEl.classList.remove("visible");
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("pointerup", endDrag);
  }

  window.openDatePicker = openDatePicker;
  window.closeDatePicker = close;
})();

// =======================
// MANUAL ENTRY
// =======================
// The alternative to the calendar: type the dates. Accepts
//   3/11/25      7/11/2025      3-11-25      2025-11-07
//   3/11/25 - 9/11/25           1/11/25 to 30/11/25
// separated by commas, semicolons or newlines.
//
// Each token is matched whole rather than split on punctuation, because "-" is
// both a valid date separator and the range separator.
const DMY_PART = "\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-](?:\\d{2}|\\d{4})";
const ISO_PART = "\\d{4}-\\d{2}-\\d{2}";
const RANGE_GLUE = "\\s*(?:to|\\u2013|\\u2014|-)\\s*";

const ISO_SINGLE_RE = new RegExp("^(" + ISO_PART + ")$", "i");
const ISO_RANGE_RE = new RegExp("^(" + ISO_PART + ")" + RANGE_GLUE + "(" + ISO_PART + ")$", "i");
const DMY_SINGLE_RE = new RegExp("^(" + DMY_PART + ")$", "i");
const DMY_RANGE_RE = new RegExp("^(" + DMY_PART + ")" + RANGE_GLUE + "(" + DMY_PART + ")$", "i");

// A fat-fingered year ("2/11/25 - 2/11/2099") must not try to add 27000 days.
const MAX_SPAN_DAYS = 400;

function parseManualDates(text) {
  const dates = new Set();
  const errors = [];

  function addOne(iso, token) {
    if (isRealDate(iso)) dates.add(iso);
    else errors.push(token);
  }

  function addSpan(fromIso, toIso, token) {
    if (!isRealDate(fromIso) || !isRealDate(toIso)) {
      errors.push(token);
      return;
    }
    const start = fromIso <= toIso ? fromIso : toIso;
    const end = fromIso <= toIso ? toIso : fromIso;
    let guard = 0;
    for (let d = start; d <= end && guard < MAX_SPAN_DAYS; d = addDays(d, 1)) {
      dates.add(d);
      guard++;
    }
    if (guard >= MAX_SPAN_DAYS) errors.push(token);
  }

  String(text || "")
    .split(/[,;\n]+/)
    .map(token => token.trim())
    .filter(Boolean)
    .forEach(token => {
      let match = token.match(ISO_RANGE_RE);
      if (match) return addSpan(match[1], match[2], token);

      match = token.match(ISO_SINGLE_RE);
      if (match) return addOne(match[1], token);

      match = token.match(DMY_RANGE_RE);
      if (match) return addSpan(parseDmy(match[1]), parseDmy(match[2]), token);

      match = token.match(DMY_SINGLE_RE);
      if (match) return addOne(parseDmy(match[1]), token);

      errors.push(token);
    });

  return { dates, errors };
}

function parseDmy(token) {
  const match = String(token).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  return year + "-" + pad2(month) + "-" + pad2(day);
}

function isRealDate(iso) {
  if (!isIsoDate(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}
