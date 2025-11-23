const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },

  //đối tượng nhận
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  recipientGroup: { type: String, enum: ["member", "staff", "teacher"] }, //hoặc recipientId hoặc recipientGroup

  // loại + priority
  type: {
    type: String,
    enum: ["system", "transactional", "social", "promo", "reminder"],
    default: "system",
  },
  priority: { type: Number, default: 5 }, //1 - 10

  // trạng thái đọc
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },

  data: {
    linkId: mongoose.Schema.Types.ObjectId,
    linkModel: { type: String, default: "SubstituteRequest" },
  },
  // scheduling / timestamps
  scheduledAt: { type: Date, default: null }, //optional
  sentAt: { type: Date },

  // TTL / expiry cho loại tạm thời
  expireAt: { type: Date, default: null }, //optional

  createAt: {
    type: Date,
    default: Date.now(),
  },
});

notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

notificationSchema.index({ recipientId: 1, isRead: 1, "meta.createdAt": -1 });

const Notification = mongoose.model(
  "Notification",
  notificationSchema,
  "notifications"
);

module.exports = Notification;
