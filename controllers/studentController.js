const mongoose = require("mongoose");
const moment = require("moment-timezone");
const Student = require("../models/studentModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Course = require("../models/courseModel");
const Class = require("../models/classModel");
const Center = require("../models/centerModel");
const Enrollment = require("../models/enrollmentModel");
const Session = require("../models/sessionModel");
const CustomScheduleRequest = require("../models/customScheduleRequestModel");
const {
  mapScoreToLevel,
  getRoadmapLevels,
  LEVEL_INDEX,
} = require("../utils/levels");
const { notifyHoldCreated } = require("../utils/notification");
const vnpay = require("../config/vnpay");
const Attendance = require("../models/attendanceModel");

exports.getAllMyStudent = catchAsync(async (req, res) => {
  const user = await req.user.populate("student");
  res.status(200).json({
    status: "success",
    data: user.student,
  });
});

exports.getOneStudent = catchAsync(async (req, res, next) => {
  const studentId = req.params.id;
  if (!req.user.student.includes(studentId))
    return next(new AppError("Không tìm thấy học viên", 404));

  const student = await Student.findById(studentId).populate("class", "name");
  if (!student) return next(new AppError("Không tìm thấy học viên", 404));
  res.status(200).json({
    status: "success",
    data: student,
  });
});

exports.updateStudent = catchAsync(async (req, res, next) => {
  const studentId = req.params.id;
  if (!req.user.student.includes(studentId))
    return next(new AppError("Không tìm thấy học viên", 404));

  const student = await Student.findById(studentId);
  if (!student) return next(new AppError("Không tìm thấy học viên", 404));

  const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach((el) => {
      if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
  };

  const filteredBody = filterObj(req.body, "name", "dob", "gender");
  if (req.file) filteredBody.photo = req.file.filename;
  const updatedStudent = await Student.findByIdAndUpdate(
    studentId,
    filteredBody,
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: "success",
    data: {
      student: updatedStudent,
    },
  });
});

exports.updateLearningGoal = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { category, targetScore, deadline, constraints } = req.body;
  const userId = req.user.id;

  if (new Date(deadline) < new Date()) {
    return next(new AppError("deadline phải lớn hơn ngày hôm nay", 400));
  }
  if (!category || !targetScore || !deadline) {
    return next(
      new AppError(
        "Vui lòng cung cấp đủ category, targetScore và deadline",
        400
      )
    );
  }

  const student = await Student.findOne({ _id: id, user: userId });

  if (!student) {
    return next(new AppError("Không tìm thấy học viên", 404));
  }

  student.learningGoal = {
    category,
    targetScore,
    deadline,
    constraints,
  };

  await student.save({ validateModifiedOnly: true });

  res.status(200).json({
    status: "success",
    data: {
      learningGoal: student.learningGoal,
    },
  });
});

let centerConfig = null;
const getCenterConfig = async () => {
  if (centerConfig) return centerConfig;
  centerConfig = await Center.findOne({ key: "default" }).lean();
  return centerConfig;
};
exports.getRoadmap = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { category: categoryId } = req.query;

  if (!categoryId) {
    return next(new AppError("Cần cung cấp categoryId", 400));
  }

  const student = await Student.findById(id).populate(
    "category learningGoal.category"
  );

  if (!student) {
    return next(new AppError("Không tìm thấy học viên", 404));
  }
  if (!student.learningGoal) {
    return next(new AppError("Học viên chưa đặt mục tiêu", 400));
  }

  const studentCategory = student.category.find(
    (c) => c._id.toString() === categoryId
  );

  const scoreOrLevelString = student.testScore;

  if (!student.tested || !scoreOrLevelString || !studentCategory) {
    return next(
      new AppError("Học viên chưa có kết quả test cho category này", 400)
    );
  }

  const categoryName = studentCategory.name;

  const goal =
    student.learningGoal.category?._id.toString() === categoryId
      ? student.learningGoal
      : null;

  if (!goal) {
    return next(new AppError("Chưa đặt mục tiêu cho category này", 400));
  }

  const currentLevel = mapScoreToLevel(scoreOrLevelString, categoryName);
  const targetLevel = goal.targetScore;

  const requiredLevels = getRoadmapLevels(currentLevel, targetLevel);
  if (requiredLevels.length === 0) {
    return res.status(200).json({
      status: "success",
      data: {
        stages: [],
        upcomingClasses: [],
        message: "Học viên đã đạt mục tiêu.",
      },
    });
  }

  const stages = await Course.find({
    category: categoryId,
    level: { $in: requiredLevels },
  }).lean();

  stages.sort((a, b) => LEVEL_INDEX[a.level] - LEVEL_INDEX[b.level]);

  const stageIds = stages.map((s) => s._id);

  const constraints = goal.constraints;
  const center = await getCenterConfig();

  const allowedStartMinutes = center.shifts
    .filter((shift) => constraints.shifts.includes(shift.name))
    .map((shift) => shift.startMinute);
  const allowedDays = constraints.days;

  const query = {
    course: { $in: stageIds },
    status: "approved",
    startAt: { $gt: new Date() },
  };

  if (allowedDays.length > 0 && allowedStartMinutes.length > 0) {
    query["weeklySchedules"] = {
      $not: {
        $elemMatch: {
          $or: [
            { dayOfWeek: { $nin: allowedDays } },
            { startMinute: { $nin: allowedStartMinutes } },
          ],
        },
      },
    };
  }

  let upcomingClasses = await Class.find(query)
    .populate("course", "name level")
    .limit(20)
    .lean();

  const availableClasses = upcomingClasses.filter((cls) => {
    const confirmed = cls.student ? cls.student.length : 0;
    const reserved = cls.reservedCount || 0;
    return confirmed + reserved < cls.maxStudent;
  });

  res.status(200).json({
    status: "success",
    data: {
      stages,
      upcomingClasses: availableClasses,
    },
  });
});

