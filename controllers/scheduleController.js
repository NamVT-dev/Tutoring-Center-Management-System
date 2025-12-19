const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Center = require("../models/centerModel");
const schedulingService = require("../services/schedulingService");
const ScheduleJob = require("../models/scheduleJobModel");
const Enrollment = require("../models/enrollmentModel");
const mongoose = require("mongoose");
const { Teacher } = require("../models/userModel");
const Session = require("../models/sessionModel");
const Class = require("../models/classModel");
exports.runScheduler = catchAsync(async (req, res, next) => {
  const center = await Center.findOne({ key: "default" });
  if (!center)
    return next(new AppError("Không tìm thấy cấu hình trung tâm.", 404));

  if (center.isScheduling) {
    return next(
      new AppError("Hệ thống đang xếp lịch. Vui lòng thử lại sau.", 409)
    );
  }

  const {
    intakeStartDate,
    intakeEndDate,
    threshold = 0.7,
    classStartAnchor,
  } = req.body;
  if (!intakeStartDate || !intakeEndDate) {
    return next(
      new AppError("Vui lòng cung cấp intakeStartDate và intakeEndDate.", 400)
    );
  }

  // 1. TẠO TÁC VỤ (JOB)
  const newJob = await ScheduleJob.create({
    admin: req.user.id,
    status: "pending",
    intakeStartDate,
    intakeEndDate,
    successThreshold: threshold,
    classStartAnchor: classStartAnchor || null,
    logs: [{ stage: "INIT", message: "Đã nhận lệnh, đang chờ thực thi..." }],
  });

  // 2. KHÓA HỆ THỐNG
  center.isScheduling = true;
  await center.save();

  // 3. KÍCH HOẠT THUẬT TOÁN (GỌI TRỰC TIẾP, KHÔNG AWAIT)
  schedulingService
    .runAutoScheduler(
      newJob._id, // Truyền ID của Job
      req.app.get("socketio") // Truyền server Socket.IO
    )
    .catch((err) => {
      // Xử lý lỗi nghiêm trọng nếu `runAutoScheduler` bị sập
      console.error(`Lỗi thảm họa Job ${newJob._id}:`, err);
      ScheduleJob.findByIdAndUpdate(newJob._id, {
        $set: { status: "system_error" },
        $push: {
          logs: { stage: "ERROR", message: err.message, isError: true },
        },
      }).exec();
      // Mở khóa
      Center.findOneAndUpdate(
        { key: "default" },
        { isScheduling: false }
      ).exec();
    });

  // 4. TRẢ VỀ NGAY LẬP TỨC
  res.status(202).json({
    status: "success",
    message: "Đã nhận lệnh. Bắt đầu quá trình xếp lịch...",
    data: { jobId: newJob._id },
  });
});

//Chốt (Finalize) bản nháp

exports.finalizeSchedule = catchAsync(async (req, res, next) => {
  const job = await ScheduleJob.findById(req.params.id);

  if (!job || job.status !== "draft") {
    return next(
      new AppError('Job này không ở trạng thái "Draft" để chốt.', 400)
    );
  }

  // const draftToCommit = req.body.draftSchedule || job.draftSchedule;

  try {
    // Gọi GĐ 5: Tạo Class/Session thật
    const result = await schedulingService.finalizeSchedule(job._id);

    // Mở khóa hệ thống
    await Center.findOneAndUpdate({ key: "default" }, { isScheduling: false });
    req.app.get("socketio").emit("schedule_unlocked");

    res.status(201).json({
      status: "success",
      message: "Đã chốt và tạo lịch thành công!",
      data: result,
    });
  } catch (error) {
    job.status = "system_error"; // Trả lại trạng thái lỗi
    job.logs.push({
      stage: "ERROR",
      message: `Lỗi khi chốt: ${error.message}`,
      isError: true,
    });
    await job.save();

    await Center.findOneAndUpdate({ key: "default" }, { isScheduling: false });
    req.app.get("socketio").emit("schedule_unlocked");
    next(error);
  }
});

