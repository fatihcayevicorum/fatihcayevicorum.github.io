const FOUR_VISIBLE_ROWS = 4;
const managedLists = document.querySelectorAll(".stock-list, .customer-list");

function fitFourRows(list) {
  const cards = [...list.children].filter((item) => !item.hidden);
  list.classList.remove("is-four-row-scroll");
  list.style.removeProperty("max-height");

  if (!cards.length) return;

  const rows = [];
  for (const card of cards) {
    const top = card.offsetTop;
    if (!rows.some((rowTop) => Math.abs(rowTop - top) < 2)) rows.push(top);
  }

  if (rows.length <= FOUR_VISIBLE_ROWS) return;

  const firstTop = rows[0];
  const fifthRowTop = rows[FOUR_VISIBLE_ROWS];
  const styles = getComputedStyle(list);
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const visibleHeight = Math.max(0, fifthRowTop - firstTop - 1 + paddingBottom);

  list.style.maxHeight = `${visibleHeight}px`;
  list.classList.add("is-four-row-scroll");
}

function refreshLists() {
  managedLists.forEach(fitFourRows);
}

const observer = new MutationObserver(refreshLists);
managedLists.forEach((list) => observer.observe(list, { childList: true }));

let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(refreshLists);
});

requestAnimationFrame(refreshLists);
