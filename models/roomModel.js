const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  capacity: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ["active", "maintenance", "closed"],
    default: "active",
    index: true,
  },
}, {timestamps:true});
roomSchema.index({ capacity: 1, status: 1 });
const Room = mongoose.model("Room", roomSchema, "rooms");

module.exports = Room;