exports.getScheduleAnalytics = catchAsync(async (req, res) => {
  // 1. Thống kê lý do thất bại
  const failureReasons = await ScheduleJob.aggregate([
    { $match: { status: "completed" } },
    { $unwind: "$resultReport.failedClasses" },
    {
      $group: {
        _id: "$resultReport.failedClasses.reasonCode",
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, reason: "$_id", count: "$count" } },
  ]);

  // 2. Thống kê cảnh báo "ép lịch"
  const warnings = await ScheduleJob.aggregate([
    { $match: { status: "completed" } },
    { $unwind: "$resultReport.warnings" },
    {
      $group: {
        _id: "$resultReport.warnings.teacherName",
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, teacher: "$_id", forcedCount: "$count" } },
    { $sort: { forcedCount: -1 } },
  ]);

  res.status(200).json({
    status: "success",
    data: {
      failureReasons,
      forcedScheduleWarnings: warnings,
    },
  });
});

exports.getScheduleJob = catchAsync(async (req, res, next) => {
  // Lấy chi tiết 1 job, populate đầy đủ để FE hiển thị
  const job = await ScheduleJob.findById(req.params.id)
    .populate("draftSchedule.teacher", "profile.fullname")
    .populate("draftSchedule.room", "name capacity")
    .populate("draftSchedule.courseId", "name level");

  if (!job) return next(new AppError("Không tìm thấy tác vụ.", 404));
  res.status(200).json({ status: "success", data: job });
});

exports.getAllScheduleJobs = catchAsync(async (req, res) => {
  // Lấy lịch sử 20 job gần nhất
  const jobs = await ScheduleJob.find({ admin: req.user.id })
    .sort("-createdAt")
    .limit(20)
    .select("status createdAt resultReport logs intakeStartDate");
  res.status(200).json({ status: "success", results: jobs.length, data: jobs });
});

exports.getSchedulerStatus = catchAsync(async (req, res) => {
  const center = await Center.findOne({ key: "default" }).select(
    "isScheduling"
  );
  res
    .status(200)
    .json({ status: "success", data: { isScheduling: center.isScheduling } });
});
exports.deleteScheduleJob = catchAsync(async (req, res, next) => {
  const jobId = req.params.id;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const job = await ScheduleJob.findById(jobId).session(session);
    if (!job) {
      throw new AppError("Không tìm thấy Job xếp lịch này", 404);
    }
    if (job.status === "running") {
      await Center.findOneAndUpdate(
        { key: "default" },
        { isScheduling: false },
        { session }
      );
    }

    if (job.status === "completed") {
      console.log(`[Rollback] Đang xóa dữ liệu của Job ${jobId}...`);

      const classesToDelete = await Class.find({ createdByJob: jobId })
        .select("_id startAt")
        .session(session);

      const classIds = classesToDelete.map((c) => c._id);

      if (classIds.length > 0) {
        const hasEnrollment = await Enrollment.exists({
          class:{ $in: classIds}
        }).session(session)
        if (hasEnrollment) {
          throw new AppError(
            "KHÔNG THỂ HỦY! Đã có học viên đăng ký vào các lớp học của lịch này. Vui lòng kiểm tra và xử lý các đăng ký trước.",
            409
          );
        }
        await Teacher.updateMany(
          { class: { $in: classIds } },
          { $pull: { class: { $in: classIds } } },
          { session }
        );

        await Session.deleteMany({ createdByJob: jobId }, { session });

        await Class.deleteMany({ createdByJob: jobId }, { session });
      }
    }

    await ScheduleJob.findByIdAndDelete(jobId, { session });

    await Center.findOneAndUpdate(
      { key: "default" },
      { isScheduling: false },
      { session }
    );

    await session.commitTransaction();

    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (error) {
    await session.abortTransaction();
    return next(new AppError("Không thể hủy Job: " + error.message, 500));
  } finally {
    session.endSession();
  }
});
