const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.embedText = async (text) => {
  const results = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });
  return results.data[0].embedding;
};

exports.aiResponse = async (question, fact) => {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Bạn là người tư vấn cho trung tâm học thêm tiếng anh, hãy trả lời khách hàng về các thông tin trong hệ thống đã được cung cấp. Hãy trả lời câu hỏi bằng tiếng Việt",
      },
      {
        role: "assistant",
        content: fact,
      },
      {
        role: "user",
        content: question,
      },
    ],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
};

exports.buildFacts = (retrieved) => {
  const facts = [];
  const { center, course } = retrieved;
  center.forEach((c) => facts.push(this.generateCenterConfigEmbedding(c)));
  course.forEach((c) => facts.push(this.generateCourseEmbeddingText(c)));
  return facts.join("\n");
};

exports.aiTranslate = async (userQuestion) => {
  const result = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    tools: [
      {
        type: "function",
        function: {
          name: "translate",
          parameters: {
            type: "object",
            properties: {
              english: { type: "string" },
            },
            required: ["english"],
          },
        },
      },
    ],
    messages: [
      {
        role: "system",
        content: "Translate to English ONLY. Preserve meaning 100%.",
      },
      {
        role: "user",
        content: userQuestion,
      },
    ],
  });

  return JSON.parse(result.choices[0].message.tool_calls[0].function.arguments)
    .english;
};

exports.generateCenterConfigEmbedding = (c) => {
  const shiftDefinitions = c.shifts
    .map(
      (s) =>
        `${s.name}: ${s.startMinute} -> ${s.endMinute} (minutes from midnight)`
    )
    .join("; ");

  const dayShiftText = c.dayShifts
    .map((d) => `Day ${d.dayOfWeek}: ${d.shifts.join(", ")}`)
    .join(" | ");

  const textToEmbed = `
Schedule Key: ${c.key}.
Timezone: ${c.timezone}.
Scheduling Enabled: ${c.isScheduling}.
Availability Open: ${c.isAvailabilityOpen}.

Active Days of Week: ${c.activeDaysOfWeek.join(", ")}.

Shift Definitions: ${shiftDefinitions}.

Daily Shift Assignments: ${dayShiftText}.
  `.trim();

  return textToEmbed;
};

exports.generateCourseEmbeddingText = (course) => {
  const text = `
Course Name: ${course.name}.
Description: ${course.description}.
Category: ${course.category?.name || "Unknown"}.
Level: ${course.level}.
Price: ${course.price}.
Total Sessions: ${course.session}.
Duration Per Session: ${course.durationInMinutes} minutes.
Sessions Per Week: ${course.sessionsPerWeek}.
Minimum Students: ${course.minStudent}.
Maximum Students: ${course.maxStudent}.
Input Score Range: ${course.inputMinScore} to ${course.inputMaxScore}.
  `.trim();

  return text;
};
