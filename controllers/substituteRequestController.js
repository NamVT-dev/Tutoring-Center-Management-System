const mongoose = require("mongoose");
const ScheduleChangeRequest = require("../models/substituteRequestModel");
const Session = require("../models/sessionModel");
const { Teacher, User } = require("../models/userModel");
const Course = require("../models/courseModel");
const { checkConflict } = require("../utils/conflictHelper");
const { canTeachCourse } = require("../services/schedulingService");
const { createSystemNotification } = require("../utils/notification");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

exports.createSubstituteRequest = catchAsync(async (req, res, next) => {
  const { sessionId, newTeacherId, reason } = req.body;
  const teacherId = req.user.id;
  console.log(teacherId);

  const session = await Session.findById(sessionId)
    .populate("class", "name classCode") // Lấy tên lớp
    .populate("room", "name");
  if (!session) return next(new AppError("Không tìm thấy buổi học", 404));

  if (session.teacher._id.toString() !== teacherId) {
    console.log(session.teacher._id.toString());
    return next(new AppError("Không phải lớp của bạn", 403));
  }
  if (new Date(session.startAt) < new Date()) {
    return next(
      new AppError("Không thể yêu cầu đổi lịch cho buổi học đã diễn ra.", 400)
    );
  }
  if (session.status === "canceled" || session.status === "completed") {
    return next(
      new AppError("Buổi học này đã bị hủy hoặc đã hoàn thành.", 400)
    );
  }
  const existingRequest = await ScheduleChangeRequest.findOne({
    session: sessionId,
    status: { $in: ["pending_teacher", "pending_admin","approved"] },
  });

  if (existingRequest) {
    return next(
      new AppError(
        "Đang có một yêu cầu thay đổi khác cho buổi học này đang chờ xử lý.",
        400
      )
    );
  }
  let initialStatus = newTeacherId ? "pending_teacher" : "pending_admin";

  const request = await ScheduleChangeRequest.create({
    teacher: teacherId,
    session: sessionId,
    newTeacher: newTeacherId || null,
    type: "substitute",
    reason,
    status: initialStatus,
  });

  // Gửi Thông báo
  const io = req.app.get("socketio");
  const dateStr = new Date(session.startAt).toLocaleDateString("vi-VN");
  const timeStr = `${new Date(session.startAt).getHours()}:${new Date(session.startAt).getMinutes()}`;
  const detailBody = `GV ${req.user.profile.fullname} nhờ dạy thay lớp ${session.class.name}.
  ⏰ ${timeStr} ngày ${dateStr}.
  📍 Phòng ${session.room.name}.`;
  if (newTeacherId) {
    // Luồng 1: Gửi cho GV B
    await createSystemNotification({
      recipientId: newTeacherId,
      title: "Lời mời dạy thay",
      body: detailBody,
      linkId: request._id,
      io,
    });
  } else {
    // Luồng 3: Gửi cho Admin
    await createSystemNotification({
      recipientGroup: "staff", // Gửi cho nhóm Staff/Admin
      title: "Yêu cầu tìm người dạy thay",
      body: `GV ${req.user.profile.fullname} cần tìm người dạy thay gấp.`,
      linkId: request._id,
      io,
    });
  }

  res.status(201).json({ status: "success", data: { request } });
});

