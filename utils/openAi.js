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
          "You are a assistant in a English Tutor Center, please help and guide user with given data in Vietnamese \n" +
          "Notice: - S1 shift start at 08:00 \n" +
          "- The user is not familiar with technical or specialized terminology. Explain things using simple, clear, everyday language.",
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
  const { center, course, teacher } = retrieved;
  center.forEach((c) => facts.push(this.generateCenterConfigEmbedding(c)));
  course.forEach((c) => facts.push(this.generateCourseEmbeddingText(c)));
  teacher.forEach((t) => facts.push(this.generateTeacherEmbeddingText(t)));
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

exports.generateTeacherEmbeddingText = (teacher) => {
  if (!teacher) return "";

  const name = teacher.profile?.fullname || "";
  const overallLevel = teacher.level || "";
  const description = teacher.description || "";

  // Count number of classes taught
  const classCount = Array.isArray(teacher.class) ? teacher.class.length : 0;

  // Teaching Skills
  const skillsText = (teacher.skills || [])
    .map((s) => {
      const cat = s.category?.toString() || "";
      const levels = s.levels?.join(", ") || "";
      const includeLower = s.includeLowerLevels ? "yes" : "no";

      return `Category: ${cat}; Levels: ${levels}; Includes lower levels: ${includeLower}`;
    })
    .join(" | ");

  // Teach categories if available
  const teachCategories = (teacher.teachCategories || [])
    .map((c) => c.toString())
    .join(", ");

  return (
    `Teacher Name: ${name}\n` +
    `Overall Level: ${overallLevel}\n\n` +
    `Teaching Description:\n${description}\n\n` +
    `Teaching Skills:\n${skillsText || "None"}\n\n` +
    `Teaching Experience:\n` +
    `- Number of classes taught: ${classCount}\n\n` +
    `Specialization:\n` +
    `${description}\n\n` +
    `Teach Categories:\n${teachCategories || "None"}`
  );
};
