const Center = require("../models/centerModel");
const Course = require("../models/courseModel");
const Room = require("../models/roomModel");
const { Teacher } = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const { client } = require("../utils/openAi");
const { getAllRecentRegisteredStudent } = require("./studentController");

exports.makeScheduleByAi = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.body;
  const fact = await buildFact(startDate, endDate);
  const schedule = await generateClassSchedule(fact);
  res.status(201).json({
    data: schedule,
  });
});

const buildFact = async (startDate, endDate) => {
  const teachers = await Teacher.find({ active: true }).select(
    "profile.fullname level availability maxHoursPerDay maxHoursPerWeek teachCategories"
  );
  const students = await getAllRecentRegisteredStudent(startDate, endDate);
  const rooms = await Room.find({ status: "active" }).select("capacity");
  const center = await Center.findOne().select(
    "activeDaysOfWeek dayShifts shifts"
  );
  const courses = await Course.find().select(
    "name level category session durationInMinutes"
  );
  return { teachers, students, rooms, center, courses };
};

async function generateClassSchedule(centerData) {
  const prompt = `
  Bạn là hệ thống lập lịch cho trung tâm ngoại ngữ.
  Dựa vào thông tin dưới đây, hãy tạo thời khoá biểu chi tiết cho kỳ học.

  Thông tin:
  ${JSON.stringify(centerData, null, 2)}

  Quy tắc:
  - Ngày trong tuần được thể hiện dưới dạng số với 0 là Chủ nhật tới 6 là Thứ 7
  - Thời gian trong ngày được thể hiện dưới dạng phút VD: 480 tương đương với 8h sáng
  - Mỗi lớp gồm học viên có trình độ tương đương và phù hợp với số lượng mỗi khóa học có thể có.
  - Lớp học được sắp vào phòng học có thể chứa được số học viên tương ứng.
  - Phải khớp thời gian rảnh của giáo viên.
  - Giáo viên có thể nhận nhiều lớp nhưng thời gian dạy học không được quá thời gian có thể dạy.
  - Level của giáo viên phải khớp với trình độ lớp dạy. Junior chỉ được dạy lớp IELTS 6.5 trở xuống hoặc TOEIC 650 trở xuống. Senior được dạy mọi lớp.
  - Giáo viên chỉ được dạy lớp phù hợp với category của giáo viên.
  - Có thể có những course không có lớp nếu không đủ học sinh.
  - Đảm bảo lớp nào cũng có ít nhất 15 học sinh.
  - Mỗi học sinh chỉ được xếp vào **một lớp duy nhất trong toàn bộ kỳ học**.
  - Không được có học sinh xuất hiện trong nhiều lớp khác nhau.
  - Học sinh chỉ được xếp vào lớp có **category trùng khớp với category mà học sinh đã đăng ký**.
  - Nếu không có lớp phù hợp với category hoặc level của học sinh, không xếp học sinh đó.
  - Không tự tạo ObjectId mới; chỉ dùng ObjectId được cung cấp trong dữ liệu đầu vào.
  - Nếu không thể tạo lịch hợp lệ (VD: không đủ học viên cho một lớp, thiếu phòng, hoặc category không khớp), hãy trả về JSON ở dạng:
    { "error": "Mô tả lý do không thể tạo lịch" }
  - Kết quả trả về ở dạng JSON:
  [
    {
      "name": String,
      "course": ObjectId,
      "progress": String,
      "weeklySchedule": {
        "dayOfWeek": Number,
        "startMinute": Number,
        "endMinute": Number,
      },
      "room": ObjectId,
      "teacher": ObjectId,
      "students": [ObjectId],
    }
  ]
  `;

  const res = await client.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  console.log(res);

  return res.choices[0].message.content;
}
