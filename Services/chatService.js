const { HfInference } = require("@huggingface/inference");
const connectDb = require("../dbConfig");
const ChatAnalysis = require("../Models/ChatAnalysis");

const HF_MODEL_ID =
  process.env.HF_MODEL_ID ||
  "distilbert-base-uncased-finetuned-sst-2-english";
const HF_REPLY_MODEL_ID =
  process.env.HF_REPLY_MODEL_ID || "gpt2";
const HF_API_TOKEN = process.env.HF_API_TOKEN || "";

const hfClient = new HfInference(HF_API_TOKEN);

async function callHuggingFace(messages) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN environment variable is not configured");
  }

  const inputText = (messages || [])
    .map((m) => `${m.role || "user"}: ${m.content}`)
    .join("\n");

  const response = await hfClient.textClassification({
    model: HF_MODEL_ID,
    inputs: inputText,
  });

  return response;
}

async function generateReply(messages, analysis) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN environment variable is not configured");
  }

  const conversation = (messages || [])
    .map((m) => `${m.role || "user"}: ${m.content}`)
    .join("\n");

  const prompt = `
You are a kind, supportive mental health assistant.
The overall sentiment of the user's messages is: ${analysis.mentalState} (confidence: ${analysis.confidence.toFixed(
    2
  )}).

Conversation:
${conversation}

Write a short, empathetic reply that:
- acknowledges how they feel,
- offers gentle validation,
- suggests simple, non-clinical coping steps,
- encourages seeking professional help or trusted people if things feel overwhelming.

Assistant:`.trim();

  try {
    const result = await hfClient.textGeneration({
      model: HF_REPLY_MODEL_ID,
      inputs: prompt,
      parameters: {
        max_new_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        return_full_text: false,
      },
    });

    if (typeof result === "string") {
      return result.trim();
    }

    if (Array.isArray(result) && result.length > 0) {
      const first = result[0];
      if (first && typeof first.generated_text === "string") {
        return first.generated_text.trim();
      }
    }
  } catch (err) {
    console.error("HF reply generation failed:", err);
  }

  const tone =
    analysis.mentalState === "negative"
      ? "It sounds like you're going through a really difficult time."
      : analysis.mentalState === "positive"
      ? "It sounds like there are some positive things in how you're feeling."
      : "Thank you for sharing how you're feeling.";

  return `${tone} I'm just an AI and not a professional, but it may help to talk with someone you trust or a qualified mental health professional. If you ever feel in immediate danger, please contact your local emergency number or crisis helpline.`;
}

function mapToAnalysis(modelOutput) {
  let mentalState = "unknown";
  let confidence = 0;

  if (Array.isArray(modelOutput) && modelOutput.length > 0) {
    // cardiffnlp/twitter-roberta-base-sentiment-latest returns:
    // [ [ { label: 'negative', score: 0.1 }, { ... }, { ... } ] ]
    const first = modelOutput[0];
    const top = Array.isArray(first) && first.length > 0 ? first[0] : first;

    if (top && typeof top.label === "string") {
      mentalState = top.label;
      confidence = typeof top.score === "number" ? top.score : 0;
    }
  }

  return {
    mentalState,
    confidence,
    rawModelOutput: modelOutput,
  };
}

async function analyzeChat(payload) {
  const { userId, userDetails, messages } = payload;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  await connectDb();

  const modelOutput = await callHuggingFace(messages);
  const analysis = mapToAnalysis(modelOutput);

  const aiResponseText = await generateReply(messages, analysis);

  await ChatAnalysis.create({
    userId: userId ? String(userId) : undefined,
    userDetails: userDetails || {},
    messages,
    aiResponse: aiResponseText,
    mentalState: analysis.mentalState,
    confidence: analysis.confidence,
    rawModelOutput: analysis.rawModelOutput,
  });

  return {
    aiResponse: aiResponseText,
    analysis,
  };
}

module.exports = {
  analyzeChat,
};

