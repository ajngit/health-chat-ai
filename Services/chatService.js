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

const EMOTION_KEYWORDS = {
  sadness: [
    "sad",
    "down",
    "cry",
    "depressed",
    "empty",
    "lonely",
    "rejected",
    "heartbroken",
    "hurt",
    "grief",
  ],
  anxiety: [
    "anxious",
    "anxiety",
    "worried",
    "panic",
    "fear",
    "afraid",
    "nervous",
    "stress",
    "overthinking",
    "restless",
  ],
  anger: ["angry", "mad", "frustrated", "annoyed", "hate", "upset", "furious"],
  hopelessness: [
    "hopeless",
    "worthless",
    "tired of life",
    "give up",
    "can't do this",
    "done with everything",
  ],
  guilt: ["guilty", "my fault", "blame myself", "ashamed", "embarrassed", "regret"],
  overwhelm: [
    "overwhelmed",
    "too much",
    "exhausted",
    "burned out",
    "drained",
    "pressure",
  ],
  relief: ["better", "relieved", "calm", "okay now", "peaceful", "lighter"],
  hope: ["hope", "improving", "healing", "trying", "recover", "stronger"],
};

const RISK_PATTERNS = [
  "suicide",
  "kill myself",
  "end my life",
  "don't want to live",
  "self harm",
  "hurt myself",
];

const MAX_CLASSIFIER_CHARS = 1200;
const MAX_CLASSIFIER_MESSAGES = 6;

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundScore(value) {
  return Math.round(clamp(value, 0, 1) * 100);
}

function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === "user") {
      return messages[i].content || "";
    }
  }
  return "";
}

function getUserText(messages) {
  return (messages || [])
    .filter((message) => message && message.role === "user" && message.content)
    .map((message) => message.content)
    .join(" ");
}

