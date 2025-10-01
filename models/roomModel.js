const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    require: true,
    unique: true,
  },
  capacity: Number,
  status: String,
});
const Room = mongoose.model("Room", roomSchema, "rooms");

module.exports = Room;
