// ---------- Starting data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];
const MAX_LENGTH = 200;

// ---------- Helpers ----------
// Lower-cases, trims and collapses runs of spaces so comparisons ignore
// case and extra whitespace.
function normalise(text) {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------- Functions ----------

// Returns every note whose text contains `word`, ignoring case.
function searchNotes(word) {
  const target = normalise(word);
  if (target === "") {
    return [];
  }
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(target);
  });
}

// Returns the note with the most characters, or null if there are none.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  return notes.reduce(function (longest, note) {
    return note.text.length > longest.text.length ? note : longest;
  });
}

// Returns an object such as { personal: 2, work: 1, study: 2 }.
function countByCategory() {
  const counts = {};
  VALID_CATEGORIES.forEach(function (category) {
    counts[category] = 0;
  });
  notes.forEach(function (note) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  });
  return counts;
}

// Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const parts = VALID_CATEGORIES.map(function (category) {
    return (counts[category] || 0) + " " + category;
  });
  const label = notes.length === 1 ? "note" : "notes";
  return notes.length + " " + label + ": " + parts.join(", ") + ".";
}

// True if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some(function (note) {
    return normalise(note.text) === target;
  });
}

// Adds a note if it passes every rule. Returns true when added, false otherwise.
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Not added: text must be a string.");
    return false;
  }
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > MAX_LENGTH) {
    console.log(
      "Not added: text must be 1-" + MAX_LENGTH + " characters (got " + cleaned.length + ")."
    );
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log('Not added: a note with the text "' + cleaned + '" already exists.');
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log(
      'Not added: category "' + category + '" must be one of ' + VALID_CATEGORIES.join(", ") + "."
    );
    return false;
  }

  const nextId = notes.reduce(function (max, note) {
    return Math.max(max, note.id);
  }, 0) + 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  return true;
}

// ---------- Tests ----------
// check() logs the actual result next to the expected one.
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    (pass ? "PASS" : "FAIL") + " - " + label,
    "\n   actual:  ", actual,
    "\n   expected:", expected
  );
}

const ids = function (list) {
  return list.map(function (note) { return note.id; });
};

console.log("--- searchNotes ---");
check('searchNotes("MILK") ids', ids(searchNotes("MILK")), [1]);
check('searchNotes("java") ids', ids(searchNotes("java")), [4]);
check('searchNotes("the") ids', ids(searchNotes("the")), [2, 3]);
check('searchNotes("zzz") ids', ids(searchNotes("zzz")), []);

console.log("--- longestNote ---");
check("longestNote() id", longestNote().id, 3);
const saved = notes.splice(0); // temporarily empty the array
check("longestNote() with no notes", longestNote(), null);
notes.push(...saved); // restore

console.log("--- countByCategory ---");
check("countByCategory()", countByCategory(), { personal: 2, work: 1, study: 2 });

console.log("--- getSummary ---");
check("getSummary()", getSummary(), "5 notes: 2 personal, 1 work, 2 study.");

console.log("--- isDuplicate ---");
check('isDuplicate("buy milk and bread")', isDuplicate("buy milk and bread"), true);
check('isDuplicate("  BUY   Milk  AND bread ")', isDuplicate("  BUY   Milk  AND bread "), true);
check('isDuplicate("Water the plants")', isDuplicate("Water the plants"), false);

console.log("--- addNote ---");
check('addNote("Water the plants", "personal")', addNote("Water the plants", "personal"), true);
check("addNote(duplicate with extra spaces)", addNote("  water   the PLANTS ", "personal"), false);
check('addNote("", "work")', addNote("", "work"), false);
check('addNote("   ", "work")', addNote("   ", "work"), false);
check("addNote(201 characters)", addNote("x".repeat(201), "work"), false);
check("addNote(200 characters)", addNote("y".repeat(200), "work"), true);
check('addNote("Plan holiday", "hobby")', addNote("Plan holiday", "hobby"), false);

console.log("--- after adding two notes ---");
check("getSummary()", getSummary(), "7 notes: 3 personal, 2 work, 2 study.");
