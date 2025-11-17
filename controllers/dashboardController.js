const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Student = require("../models/studentModel");
const Class = require("../models/classModel");
const Enrollment = require("../models/enrollmentModel");
const Payment = require("../models/paymentModel");
const Complain = require("../models/complainModel");
const { User, Teacher } = require("../models/userModel");
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
exports.getDashboardOverview = catchAsync(async (req, res, next) => {

  const timezone = "Asia/Ho_Chi_Minh";
  const startOfMonth = moment.tz(timezone).startOf('month').toDate();
  const endOfMonth = moment.tz(timezone).endOf('month').toDate();
  const now = new Date();

  const [
    memberStats,
    teacherStats,
    classStats,
    complaintStats, 
    enrollmentStats,
    revenueStats
  ] = await Promise.all([
    User.aggregate([
      { $match: { role: "member" } },
      {
        $group: {
          _id: null,
          totalMembers: { $sum: 1 },
          newMembersThisMonth: {
            $sum: { $cond: [ { $gte: ["$createdAt", startOfMonth] }, 1, 0 ] }
          }
        }
      }
    ]),
    
    Teacher.countDocuments(),

    Class.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          newClassesThisMonth: {
            $sum: { $cond: [ { $gte: ["$createdAt", startOfMonth] }, 1, 0 ] }
          }
        }
      }
    ]),

    Complain.aggregate([
      {
        $group: {
          _id: null,
          totalComplaints: { $sum: 1 },
          processedComplaints: {
            $sum: { $cond: [ { $in: ["$status", ["Resolved", "Closed", "Rejected"]] }, 1, 0 ] }
          },
          unprocessedComplaints: {
            $sum: { $cond: [ { $in: ["$status", ["Pending", "Received", "In_Progress"]] }, 1, 0 ] }
          }
        }
      }
    ]),

    Enrollment.countDocuments({
      status: "confirmed",
      paidAt: { $gte: startOfMonth }
    }),
    
    Payment.aggregate([
      {
        $match: {
          status: "succeeded",
          createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenueThisMonth: { $sum: "$amount" }
        }
      }
    ])
  ]);

  const overview = {
    totalMembers: memberStats[0]?.totalMembers || 0,
    newMembersThisMonth: memberStats[0]?.newMembersThisMonth || 0,
    
    totalTeachers: teacherStats || 0,
    
    totalClasses: classStats[0]?.totalClasses || 0,
    newClassesThisMonth: classStats[0]?.newClassesThisMonth || 0,
    
    totalComplaints: complaintStats[0]?.totalComplaints || 0,
    processedComplaints: complaintStats[0]?.processedComplaints || 0,
    unprocessedComplaints: complaintStats[0]?.unprocessedComplaints || 0,

    newEnrollmentsThisMonth: enrollmentStats || 0,
    totalRevenueThisMonth: revenueStats[0]?.totalRevenueThisMonth || 0,
    lastUpdatedAt: now
  };

  res.status(200).json({
    status: "success",
    data: overview
  });
});
const getReportDateRange = (mode, dateStr, timezone) => {
  let start, end, unit;

  if (mode === 'year') {
    const yearMoment = dateStr ? moment.tz(dateStr, "YYYY", timezone) : moment.tz(timezone);
    start = yearMoment.clone().startOf('year');
    end = yearMoment.clone().endOf('year');
    unit = 'month'; 
  } else {

    const monthMoment = dateStr ? moment.tz(dateStr, "YYYY-MM", timezone) : moment.tz(timezone);
    start = monthMoment.clone().startOf('month');
    end = monthMoment.clone().endOf('month');
    unit = 'day'; 
  }

  return { start: start.toDate(), end: end.toDate(), unit };
};
exports.getRevenueReport = catchAsync(async (req, res, next) => {
  const timezone = "Asia/Ho_Chi_Minh";
  const { mode = 'month', date } = req.query; 
  const { start, end, unit } = getReportDateRange(mode, date, timezone);

  const [
    mainStats,
    statusStats,
    chartData
  ] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          status: "succeeded",
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ]),

    Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]),

    Payment.aggregate([
      {
        $match: {
          status: "succeeded",
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: (unit === 'day') 
            ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone } }
            : { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone } },
          revenue: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } } 
    ])
  ]);

  const totalRevenue = mainStats[0]?.totalRevenue || 0;
  const numDays = moment(end).diff(moment(start), 'days') + 1;
  const numWeeks = Math.max(1, moment(end).diff(moment(start), 'weeks'));
  const numMonths = Math.max(1, moment(end).diff(moment(start), 'months'));
  
  const stats = {
    totalRevenue: totalRevenue,
    avgMonthlyRevenue: (totalRevenue / numMonths),
    avgWeeklyRevenue: (totalRevenue / numWeeks),
  };

  const transactionStatus = {
    succeeded: 0,
    processing: 0,
    failed: 0,
  };
  statusStats.forEach(item => {
    if (transactionStatus[item._id] !== undefined) {
      transactionStatus[item._id] = item.count;
    }
  });
  
  const chart = chartData.map(item => ({
    label: item._id, 
    revenue: item.revenue
  }));

  res.status(200).json({
    status: "success",
    meta: {
      mode: mode,
      filterStartDate: start,
      filterEndDate: end,
      chartUnit: unit
    },
    data: {
      stats,
      transactionStatus,
      chart
    }
  });
});