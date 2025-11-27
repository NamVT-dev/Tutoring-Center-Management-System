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
          "Bạn là người tư vấn cho trung tâm học thêm tiếng anh, hãy trả lời khách hàng về các thông tin trong hệ thống",
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
  for (const c of retrieved) {
    facts.push(
      `Class: ${c.name} (category: ${c.category}) — Level: ${c.level} — session: ${c.session}`
    );
  }
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
