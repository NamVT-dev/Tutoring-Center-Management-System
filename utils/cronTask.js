const cron = require("node-cron");
const Email = require("./email");
const Student = require("../models/studentModel");
const mongoose = require("mongoose");
const Enrollment = require("../models/enrollmentModel");
const Class = require("../models/classModel");
const { notifyHoldCanceled } = require("../utils/notification");
const Attendance = require("../models/attendanceModel");
const Session = require("../models/sessionModel");
const autoProcessRequestsJob = require("./requestCleanup");

const cronJob = () => {
  //mail báo vắng mặt điểm danh
  cron.schedule("0 0 0 * * *", async () => {
    console.log("📅 Cron bắt đầu khóa điểm danh:", new Date().toLocaleString());
    const attendances = await Attendance.find({
      status: "in-progress",
    });
    for (let i = 0; i < attendances.length; i++) {
      attendances[i].status = "closed";
      attendances[i].save({ validateBeforeSave: false });
      const session = await Session.findById(attendances[i].session).populate(
        "class"
      );
      const absentStudents = attendances[i].attendance
        .map((att) => {
          if (att.status === "absent") return att.student.id;
          return null;
        })
        .filter((std) => !!std);
      await Promise.all(
        absentStudents.map((s) => sendEmailToAbsentStudent(s, session))
      );
    }
  });
};

async function sendEmailToAbsentStudent(studentId, session) {
  const student = await Student.findById(studentId).populate("user");
  try {
    const formattedDate = session.startAt.toLocaleString("vi-VN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    });

    await new Email(student.user, {
      studentName: student.name,
      className: session.class.name,
      date: formattedDate,
    }).sendAbsent();
  } catch (error) {
    console.log("Có lỗi khi gửi mail!", error.message);
  }
}

const autoCancelHoldJob = () => {
  cron.schedule(
    "* * * * *",
    async () => {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const expiredHolds = await Enrollment.find({
          status: "hold",
          holdExpiresAt: { $lt: new Date() },
        }).session(session);

        if (expiredHolds.length === 0) {
          await session.abortTransaction();
          session.endSession();
          console.log("⏰ Cron (Holds): Không có chỗ hết hạn.");
          return;
        }

        console.log(
          `⏰ Cron (Holds): Tìm thấy ${expiredHolds.length} chỗ hết hạn.`
        );

        const classIdsToUpdate = {};
        const enrollmentIdsToCancel = [];

        for (const hold of expiredHolds) {
          enrollmentIdsToCancel.push(hold._id);
          const classIdStr = hold.class.toString();
          if (!classIdsToUpdate[classIdStr]) {
            classIdsToUpdate[classIdStr] = 0;
          }
          classIdsToUpdate[classIdStr] -= 1;
        }

        await Enrollment.updateMany(
          { _id: { $in: enrollmentIdsToCancel } },
          { $set: { status: "canceled", cancelReason: "Hold expired" } },
          { session: session }
        );

        const bulkOps = Object.keys(classIdsToUpdate).map((classId) => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(classId) },
            update: { $inc: { reservedCount: classIdsToUpdate[classId] } },
          },
        }));

        if (bulkOps.length > 0) {
          await Class.bulkWrite(bulkOps, { session: session });
        }

        await session.commitTransaction();

        for (const hold of expiredHolds) {
          notifyHoldCanceled(hold.student, hold);
        }
      } catch (err) {
        await session.abortTransaction();
        console.error("⏰ Lỗi Cron (Holds):", err.message);
      } finally {
        session.endSession();
      }
    },
    {
      timezone: "Asia/Ho_Chi_Minh",
    }
  );
};
module.exports = () => {
  cronJob();
  autoCancelHoldJob();
  autoProcessRequestsJob();
};