exports.respondToRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { response, message } = req.body;
  const userId = req.user.id;

  const request = await ScheduleChangeRequest.findById(id).populate("session");
  if (!request || request.status !== "pending_teacher")
    return next(new AppError("Yêu cầu không hợp lệ", 400));
  if (request.newTeacher.toString() !== userId)
    return next(new AppError("Không có quyền", 403));

  const io = req.app.get("socketio");

  if (response === "decline") {
    request.status = "rejected";
    request.teacherResponse = message;
    await request.save();

    await createSystemNotification({
      recipientId: request.teacher,
      title: "Bị từ chối dạy thay",
      body: `Giáo viên được mời đã từ chối. Vui lòng tìm người khác hoặc nhờ Admin.`,
      linkId: request._id,
      io,
    });

    return res.status(200).json({ status: "success", message: "Đã từ chối" });
  }

  if (response === "accept") {
    // 1. Check Conflict ngay lúc này để đảm bảo B rảnh
    const targetSession = request.session;
    const conflict = await checkConflict(
      targetSession._id,
      userId,
      targetSession.room,
      targetSession.startAt,
      targetSession.endAt
    );
    if (conflict) return next(conflict);

    // 2. Cập nhật Request -> PENDING_ADMIN
    request.status = "pending_admin";
    request.teacherResponse = message;
    await request.save();

    // 3. Thông báo
    // Báo Admin
    await createSystemNotification({
      recipientGroup: "staff",
      title: "Dạy thay cần duyệt",
      body: `GV ${req.user.profile.fullname} đã đồng ý. Vui lòng duyệt trước giờ học.`,
      linkId: request._id,
      io,
    });
    // Báo GV A
    await createSystemNotification({
      recipientId: request.teacher,
      title: "Đã chấp nhận (Chờ duyệt)",
      body: `GV B đã đồng ý. Chờ Admin duyệt (hoặc hệ thống sẽ tự duyệt trước giờ học).`,
      linkId: request._id,
      io,
    });

    return res.status(200).json({
      status: "success",
      message: "Đã xác nhận, chờ Admin phê duyệt.",
    });
  }
});
exports.adminProcessRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { action, adminResponse, assignTeacherId } = req.body;

  const request = await ScheduleChangeRequest.findById(id)
    .populate("session")
    .populate("teacher", "profile.fullname");

  if (!request || request.status === "approved") {
    return next(new AppError("Yêu cầu không hợp lệ hoặc đã được xử lý", 400));
  }

  const io = req.app.get("socketio");

  if (action === "reject") {
    request.status = "rejected";
    request.adminResponse = adminResponse;
    request.processedBy = req.user.id;
    await request.save();

    await createSystemNotification({
      recipientId: request.teacher._id,
      title: "Admin từ chối yêu cầu",
      body: `Yêu cầu dạy thay của bạn bị từ chối. Lý do: ${adminResponse || "Không có"}`,
      linkId: request._id,
      io,
    });

    return res
      .status(200)
      .json({ status: "success", message: "Đã từ chối yêu cầu" });
  }

  if (action === "approve") {
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    try {
      const targetSession = request.session;

      let finalNewTeacherId = request.newTeacher;

      if (!finalNewTeacherId) {
        if (!assignTeacherId) {
          throw new AppError(
            "Vui lòng chọn giáo viên dạy thay để duyệt yêu cầu này",
            400
          );
        }
        finalNewTeacherId = assignTeacherId;
        request.newTeacher = finalNewTeacherId;
      }

      const teacherNew = await Teacher.findById(finalNewTeacherId);
      if (!teacherNew)
        throw new AppError("Giáo viên được chỉ định không tồn tại", 404);

      const course = await Course.findById(targetSession.course);

      if (!canTeachCourse(teacherNew, course)) {
        throw new AppError(
          `Giáo viên ${teacherNew.profile.fullname} không đủ kỹ năng dạy lớp này`,
          400
        );
      }

      const conflict = await checkConflict(
        targetSession._id,
        finalNewTeacherId,
        targetSession.room,
        targetSession.startAt,
        targetSession.endAt
      );
      if (conflict) throw conflict;

      await Session.findByIdAndUpdate(
        targetSession._id,
        { teacher: finalNewTeacherId },
        { session: dbSession }
      );

      request.status = "approved";
      request.adminResponse = adminResponse;
      request.processedBy = req.user.id;
      await request.save({ session: dbSession });

      await dbSession.commitTransaction();

      await createSystemNotification({
        recipientId: request.teacher._id,
        title: "Yêu cầu được duyệt",
        body: `Admin đã duyệt. GV ${teacherNew.profile.fullname} sẽ dạy thay cho bạn.`,
        linkId: request._id,
        io,
      });

      await createSystemNotification({
        recipientId: finalNewTeacherId,
        title: "Phân công dạy thay (Admin)",
        body: `Admin đã phân công bạn dạy thay lớp. Vui lòng kiểm tra lịch dạy.`,
        linkId: request._id,
        io,
      });

      return res.status(200).json({
        status: "success",
        message: "Đã duyệt và cập nhật lịch thành công",
      });
    } catch (err) {
      await dbSession.abortTransaction();
      return next(err);
    } finally {
      dbSession.endSession();
    }
  }
});
exports.getSubstituteSuggestions = catchAsync(async (req, res, next) => {
  const { sessionId } = req.query;
  const currentTeacherId = req.user.id;

  if (!sessionId) {
    return next(new AppError("Vui lòng cung cấp sessionId", 400));
  }

  const session = await Session.findById(sessionId).populate("course").lean();

  if (!session) {
    return next(new AppError("Không tìm thấy buổi học", 404));
  }

  const { startAt, endAt, course } = session;

  const allTeachers = await User.find({
    role: "teacher",
    _id: { $ne: currentTeacherId },
    active: true,
  }).lean();

  const suggestions = [];

  await Promise.all(
    allTeachers.map(async (teacher) => {
      if (!canTeachCourse(teacher, course)) {
        return;
      }

      const isBusy = await Session.exists({
        teacher: teacher._id,
        status: { $in: ["scheduled", "published"] },
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      });

      if (isBusy) {
        return;
      }

      suggestions.push({
        _id: teacher._id,
        fullname: teacher.profile.fullname,
        email: teacher.email,
        phoneNumber: teacher.profile.phoneNumber,
      });
    })
  );

  res.status(200).json({
    status: "success",
    results: suggestions.length,
    data: {
      suggestions,
    },
  });
});
exports.getOneRequest = catchAsync(async (req, res, next) => {
  const request = await ScheduleChangeRequest.findById(req.params.id)

    .populate("teacher", "profile.fullname email")
    .populate({
      path: "session",
      populate: [
        { path: "class", select: "name classCode" },
        { path: "room", select: "name" },
        { path: "course", select: "name level" },
      ],
    });

  if (!request) return next(new AppError("Không tìm thấy yêu cầu", 404));

  res.status(200).json({
    status: "success",
    data: { request },
  });
});