function buildClassifierInput(messages) {
  const recentMessages = (messages || []).slice(-MAX_CLASSIFIER_MESSAGES);
  const inputText = recentMessages
    .map((message) => `${message.role || "user"}: ${message.content || ""}`)
    .join("\n")
    .trim();

  if (inputText.length <= MAX_CLASSIFIER_CHARS) {
    return inputText;
  }

  return inputText.slice(inputText.length - MAX_CLASSIFIER_CHARS);
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

function scoreEmotionFromText(text, keywords, baseScore = 0, perHit = 0.18) {
  const lowerText = text.toLowerCase();
  const hits = keywords.reduce((count, keyword) => {
    return count + (lowerText.includes(keyword) ? 1 : 0);
  }, 0);

  return clamp(baseScore + hits * perHit, 0, 1);
}

function deriveEmotionAnalysis(messages, sentimentAnalysis) {
  const text = getUserText(messages);
  const primarySentiment = sentimentAnalysis.mentalState;
  const sentimentConfidence = sentimentAnalysis.confidence || 0;
  const positiveEmotions = ["relief", "hope"];
  const negativeEmotions = [
    "sadness",
    "anxiety",
    "anger",
    "hopelessness",
    "guilt",
    "overwhelm",
  ];

  const emotionScores = Object.entries(EMOTION_KEYWORDS).map(([emotion, keywords]) => {
    let score = scoreEmotionFromText(text, keywords);

    if (
      primarySentiment === "negative" &&
      negativeEmotions.includes(emotion)
    ) {
      score = clamp(score + sentimentConfidence * 0.22, 0, 1);
    }

    if (
      primarySentiment === "positive" &&
      positiveEmotions.includes(emotion)
    ) {
      score = clamp(score + sentimentConfidence * 0.3, 0, 1);
    }

    if (primarySentiment === "neutral" && emotion === "overwhelm") {
      score = clamp(score * 0.8, 0, 1);
    }

    if (primarySentiment === "positive" && negativeEmotions.includes(emotion)) {
      score = clamp(score * 0.35, 0, 1);
    }

    if (primarySentiment === "negative" && positiveEmotions.includes(emotion)) {
      score = clamp(score * 0.45, 0, 1);
    }

    return {
      emotion,
      score: roundScore(score),
    };
  });

  if (primarySentiment === "positive" && emotionScores.every((entry) => entry.score < 20)) {
    emotionScores.forEach((entry) => {
      if (entry.emotion === "hope") entry.score = roundScore(0.55 + sentimentConfidence * 0.2);
      if (entry.emotion === "relief") entry.score = roundScore(0.45 + sentimentConfidence * 0.2);
    });
  }

  if (primarySentiment === "negative" && emotionScores.every((entry) => entry.score < 20)) {
    emotionScores.forEach((entry) => {
      if (entry.emotion === "sadness") entry.score = roundScore(0.45 + sentimentConfidence * 0.2);
      if (entry.emotion === "anxiety") entry.score = roundScore(0.35 + sentimentConfidence * 0.18);
    });
  }

  emotionScores.sort((a, b) => b.score - a.score);
  const dominantEmotion = emotionScores[0]?.score >= 20 ? emotionScores[0].emotion : "unclear";

  return {
    dominantEmotion,
    emotions: emotionScores.filter((entry) => entry.score >= 12).slice(0, 4),
  };
}

function deriveIndexes(messages, sentimentAnalysis, emotionAnalysis) {
  const text = getUserText(messages).toLowerCase();
  const negativeBias = sentimentAnalysis.mentalState === "negative"
    ? sentimentAnalysis.confidence * 100
    : 0;
  const positiveBias = sentimentAnalysis.mentalState === "positive"
    ? sentimentAnalysis.confidence * 100
    : 0;
  const sadnessScore =
    emotionAnalysis.emotions.find((entry) => entry.emotion === "sadness")?.score || 0;
  const anxietyScore =
    emotionAnalysis.emotions.find((entry) => entry.emotion === "anxiety")?.score || 0;
  const hopelessnessScore =
    emotionAnalysis.emotions.find((entry) => entry.emotion === "hopelessness")?.score || 0;
  const hopeScore =
    emotionAnalysis.emotions.find((entry) => entry.emotion === "hope")?.score || 0;
  const reliefScore =
    emotionAnalysis.emotions.find((entry) => entry.emotion === "relief")?.score || 0;
  const riskHits = RISK_PATTERNS.reduce((count, phrase) => count + (text.includes(phrase) ? 1 : 0), 0);

  const distressIndex = clamp(
    Math.round(negativeBias * 0.5 + sadnessScore * 0.25 + anxietyScore * 0.25),
    0,
    100
  );
  const supportNeedIndex = clamp(
    Math.round(distressIndex * 0.55 + hopelessnessScore * 0.3 + riskHits * 18),
    0,
    100
  );
  const resilienceIndex = clamp(
    Math.round(25 + positiveBias * 0.45 + hopeScore * 0.35 + reliefScore * 0.2 - distressIndex * 0.15),
    0,
    100
  );
  const riskIndex = clamp(
    Math.round(hopelessnessScore * 0.4 + distressIndex * 0.25 + supportNeedIndex * 0.2 + riskHits * 25),
    0,
    100
  );

  return {
    distressIndex,
    supportNeedIndex,
    resilienceIndex,
    riskIndex,
  };
}

function buildAnalysisSummary(sentimentAnalysis, emotionAnalysis, indexes) {
  const emotionPart = emotionAnalysis.emotions.length
    ? emotionAnalysis.emotions
        .map((entry) => `${entry.emotion} ${entry.score}/100`)
        .join(", ")
    : "no strong emotion signal";

  return [
    `Mental State: ${sentimentAnalysis.mentalState} (${roundScore(sentimentAnalysis.confidence)}/100)`,
    `Dominant Emotion: ${emotionAnalysis.dominantEmotion}`,
    `Emotion Scores: ${emotionPart}`,
    `Indexes: distress ${indexes.distressIndex}/100, support need ${indexes.supportNeedIndex}/100, resilience ${indexes.resilienceIndex}/100, risk ${indexes.riskIndex}/100`,
  ].join("\n");
}

function buildFallbackReply(messages, sentimentAnalysis, emotionAnalysis, indexes) {
  const lastUserMessage = getLastUserMessage(messages);
  const intros = {
    negative: "That sounds really painful, and it makes sense to feel hurt.",
    positive: "I'm glad you shared that positive shift.",
    neutral: "Thanks for sharing that with me.",
    unknown: "Thanks for sharing how you're feeling.",
  };

  const intro = intros[sentimentAnalysis.mentalState] || intros.unknown;
  const reflection = lastUserMessage
    ? `You said: "${lastUserMessage.slice(0, 160)}".`
    : "";
  const analysisSummary = buildAnalysisSummary(
    sentimentAnalysis,
    emotionAnalysis,
    indexes
  );
  const supportFocus =
    indexes.riskIndex >= 70
      ? "This looks like a high-risk mental health signal. Please reach out to a trusted person or emergency support right away if you feel unsafe."
      : indexes.supportNeedIndex >= 55
      ? "This looks like a meaningful support-need signal. A grounded next step would be to tell one trusted person what happened today."
      : "This looks like a manageable but important emotional strain. We can slow it down and look at one trigger and one coping step.";

  return `${analysisSummary}\n\nSupportive Reply: ${intro} ${reflection} ${supportFocus}`.trim();
}

async function callHuggingFace(messages) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN environment variable is not configured");
  }

  const inputText = buildClassifierInput(messages);

  try {
    return await hfClient.textClassification({
      model: HF_MODEL_ID,
      inputs: inputText,
    });
  } catch (err) {
    const message = err?.message || String(err);
    const isLengthError =
      message.includes("expanded size of the tensor") ||
      message.includes("must match the existing size");

    if (!isLengthError) {
      throw err;
    }

    const reducedInput = inputText.slice(-512);
    return hfClient.textClassification({
      model: HF_MODEL_ID,
      inputs: reducedInput,
    });
  }
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

