const Student = require("../models/studentModel");

exports.getAllRecentRegisteredStudent = async (startDate, endDate) => {
  try {
    const students = await Student.find({
      testResultAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }).select("testScore category");
    console.log(students[0]);
    return students;
  } catch (error) {
    console.error("❌ Lỗi khi lấy danh sách sinh viên:", error);
    throw error;
  }
};
