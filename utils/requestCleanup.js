const cron = require("node-cron");
const mongoose = require("mongoose");
const ScheduleChangeRequest = require("../models/substituteRequestModel");
const Session = require("../models/sessionModel");
const moment = require("moment-timezone");
const { createSystemNotification } = require("../utils/notification");

const HOURS_AUTO_REJECT = 12;
const HOURS_AUTO_APPROVE = 6;

const autoProcessRequestsJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const now = new Date();

      const rejectDeadline = moment(now)
        .add(HOURS_AUTO_REJECT, "hours")
        .toDate();
      const approveDeadline = moment(now)
        .add(HOURS_AUTO_APPROVE, "hours")
        .toDate();

      const expiredTeacherRequests = await ScheduleChangeRequest.aggregate([
        { $match: { status: "pending_teacher" } },
        {
          $lookup: {
            from: "sessions",
            localField: "session",
            foreignField: "_id",
            as: "sessionInfo",
          },
        },
        { $unwind: "$sessionInfo" },
        {
          $match: {
            "sessionInfo.startAt": { $lt: rejectDeadline },
            "sessionInfo.status": { $in: ["scheduled", "published"] },
          },
        },
      ]).session(session);

      if (expiredTeacherRequests.length > 0) {
        const ids = expiredTeacherRequests.map((r) => r._id);

        await ScheduleChangeRequest.updateMany(
          { _id: { $in: ids } },
          {
            $set: {
              status: "rejected",
              adminResponse:
                "Hệ thống tự động hủy do Giáo viên được mời không phản hồi kịp thời gian.",
            },
          },
          { session }
        );
      }

      const requestsToAutoApprove = await ScheduleChangeRequest.find({
        status: "pending_admin",
      })
        .populate("session")
        .session(session);

      const approvedRequests = [];

      for (const req of requestsToAutoApprove) {
        if (req.session && req.session.startAt < approveDeadline) {
          if (req.newTeacher) {
            await Session.findByIdAndUpdate(
              req.session._id,
              { teacher: req.newTeacher },
              { session }
            );
          }

          req.status = "approved";
          req.adminResponse =
            "Hệ thống TỰ ĐỘNG DUYỆT do sát giờ học (Admin timeout).";
          req.processedBy = null;
          await req.save({ session });

          approvedRequests.push(req);
        }
      }

      if (approvedRequests.length > 0) {
        console.log(
          `>> Auto-approved ${approvedRequests.length} requests (Admin timeout).`
        );
      }
      await session.commitTransaction();

      let io;
      try {
        io = require("../app").get("socketio");
      } catch (e) {
        console.warn("⚠️ Warning: Socket.IO not available for Cron Job.");
      }

      for (const req of expiredTeacherRequests) {
        await createSystemNotification({
          recipientId: req.teacher,
          title: "Yêu cầu bị hủy tự động",
          body: `Yêu cầu dạy thay cho lớp lúc ${moment(req.sessionInfo.startAt).format("HH:mm DD/MM")} đã bị hủy do GV được mời không trả lời kịp.`,
          linkId: req._id,
          io,
        });
      }

      for (const req of approvedRequests) {
        await createSystemNotification({
          recipientId: req.teacher,
          title: "Yêu cầu được duyệt tự động",
          body: `Hệ thống đã tự động duyệt yêu cầu dạy thay của bạn để đảm bảo lớp học diễn ra.`,
          linkId: req._id,
          io,
        });

        if (req.newTeacher) {
          await createSystemNotification({
            recipientId: req.newTeacher,
            title: "Lịch dạy đã xác nhận (Tự động)",
            body: `Hệ thống đã chốt lịch dạy thay lớp ${req.session.class}. Vui lòng chuẩn bị lên lớp.`,
            linkId: req._id,
            io,
          });
        }
      }
    } catch (err) {
      await session.abortTransaction();
      console.error("❌ Auto-process Job Error:", err);
    } finally {
      session.endSession();
    }
  });
};

module.exports = autoProcessRequestsJob;