function formatReplyWithAnalysis(modelText, sentimentAnalysis, emotionAnalysis, indexes) {
  const analysisSummary = buildAnalysisSummary(
    sentimentAnalysis,
    emotionAnalysis,
    indexes
  );
  const cleanedText = (modelText || "").trim();

  return `${analysisSummary}\n\nMental Health Interpretation: ${cleanedText}`.trim();
}

async function generateReply(messages, sentimentAnalysis, emotionAnalysis, indexes) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN environment variable is not configured");
  }

  const safeMessages = (messages || []).slice(-10).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content || "",
  }));

  const analysisSummary = buildAnalysisSummary(
    sentimentAnalysis,
    emotionAnalysis,
    indexes
  );
  const systemInstruction = `You are a mental health analysis assistant. Stay focused on emotional interpretation, coping relevance, and support guidance. Use this analysis exactly as context:\n${analysisSummary}\nRespond in two parts only: "Mental Health Interpretation:" and "Supportive Reply:". Keep the tone empathetic, avoid generic chatbot language, and stay specific to the latest user message.`;

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
    return {
      text: avoidExactRepeat(
        formatReplyWithAnalysis(
          textResult.text,
          sentimentAnalysis,
          emotionAnalysis,
          indexes
        ),
        previousAssistantMessage
      ),
      source: textResult.source,
    };
  }

  return {
    text: avoidExactRepeat(
      buildFallbackReply(messages, sentimentAnalysis, emotionAnalysis, indexes),
      previousAssistantMessage
    ),
    source: "fallback:mental-health-analysis",
  };
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
  const emotionAnalysis = deriveEmotionAnalysis(messages, analysis);
  const indexes = deriveIndexes(messages, analysis, emotionAnalysis);
  const generatedReply = await generateReply(
    messages,
    analysis,
    emotionAnalysis,
    indexes
  );
  const aiResponseText = generatedReply.text;
  const conversationMessages = [
    ...messages,
    {
      role: "assistant",
      content: aiResponseText,
    },
  ];

  const chatAnalysis = await ChatAnalysis.findOneAndUpdate(
    { sessionId: String(sessionId) },
    {
      $set: {
        userId: userId ? String(userId) : undefined,
        userDetails: userDetails || {},
        messages: conversationMessages,
        aiResponse: aiResponseText,
        mentalState: analysis.mentalState,
        confidence: analysis.confidence,
        emotionAnalysis,
        indexes,
        generationSource: generatedReply.source,
        rawModelOutput: analysis.rawModelOutput,
      },
    },
    { upsert: true, new: true }
  );

  return {
    sessionId: chatAnalysis.sessionId,
    aiResponse: aiResponseText,
    analysis,
    emotionAnalysis,
    indexes,
    generationSource: generatedReply.source,
  };
}

module.exports = {
  analyzeChat,
};
