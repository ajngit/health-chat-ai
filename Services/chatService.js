const { HfInference } = require("@huggingface/inference");
const connectDb = require("../dbConfig");
const ChatAnalysis = require("../Models/ChatAnalysis");

const HF_MODEL_ID =
  process.env.HF_MODEL_ID ||
  "distilbert-base-uncased-finetuned-sst-2-english";
const HF_REPLY_MODEL_ID =
  process.env.HF_REPLY_MODEL_ID || "Qwen/Qwen2.5-7B-Instruct";
const HF_API_TOKEN = process.env.HF_API_TOKEN || "";

const hfClient = new HfInference(HF_API_TOKEN);

const CHAT_MODEL_CANDIDATES = [
  HF_REPLY_MODEL_ID,
  "Qwen/Qwen2.5-7B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
  "HuggingFaceH4/zephyr-7b-beta",
];

const TEXT_MODEL_CANDIDATES = [
  HF_REPLY_MODEL_ID,
  "google/flan-t5-large",
  "Qwen/Qwen2.5-7B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
];

function uniqueModels(models) {
  return [...new Set((models || []).filter(Boolean))];
}

function normalizeMentalState(label) {
  if (!label || typeof label !== "string") return "unknown";

  const normalized = label.toLowerCase();

  if (normalized.includes("negative") || normalized === "label_0") {
    return "negative";
  }

  if (normalized.includes("neutral") || normalized === "label_1") {
    return "neutral";
  }

  if (normalized.includes("positive") || normalized === "label_2") {
    return "positive";
  }

  return normalized;
}

function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === "user") {
      return messages[i].content || "";
    }
  }
  return "";
}

function getLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === "assistant") {
      return messages[i].content || "";
    }
  }
  return "";
}

function avoidExactRepeat(candidate, previousAssistantMessage) {
  if (!candidate) return candidate;
  if (!previousAssistantMessage) return candidate;

  const a = candidate.trim();
  const b = previousAssistantMessage.trim();

  if (a && b && a === b) {
    return `${a}\n\nI want to understand this better. Can you share what feels hardest right now?`;
  }

  return candidate;
}

function buildFallbackReply(messages, analysis) {
  const lastUserMessage = getLastUserMessage(messages);
  const intros = {
    negative: "That sounds really painful, and it makes sense to feel hurt.",
    positive: "I'm glad you shared that positive shift.",
    neutral: "Thanks for sharing that with me.",
    unknown: "Thanks for sharing how you're feeling.",
  };

  const intro = intros[analysis.mentalState] || intros.unknown;
  const reflection = lastUserMessage
    ? `You said: "${lastUserMessage.slice(0, 160)}".`
    : "";

  return `${intro} ${reflection} If you want, we can unpack this step by step: what happened, what hurt most, and what support would help tonight.`.trim();
}

async function callHuggingFace(messages) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN environment variable is not configured");
  }

  const inputText = (messages || [])
    .map((m) => `${m.role || "user"}: ${m.content}`)
    .join("\n");

  return hfClient.textClassification({
    model: HF_MODEL_ID,
    inputs: inputText,
  });
}

async function tryChatCompletion(models, systemInstruction, safeMessages) {
  if (typeof hfClient.chatCompletion !== "function") {
    return null;
  }

  for (const model of uniqueModels(models)) {
    try {
      const result = await hfClient.chatCompletion({
        model,
        messages: [{ role: "system", content: systemInstruction }, ...safeMessages],
        max_tokens: 220,
        temperature: 0.85,
      });

      const text = result?.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) {
        return { text: text.trim(), source: `chat:${model}` };
      }
    } catch (err) {
      console.error(`HF chat completion failed for ${model}:`, err.message || err);
    }
  }

  return null;
}

async function tryTextGeneration(models, prompt) {
  for (const model of uniqueModels(models)) {
    try {
      const result = await hfClient.textGeneration({
        model,
        inputs: prompt,
        parameters: {
          max_new_tokens: 220,
          temperature: 0.85,
          top_p: 0.92,
          repetition_penalty: 1.2,
          do_sample: true,
          return_full_text: false,
        },
      });

      if (result && typeof result.generated_text === "string" && result.generated_text.trim()) {
        return { text: result.generated_text.trim(), source: `text:${model}` };
      }

      if (typeof result === "string" && result.trim()) {
        return { text: result.trim(), source: `text:${model}` };
      }

      if (Array.isArray(result) && result.length > 0) {
        const first = result[0];
        if (first && typeof first.generated_text === "string" && first.generated_text.trim()) {
          return { text: first.generated_text.trim(), source: `text:${model}` };
        }
      }
    } catch (err) {
      console.error(`HF text generation failed for ${model}:`, err.message || err);
    }
  }

  return null;
}

async function generateReply(messages, analysis) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN environment variable is not configured");
  }

  const safeMessages = (messages || []).slice(-10).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content || "",
  }));

  const systemInstruction = `You are a kind, supportive mental health assistant. Sentiment signal: ${analysis.mentalState} (${analysis.confidence.toFixed(
    2
  )}). Be natural, specific to the user's latest message, and avoid repetitive wording.`;

  const chatResult = await tryChatCompletion(
    CHAT_MODEL_CANDIDATES,
    systemInstruction,
    safeMessages
  );

  const conversation = safeMessages
    .map((m) => `${m.role || "user"}: ${m.content}`)
    .join("\n");

  const prompt = `
${systemInstruction}

Conversation:
${conversation}

Respond with one empathetic paragraph plus one practical next step.`.trim();

  const textResult = chatResult || (await tryTextGeneration(TEXT_MODEL_CANDIDATES, prompt));

  const previousAssistantMessage = getLastAssistantMessage(messages);

  if (textResult?.text) {
    return avoidExactRepeat(textResult.text, previousAssistantMessage);
  }

  return avoidExactRepeat(
    buildFallbackReply(messages, analysis),
    previousAssistantMessage
  );
}

function mapToAnalysis(modelOutput) {
  let mentalState = "unknown";
  let confidence = 0;

  if (Array.isArray(modelOutput) && modelOutput.length > 0) {
    const first = modelOutput[0];
    const top = Array.isArray(first) && first.length > 0 ? first[0] : first;

    if (top && typeof top.label === "string") {
      mentalState = normalizeMentalState(top.label);
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
  const { sessionId, userId, userDetails, messages } = payload;

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  await connectDb();

  const modelOutput = await callHuggingFace(messages);
  const analysis = mapToAnalysis(modelOutput);
  const aiResponseText = await generateReply(messages, analysis);

  const chatAnalysis = await ChatAnalysis.findOneAndUpdate(
    { sessionId: String(sessionId) },
    {
      $set: {
        userId: userId ? String(userId) : undefined,
        userDetails: userDetails || {},
        messages,
        aiResponse: aiResponseText,
        mentalState: analysis.mentalState,
        confidence: analysis.confidence,
        rawModelOutput: analysis.rawModelOutput,
      },
    },
    { upsert: true, new: true }
  );

  return {
    sessionId: chatAnalysis.sessionId,
    aiResponse: aiResponseText,
    analysis,
  };
}

module.exports = {
  analyzeChat,
};
