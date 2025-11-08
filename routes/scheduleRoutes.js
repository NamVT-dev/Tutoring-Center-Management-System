const express = require("express");
const scheduleController = require("../controllers/scheduleController");
const authController = require("../controllers/authController");

const router = express.Router();

router.use(authController.protect, authController.restrictTo("admin"));

// --- API TÁC VỤ (JOB) ---
// Chạy thuật toán
router.post("/run", scheduleController.runScheduler);

// Lấy lịch sử các lần chạy
router.get("/jobs", scheduleController.getAllScheduleJobs);

// Lấy chi tiết 1 lần chạy (để xem GĐ 1, 2, 3...)
router.get("/jobs/:id", scheduleController.getScheduleJob);

// --- API BẢN NHÁP (DRAFT)---
// Chốt bản nháp (Tạo Class/Session thật)
router.post("/jobs/:id/finalize", scheduleController.finalizeSchedule);

//API KÉO THẢ CHỈNH SỬA CHO ADMIN
// router.post('/jobs/:id/validate-move', scheduleController.validateMove);

// --- API PHÂN TÍCH (ANALYTICS) ---
router.get("/analytics", scheduleController.getScheduleAnalytics);

// API kiểm tra trạng thái khóa
router.get("/status", scheduleController.getSchedulerStatus);

module.exports = router;