exports.cancelRequest = catchAsync(async (req, res, next) => {
  const requestId = req.params.id;
  const userId = req.user.id;

  const request = await ScheduleChangeRequest.findById(requestId);

  if (!request) {
    return next(new AppError("Không tìm thấy yêu cầu", 404));
  }

  if (request.teacher.toString() !== userId) {
    return next(new AppError("Bạn không có quyền hủy yêu cầu này", 403));
  }

  if (!["pending_teacher", "pending_admin"].includes(request.status)) {
    return next(
      new AppError(
        "Không thể hủy yêu cầu đã được duyệt hoặc đã bị từ chối",
        400
      )
    );
  }
  const oldStatus = request.status;
  request.status = "cancelled";
  await request.save();
  const io = req.app.get("socketio");

  if (request.newTeacher) {
    await createSystemNotification({
      recipientId: request.newTeacher,
      title: "Yêu cầu đã bị hủy",
      body: `Giáo viên ${req.user.profile.fullname} đã hủy yêu cầu dạy thay lớp này.`,
      linkId: request._id,
      io,
    });
  }

  if (oldStatus === "pending_admin") {
    await createSystemNotification({
      recipientGroup: "admin",
      title: "Yêu cầu đã bị hủy bởi giáo viên",
      body: `GV ${req.user.profile.fullname} đã tự hủy yêu cầu đổi lịch của mình. Bạn không cần duyệt nữa.`,
      linkId: request._id,
      io,
    });
  }

  res.status(200).json({
    status: "success",
    message: "Đã hủy yêu cầu thành công",
    data: { request },
  });
});
