const LEVEL_ORDER = [
  "Starter",
  "Beginner",
  "Elementary",
  "Pre-Intermediate",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
  "Expert",
];
const LEVEL_INDEX = Object.fromEntries(LEVEL_ORDER.map((lv, i) => [lv, i]));

const IELTS_RANGE = {
  Starter: [0.0, 3.0],
  Beginner: [3.0, 4.0],
  Elementary: [4.0, 4.5],
  "Pre-Intermediate": [4.5, 5.0],
  Intermediate: [5.0, 5.5],
  "Upper-Intermediate": [6.0, 6.5],
  Advanced: [7.0, 7.5],
  Expert: [8.0, 9.0],
};

const TOEIC_RANGE = {
  Starter: [0, 250],
  Beginner: [255, 400],
  Elementary: [405, 500],
  "Pre-Intermediate": [505, 600],
  Intermediate: [605, 780],
  "Upper-Intermediate": [785, 900],
  Advanced: [905, 950],
  Expert: [955, 990],
};

// =======================
// 1) MAP TEST SCORE → LEVEL
// =======================

function mapScoreToLevel(score, categoryName) {
  const ranges =
    categoryName.toUpperCase() === "IELTS" ? IELTS_RANGE : TOEIC_RANGE;
  for (const level of LEVEL_ORDER) {
    const [min, max] = ranges[level];
    if (score >= min && score <= max) return level;
  }
  return null;
}

// =======================
// 2) CHECK TEACHER CAN TEACH COURSE
// =======================

function canTeachCourse(teacher, course) {
  if (!Array.isArray(teacher.skills)) return false;

  return teacher.skills.some((skill) => {
    if (String(skill.category) !== String(course.category)) return false;

    // Dạy mọi level trong category này
    if (skill.anyLevel) return true;

    // Dạy đúng level
    if (skill.levels?.includes(course.level)) return true;

    // Dạy được level thấp hơn
    if (skill.includeLowerLevels && skill.levels?.length) {
      const maxLevelTeacher = Math.max(
        ...skill.levels.map((l) => LEVEL_INDEX[l])
      );
      const needed = LEVEL_INDEX[course.level];
      return needed <= maxLevelTeacher;
    }

    return false;
  });
}

// =======================
// 3) SUGGEST COURSE FOR STUDENT
// =======================

function suggestCourseForStudent(student, allCourses) {
  const level = mapScoreToLevel(student.testScore, student.categoryName);
  return allCourses.find(
    (c) => c.level === level && String(c.category) === String(student.category)
  );
}

function getRoadmapLevels(currentLevel, targetLevel) {
  const currentIndex = LEVEL_INDEX[currentLevel];
  const targetIndex = LEVEL_INDEX[targetLevel];

  if (currentIndex === undefined || targetIndex === undefined) {
    throw new Error("Level đầu vào hoặc mục tiêu không hợp lệ.");
  }

  if (currentIndex > targetIndex) {
    return []; // Đã đạt
  }

  // Trả về các level từ (hiện tại + 1) đến (mục tiêu)
  const result= LEVEL_ORDER.slice(currentIndex, targetIndex + 1);
  console.log("[DEBUG] Resulting roadmap:", result);
  return result;
}

module.exports = {
  LEVEL_ORDER,
  LEVEL_INDEX,
  mapScoreToLevel,
  canTeachCourse,
  suggestCourseForStudent,
  getRoadmapLevels
};
