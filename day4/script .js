const DRAFT_KEY = "quicknotes-draft";
const THEME_KEY = "quicknotes-theme";
const MAX_CHARS = 200;
const WARN_AT = 180;

const textarea = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// ---------- localStorage helpers ----------
// Storage can be blocked (private mode, site settings), so never let it
// break the page.
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // ignore: the app still works without saving
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // ignore
  }
}

// ---------- Counters ----------
function countWords(text) {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function updateCounters() {
  const chars = textarea.value.length;

  charCount.textContent = chars + " / " + MAX_CHARS + " characters";
  wordCount.textContent = countWords(textarea.value) + " words";

  charCount.classList.toggle("warning", chars > WARN_AT);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}

// ---------- Draft ----------
function saveDraft() {
  if (textarea.value === "") {
    storageRemove(DRAFT_KEY);
  } else {
    storageSet(DRAFT_KEY, textarea.value);
  }
}

function restoreDraft() {
  const draft = storageGet(DRAFT_KEY);
  if (draft !== null) {
    textarea.value = draft;
  }
  updateCounters();
}

function clearNote() {
  textarea.value = "";
  updateCounters();
  storageRemove(DRAFT_KEY);
  textarea.focus();
}

// ---------- Theme ----------
// The button label names the mode you will switch TO.
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

function toggleTheme() {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  storageSet(THEME_KEY, isDark ? "dark" : "light");
}

// ---------- Events ----------
textarea.addEventListener("input", function () {
  updateCounters();
  saveDraft();
});

textarea.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearNote();
  }
});

clearBtn.addEventListener("click", clearNote);
themeToggle.addEventListener("click", toggleTheme);

// ---------- Start-up ----------
applyTheme(storageGet(THEME_KEY) === "dark");
restoreDraft();