exports.createCustomSchedule = catchAsync(async (req, res, next) => {
  const {
    student: studentId,
    category,
    courseId,
    preferredDays,
    preferredShifts,
    note,
  } = req.body;
  const userId = req.user.id;

  if (!studentId || !category) {
    return next(new AppError("Vui lòng cung cấp studentId và categoryId", 400));
  }
  const studentProfile = await Student.findOne({
    _id: studentId,
    user: userId,
  });

  if (!studentProfile) {
    return next(
      new AppError("Không tìm thấy học viên này trong tài khoản của bạn", 404)
    );
  }

  const newRequest = await CustomScheduleRequest.create({
    student: studentId,
    category,
    courseId,
    preferredDays,
    preferredShifts,
    note,
    status: "open",
  });

  res.status(201).json({
    status: "success",
    data: {
      request: newRequest,
    },
  });
});

const HOLD_TTL_MINUTES = 15;

const createPaymentURL = (amount, txnref) => {
  const paymentUrl = vnpay.buildPaymentUrl({
    vnp_Amount: amount,
    vnp_IpAddr: "192.168.1.1",
    vnp_ReturnUrl: "http://localhost:5173/return",
    vnp_TxnRef: txnref,
    vnp_OrderInfo: "Thanh toán đơn hàng",
  });

  return paymentUrl;
};

