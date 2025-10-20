const cron = require("node-cron");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const Email = require("./email");
const { Member } = require("../models/userModel");
const Student = require("../models/studentModel");

const csvFilePath = path.join(__dirname, "..", "public", "results.csv");

const cronJob = () => {
  cron.schedule(
    "* * 8 * * *",
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
              student.score = studentResult.score;
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
};

async function updateCSVStatus(testId) {
  const rows = [];
  const fileData = fs.createReadStream(csvFilePath).pipe(csv());

  for await (const row of fileData) {
    if (row.testId === testId) row.status = "notified";
    rows.push(row);
  }

  // Ghi đè lại file CSV
  const header = Object.keys(rows[0]).join(",") + "\n";
  const body = rows.map((r) => Object.values(r).join(",")).join("\n");

  fs.writeFileSync(csvFilePath, header + body);
}

module.exports = cronJob;
