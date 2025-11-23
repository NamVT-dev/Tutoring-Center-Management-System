const cron = require("node-cron");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const Email = require("./email");
const { Member } = require("../models/userModel");
const Student = require("../models/studentModel");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const mongoose = require("mongoose");
const Enrollment = require("../models/enrollmentModel");
const Class = require("../models/classModel");
const { notifyHoldCanceled } = require("../utils/notification");
const Attendance = require("../models/attendanceModel");
const Session = require("../models/sessionModel");
const autoProcessRequestsJob = require("./requestCleanup");

const csvFilePath = path.join(__dirname, "..", "public", "results.csv");

const cronJob = () => {
  cron.schedule(
    "0 0 8 * * *",
    () => {
      console.log(
        "📅 Cron bắt đầu kiểm tra kết quả:",
        new Date().toLocaleString()
      );

      const testedStudents = [];

      fs.createReadStream(csvFilePath, "utf-8")
        .pipe(csv({ separator: ",", skipLines: 0, strict: false }))
        .on("data", (row) => {
          if (row.status === "tested" && row.score) {
            testedStudents.push(row);
          }
        })
        .on("end", async () => {
          console.log(
            "✅ Đã đọc file CSV, tìm thấy:",
            testedStudents.length,
            "học sinh có kết quả."
          );

          for (const studentResult of testedStudents) {
            try {
              const student = await Student.findById(studentResult.studentId);
              student.testScore = studentResult.score;
              student.testResultAt = Date.now();
              student.tested = true;
              student.save({ validateBeforeSave: false });

              await updateCSVStatus(studentResult.testId);

              const user = await Member.findOne({
                student: studentResult.studentId,
              });

              await new Email(user, {
                studentName: studentResult.name,
                category: studentResult.category,
                score: studentResult.score,
              }).sendTestResult();
            } catch (err) {
              console.error(
                "Lỗi khi gửi mail cho",
                studentResult.name,
                err.message
              );
            }
          }

          console.log("🎉 Cron job hoàn tất.");
        });
    },
    {
      timezone: "Asia/Ho_Chi_Minh",
    }
  );

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
        .filter((std) => std !== null);
      await Promise.all(
        absentStudents.map((s) => sendEmailToAbsentStudent(s, session))
      );
    }
  });
};

async function updateCSVStatus(testId) {
  const rows = [];
  const fileData = fs.createReadStream(csvFilePath).pipe(csv());

  for await (const row of fileData) {
    if (row.testId === testId) row.status = "notified";
    rows.push(row);
  }

  const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: Object.keys(rows[0]).map((key) => ({ id: key, title: key })),
  });

  await csvWriter.writeRecords(rows);
}

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