exports.createSeatHold = catchAsync(async (req, res, next) => {
  const { student, classId } = req.body;

  if (!student || !classId) {
    return next(new AppError("Vui lòng cung cấp studentId và classId", 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  let newEnrollment = null;
  try {
    // 1. Tìm lớp và khóa học (để lấy giá) TRONG session
    const classToEnroll = await Class.findById(classId).session(session);
    if (!classToEnroll) {
      throw new AppError("Không tìm thấy lớp học", 404);
    }
    if (classToEnroll.status !== "approved") {
      throw new AppError("Lớp học chưa sẵn sàng để đăng ký", 400);
    }

    const course = await Course.findById(classToEnroll.course).session(session);
    if (!course) {
      throw new AppError("Không tìm thấy thông tin khóa học", 404);
    }

    // 2. Check Race Condition: Đảm bảo lớp còn chỗ
    if (classToEnroll.currentSize >= classToEnroll.maxStudent) {
      throw new AppError("Lớp đã đầy, vui lòng chọn lớp khác", 400);
    }

    // 3. Check xem student đã hold/
    // ed lớp này chưa
    const existingEnrollment = await Enrollment.findOne({
      student: student,
      class: classId,
      status: { $in: ["hold", "confirmed"] },
    }).session(session);

    if (existingEnrollment) {
      if (existingEnrollment.status === "hold") {
        throw new AppError(
          "Bạn đang giữ chỗ lớp này. Vui lòng kiểm tra lại.",
          409
        );
      } else {
        throw new AppError("Bạn đã đăng ký hoặc đang giữ chỗ lớp này", 409); // 409 Conflict
      }
    }
    // 4. TĂNG reservedCount của lớp
    classToEnroll.reservedCount += 1;
    await classToEnroll.save({ session });

    // 5. TẠO Enrollment (status='hold')
    const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000);

    [newEnrollment] = await Enrollment.create(
      [
        {
          student: student,
          class: classId,
          course: course._id,
          amount: course.price,
          status: "hold",
          holdExpiresAt: holdExpiresAt,
        },
      ],
      { session: session }
    );

    // 6. Commit transaction
    await session.commitTransaction();

    const checkoutUrl = createPaymentURL(course.price, newEnrollment.id);

    // 7. Tạo thông tin thanh toán trả về
    const paymentInfo = {
      checkoutUrl,
    };

    notifyHoldCreated(student, newEnrollment);

    res.status(201).json({
      status: "success",
      message: "Giữ chỗ thành công",
      data: {
        enrollment: newEnrollment,
        paymentInfo,
      },
    });
  } catch (error) {
    // 8. Nếu có lỗi, Abort transaction
    await session.abortTransaction();
    // 9. Ném lỗi ra ngoài để catchAsync xử lý
    throw error;
  } finally {
    // 10. Luôn luôn kết thúc session
    session.endSession();
  }
});

exports.getMyEnrolledClasses = catchAsync(async (req, res, next) => {
  const studentId = req.params.id;

  const isOwner = req.user.student.some((s) => s._id.toString() === studentId);
  if (!isOwner) {
    return next(
      new AppError("Bạn không có quyền xem danh sách lớp của học viên này", 403)
    );
  }

  const enrollments = await Enrollment.find({
    student: studentId,
    status: "confirmed",
  })
    .populate({
      path: "class",
      select: "name classCode startAt endAt preferredTeacher status",
      populate: {
        path: "preferredTeacher",
        select: "profile.fullname",
      },
    })
    .sort({ createdAt: -1 });

  const classes = enrollments.map((enr) => enr.class);

  res.status(200).json({
    status: "success",
    results: classes.length,
    data: {
      classes,
    },
  });
});

exports.getStudentClassDetail = catchAsync(async (req, res, next) => {
  const { id: studentId, classId } = req.params;

  const isOwner = req.user.student.some((s) => s._id.toString() === studentId);
  if (!isOwner) {
    return next(
      new AppError("Bạn không có quyền xem thông tin của học viên này", 403)
    );
  }

  const isEnrolled = await Enrollment.exists({
    student: studentId,
    class: classId,
    status: "confirmed",
  });
  if (!isEnrolled) {
    return next(new AppError("Học viên này không tham gia lớp học này", 403));
  }
  const [classInfo, sessions, enrollments] = await Promise.all([
    // A. Lấy thông tin Lớp và Khóa học
    Class.findById(classId)
      .populate({
        path: "course",
        select: "name level description",
      })
      .populate({
        path: "preferredTeacher",
        select: "profile.fullname",
      })
      .lean(),

    // B. Lấy toàn bộ lịch học (Sessions)
    Session.find({
      class: classId,
      status: { $in: ["scheduled", "published"] },
    })
      .populate("room", "name")
      .populate("teacher", "profile.fullname")
      .sort({ sessionNo: 1, startAt: 1 })
      .lean(),

    Enrollment.find({
      class: classId,
      status: "confirmed",
    })
      .select("student")
      .populate({
        path: "student",
        select: "name",
      })
      .lean(),
  ]);

  await Promise.all(
    sessions.map(async (s) => {
      const attendance = await Attendance.findOne(
        {
          session: s,
          attendance: { $elemMatch: { student: studentId } },
        },
        {
          "attendance.status": 1,
          "attendance.note": 1,
          "attendance.student": 1,
          status: 1,
        }
      );
      if (!attendance) return;
      s.attendanceStatus = attendance.status;
      s.attendance = attendance.attendance.find(
        (a) => a.student.id.toString() === studentId.toString()
      );
    })
  );

  if (!classInfo) {
    return next(new AppError("Không tìm thấy lớp học", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      classInfo,
      sessions,
      enrollments,
    },
  });
});

exports.getMySchedule = catchAsync(async (req, res, next) => {
  const studentId = req.params.id;
  const timezone = "Asia/Ho_Chi_Minh";

  const isOwner = req.user.student.some((s) => s._id.toString() === studentId);
  if (!isOwner) {
    return next(
      new AppError("Bạn không có quyền xem lịch học của học viên này", 403)
    );
  }

  let { startDate, endDate } = req.query;
  const start = startDate
    ? moment.tz(startDate, timezone).startOf("day")
    : moment.tz(timezone).startOf("day");
  const end = endDate
    ? moment.tz(endDate, timezone).endOf("day")
    : start.clone().add(7, "days").endOf("day");

  if (start.isAfter(end)) {
    return next(new AppError("Ngày bắt đầu không thể sau ngày kết thúc", 400));
  }

  const enrollments = await Enrollment.find({
    student: studentId,
    status: "confirmed",
  })
    .select("class")
    .lean();

  const classIds = enrollments.map((enr) => enr.class);

  const sessions = await Session.find({
    class: { $in: classIds },
    status: { $in: ["scheduled", "published"] },
    startAt: {
      $gte: start.toDate(),
      $lte: end.toDate(),
    },
  })
    .populate({
      path: "class",
      select: "name classCode",
    })
    .populate({
      path: "room",
      select: "name",
    })
    .populate({
      path: "teacher",
      select: "profile.fullname",
    })
    .sort({ startAt: 1 });

  res.status(200).json({
    status: "success",
    results: sessions.length,
    data: {
      sessions,
    },
  });
});
