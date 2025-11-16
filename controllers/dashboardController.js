const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Student = require("../models/studentModel");
const Class = require("../models/classModel");
const Enrollment = require("../models/enrollmentModel");
const { mapScoreToLevel, LEVEL_INDEX } = require("../utils/levels");
const moment = require("moment-timezone");

const findNewLeads = (startDate, endDate) => {
  return Student.find({
    tested: true,
    enrolled: false,
    class: { $size: 0 },
    testResultAt: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .select("name email testScore level category testResultAt")
    .populate("category", "name")
    .sort({ testResultAt: -1 })
    .lean();
};

const findWaitingStudents = async (startDate) => {
  const finishedClasses = await Class.find({
    endAt: { $lt: startDate },
    status: { $ne: "canceled" },
  })
    .select("_id")
    .lean();

  const finishedClassIds = finishedClasses.map((c) => c._id);
  if (finishedClassIds.length === 0) return [];

  const completedEnrollments = await Enrollment.find({
    class: { $in: finishedClassIds },
    status: "confirmed",
  })
    .select("student")
    .lean();

  const completedStudentIds = [
    ...new Set(completedEnrollments.map((e) => e.student)),
  ];
  if (completedStudentIds.length === 0) return [];
  const waitlist = await Student.find({
    _id: { $in: completedStudentIds },
    enrolled: false,
    "learningGoal.targetScore": { $exists: true },
  })
    .populate("category", "name")
    .populate("learningGoal.category", "name")
    .lean();

  const waitingStudents = waitlist.filter((student) => {
    const categoryName = student.category[0]?.name;
    if (!categoryName || !student.level) return false;
    const currentLevel = mapScoreToLevel(student.level, categoryName);
    const currentLevelIndex = LEVEL_INDEX[currentLevel];
    const goalLevelIndex = LEVEL_INDEX[student.learningGoal.targetScore];
    return goalLevelIndex > currentLevelIndex;
  });

  return waitingStudents;
};

exports.getStudentDemandReport = catchAsync(async (req, res, next) => {
  const timezone = "Asia/Ho_Chi_Minh";
  let { startDate, endDate } = req.query;

  const start = startDate
    ? moment.tz(startDate, timezone).startOf("day").toDate()
    : moment.tz(timezone).subtract(7, 'days').startOf("day").toDate();

  const end = endDate
    ? moment.tz(endDate, timezone).endOf("day").toDate()
    : moment.tz(timezone).endOf("day").toDate();

  if (start > end) {
      return next(new AppError("Ngày bắt đầu không thể sau ngày kết thúc", 400));
  }

  const [newLeads, waitingStudents] = await Promise.all([
    findNewLeads(start, end),
    findWaitingStudents(start), 
  ]);

  res.status(200).json({
    status: "success",
    filterDate: {
      filterStartDate: start,
      filterEndDate: end
    },
    data: {
      newLeads: {
        count: newLeads.length,
        students: newLeads,
      },
      waitingStudents: {
        count: waitingStudents.length,
        students: waitingStudents,
      },
    },
  });
});
