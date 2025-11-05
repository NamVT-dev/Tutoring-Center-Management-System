exports.LEVEL_ORDER = [
  "Starter","Beginner","Elementary",
  "Pre-Intermediate","Intermediate",
  "Upper-Intermediate","Advanced","Expert"
];
exports.LEVEL_INDEX = Object.fromEntries(exports.LEVEL_ORDER.map((lv, i) => [lv, i]));
