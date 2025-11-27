const Center = require("../models/centerModel");
const catchAsync = require("../utils/catchAsync");

exports.embeddingAllRequireData = catchAsync(async (req, res) => {
  const center = await Center.find();
  center.forEach(async(c) => {
    const textToEmbed = `Center schedule: ${c.activeDaysOfWeek.join(", ")} (with 0 for Sunday ... 6 for Saturday). Category: ${}. Level: ${this.level}. Price: ${this.price}. Duration In Minutes: ${this.durationInMinutes}`;
      this.embedding = await embedText(textToEmbed);
  });
});
