// Configuration object with both API credentials
const CONFIG = {
  // Perplexity API
  perplexityApiKey: "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",
  perplexityBaseURL: "https://api.perplexity.ai",

  // Gemini API
  geminiApiKey: "AIzaSyB5wIIRZwgqn1dRcEYUevJT8KIAkiV7Pmg",
  geminiBaseURL: "https://generativelanguage.googleapis.com/v1beta/models",

  // Current settings
  model: "sonar-pro",
  temperature: 0.2,
  maxTokens: 1000,
  citations: true,
  relatedQuestions: true,
  searchMode: true,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
};

let messages = [];
let isLoading = false;
let isRecording = false;
let recognition = null;

// Helper function to check if current model is Gemini
function isGeminiModel(model) {
  return model.startsWith("gemini");
}

document.addEventListener("DOMContentLoaded", function () {
  initializeApp();
});

function initializeApp() {
  const input = document.getElementById("chatInput");

  input.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  initializeSpeechRecognition();
  addWelcomeMessage();
  updateStatusIndicator("Connected", "success");
}

function initializeSpeechRecognition() {
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      document.getElementById("chatInput").value = transcript;
      stopVoiceRecording();
    };

    recognition.onerror = function (event) {
      console.error("Speech recognition error:", event.error);
      stopVoiceRecording();
      showError("Speech recognition failed. Please try again.");
    };

    recognition.onend = function () {
      stopVoiceRecording();
    };
  }
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();

  if (!message || isLoading) return;

  addMessage("user", message);
  input.value = "";
  input.style.height = "auto";

  messages.push({ role: "user", content: message });

  isLoading = true;
  updateSendButton(true);
  updateStatusIndicator("Thinking...", "loading");
  const loadingId = addMessage("assistant", "", true);

  try {
    let response;

    // Choose API based on selected model
    if (isGeminiModel(CONFIG.model)) {
      response = await callGeminiAPI();
    } else {
      response = await callPerplexityAPI();
    }

    document.getElementById(loadingId).remove();

    const assistantMessage = response.content;
    messages.push({ role: "assistant", content: assistantMessage });

    const messageClass = isGeminiModel(CONFIG.model)
      ? "gemini-message"
      : "assistant-message";
    addMessage(
      "assistant",
      assistantMessage,
      false,
      response.sources || [],
      null,
      response.relatedQuestions || [],
      messageClass
    );

    updateStatusIndicator("Connected", "success");
  } catch (error) {
    console.error("API Error:", error);
    document.getElementById(loadingId).remove();
    addMessage("assistant", "", false, [], `Error: ${error.message}`);
    updateStatusIndicator("Error occurred", "error");
  } finally {
    isLoading = false;
    updateSendButton(false);
  }
}

async function callPerplexityAPI() {
  const requestBody = {
    model: CONFIG.model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful AI assistant powered by SnapX. Provide comprehensive, accurate answers with proper context. When appropriate, include relevant examples and explanations.",
      },
      ...messages,
    ],
    temperature: CONFIG.temperature,
    max_tokens: CONFIG.maxTokens,
    frequency_penalty: CONFIG.frequencyPenalty,
    presence_penalty: CONFIG.presencePenalty,
    search_mode: "web",
    return_related_questions: CONFIG.relatedQuestions,
    return_citations: CONFIG.citations,
  };

  console.log(requestBody);

  const response = await fetch(`${CONFIG.perplexityBaseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.perplexityApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Perplexity API Error: ${response.status} ${response.statusText}. ${
        errorData.error?.message || ""
      }`
    );
  }

  const data = await response.json();

  return {
    content: data.choices[0].message.content,
    sources: data.search_results || [],
    relatedQuestions: data.related_questions || [],
  };
}

async function callGeminiAPI() {
  const lastUserMessage = messages[messages.length - 1].content;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: lastUserMessage,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: CONFIG.temperature,
      maxOutputTokens: CONFIG.maxTokens,
    },
  };

  const response = await fetch(
    `${CONFIG.geminiBaseURL}/${CONFIG.model}:generateContent?key=${CONFIG.geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Gemini API Error: ${response.status} ${response.statusText}. ${
        errorData.error?.message || ""
      }`
    );
  }

  const data = await response.json();
  console.log("object :>> ", data);

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error("Invalid response from Gemini API");
  }

  return {
    content: data.candidates[0].content.parts[0].text || "Sorry, no response.",
    sources: [], // Gemini doesn't provide sources like Perplexity
    relatedQuestions: [], // Gemini doesn't provide related questions
  };
}

function addMessage(
  type,
  content,
  loading = false,
  sources = [],
  error = null,
  relatedQuestions = [],
  messageClass = null
) {
  const messagesContainer = document.getElementById("chatMessages");
  const messageId =
    "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Determine message class based on model or passed parameter
  let msgClass = messageClass;
  if (!msgClass) {
    if (type === "user") {
      msgClass = "user-message";
    } else {
      msgClass = isGeminiModel(CONFIG.model)
        ? "gemini-message"
        : "assistant-message";
    }
  }

  let messageHTML = `
                <div class="message ${msgClass}" id="${messageId}">
                    <div class="message-avatar">
                        <i class="fas ${
                          type === "user" ? "fa-user" : "fa-robot"
                        }"></i>
                    </div>
                    <div class="message-content">
                        ${loading ? getLoadingHTML() : ""}
                        ${
                          error
                            ? `<div class="error-message"><i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>${error}</div>`
                            : ""
                        }
                        ${
                          content
                            ? `<div class="message-text">${marked.parse(
                                content
                              )}</div>`
                            : ""
                        }
                        ${sources.length > 0 ? getSourcesHTML(sources) : ""}
                        ${
                          relatedQuestions.length > 0
                            ? getRelatedQuestionsHTML(relatedQuestions)
                            : ""
                        }
                        <div class="message-time">${time}</div>
                    </div>
                </div>
            `;

  messagesContainer.insertAdjacentHTML("beforeend", messageHTML);

  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 100);

  return messageId;
}

function getLoadingHTML() {
  const modelName = isGeminiModel(CONFIG.model) ? "Gemini" : "Perplexity";
  return `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <span>${modelName} is thinking...</span>
                </div>
            `;
}

function getSourcesHTML(sources) {
  if (!sources || sources.length === 0) return "";

  let sourcesHTML = `
                <div class="sources-section">
                    <div class="sources-header">
                        <i class="fas fa-link"></i>
                        <span>Sources (${sources.length})</span>
                    </div>
            `;

  sources.forEach((source, index) => {
    sourcesHTML += `
                    <div class="source-item">
                        <a href="${
                          source.url
                        }" target="_blank" rel="noopener noreferrer" class="source-title">
                            ${source.title || `Source ${index + 1}`}
                        </a>
                        <div class="source-meta">
                            <div class="source-url">${
                              new URL(source.url).hostname
                            }</div>
                            ${
                              source.published_date
                                ? `<div class="source-date">${source.published_date}</div>`
                                : ""
                            }
                        </div>
                    </div>
                `;
  });

  sourcesHTML += "</div>";
  return sourcesHTML;
}

function getRelatedQuestionsHTML(questions) {
  if (!questions || questions.length === 0) return "";

  let questionsHTML = `
                <div class="related-questions">
                    <div class="related-header">
                        <i class="fas fa-lightbulb"></i>
                        <span>Related Questions</span>
                    </div>
            `;

  questions.forEach((question) => {
    questionsHTML += `
                    <div class="related-question" onclick="askRelatedQuestion('${question.replace(
                      /'/g,
                      "\\'"
                    )}')">
                        ${question}
                    </div>
                `;
  });

  questionsHTML += "</div>";
  return questionsHTML;
}

function askRelatedQuestion(question) {
  document.getElementById("chatInput").value = question;
  sendMessage();
}

function addWelcomeMessage() {
  const welcomeMessage = `
# Welcome to SnapX AI - Multi-Model Assistant! 🚀

I'm your advanced AI research companion, now powered by **both Perplexity and Google Gemini models**! Here's what I can do:

## 🔍 **Dual AI Capabilities**
- **Perplexity Models**: Real-time web search with citations and sources
- **Gemini Models**: Advanced reasoning, coding, and creative tasks
- Switch between models anytime for different use cases

## 💡 **Smart Features**
- Access the latest information with credible citations (Perplexity)
- Generate code, analyze data, and provide insights (Both)
- Creative writing and complex problem-solving (Gemini)
- Voice input and advanced settings

## ⚙️ **Available Models**
**Perplexity**: Sonar Pro, Sonar, Mistral 7B, CodeLlama 34B, Llama 2 70B
**Gemini**: 1.5 Flash, 1.5 Pro, Pro, Pro Vision

## 🎯 **Try These Examples**
- "What's new in AI today?" (Perplexity for real-time info)
- "Write a Python web scraper" (Either model)
- "Explain quantum computing simply" (Gemini for detailed explanations)
- "Latest tech news and trends" (Perplexity for current events)

Select your preferred model from the sidebar and start chatting! ✨
            `;

  addMessage("assistant", welcomeMessage);
}

function updateSendButton(loading) {
  const sendBtn = document.getElementById("sendBtn");
  const icon = sendBtn.querySelector("i");

  if (loading) {
    sendBtn.disabled = true;
    icon.className = "fas fa-spinner fa-spin";
  } else {
    sendBtn.disabled = false;
    icon.className = "fas fa-paper-plane";
  }
}

function updateStatusIndicator(message, type) {
  const indicator = document.getElementById("statusIndicator");

  indicator.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; margin-right: 6px;"></i>${message}`;

  indicator.style.background =
    type === "success"
      ? "var(--success-gradient)"
      : type === "error"
      ? "var(--secondary-gradient)"
      : type === "loading"
      ? "var(--warning-gradient)"
      : "var(--primary-gradient)";
}

function toggleVoiceRecording() {
  if (!recognition) {
    showError("Voice recognition is not supported in this browser.");
    return;
  }

  if (isRecording) {
    recognition.stop();
    stopVoiceRecording();
  } else {
    recognition.start();
    startVoiceRecording();
  }
}

function startVoiceRecording() {
  isRecording = true;
  const voiceBtn = document.getElementById("voiceBtn");
  const icon = voiceBtn.querySelector("i");

  voiceBtn.classList.add("recording");
  icon.className = "fas fa-stop";
  voiceBtn.title = "Stop Recording";

  updateStatusIndicator("Listening...", "loading");
}

function stopVoiceRecording() {
  isRecording = false;
  const voiceBtn = document.getElementById("voiceBtn");
  const icon = voiceBtn.querySelector("i");

  voiceBtn.classList.remove("recording");
  icon.className = "fas fa-microphone";
  voiceBtn.title = "Voice Input";

  updateStatusIndicator("Connected", "success");
}

function updateModel() {
  const select = document.getElementById("modelSelect");
  CONFIG.model = select.value;

  const modelName = select.options[select.selectedIndex].text;
  const provider = isGeminiModel(CONFIG.model) ? "Google Gemini" : "Perplexity";

  updateStatusIndicator(
    `Model changed to ${modelName} (${provider})`,
    "success"
  );

  // Update chat title to reflect current provider
  const chatTitle = document.querySelector(".chat-title");
  chatTitle.textContent = `${provider} Assistant`;
}

function updateSlider(slider, param) {
  const rect = slider.getBoundingClientRect();
  const thumb = slider.querySelector(".slider-thumb");
  const percent = Math.max(
    0,
    Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)
  );

  thumb.style.left = percent + "%";

  let value;
  if (param === "temperature") {
    value = (percent / 100) * 2;
    CONFIG.temperature = value;
    document.getElementById("temperatureValue").textContent = value.toFixed(1);
  } else if (param === "maxTokens") {
    value = Math.round((percent / 100) * 2000) + 100;
    CONFIG.maxTokens = value;
    document.getElementById("maxTokensValue").textContent = value;
  }
}

function toggleSetting(toggle, setting) {
  toggle.classList.toggle("active");
  const isActive = toggle.classList.contains("active");

  switch (setting) {
    case "citations":
      CONFIG.citations = isActive;
      break;
    case "relatedQuestions":
      CONFIG.relatedQuestions = isActive;
      break;
    case "searchMode":
      CONFIG.searchMode = isActive;
      break;
  }

  // Note: Some settings only apply to Perplexity models
  const settingNote = isGeminiModel(CONFIG.model)
    ? " (Perplexity models only)"
    : "";
  updateStatusIndicator(
    `${setting} ${isActive ? "enabled" : "disabled"}${settingNote}`,
    "success"
  );
}

function toggleTheme(toggle) {
  toggle.classList.toggle("active");
  document.body.classList.toggle("dark-theme");

  const isDark = document.body.classList.contains("dark-theme");
  if (isDark) {
    document.getElementById("maxTokensValue").style.color = "#cbd5e1";
    document.getElementById("temperatureValue").style.color = "#cbd5e1";
  } else {
    document.getElementById("maxTokensValue").style.color = "";
    document.getElementById("temperatureValue").style.color = "";
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("mobile-open");
}

function startNewChat() {
  if (confirm("Start a new conversation? This will clear the current chat.")) {
    clearChat();
  }
}

function clearChat() {
  document.getElementById("chatMessages").innerHTML = "";
  messages = [];
  addWelcomeMessage();
  updateStatusIndicator("Chat cleared", "success");
}

function exportChat() {
  const chatData = {
    timestamp: new Date().toISOString(),
    model: CONFIG.model,
    provider: isGeminiModel(CONFIG.model) ? "Google Gemini" : "Perplexity",
    messages: messages,
    config: CONFIG,
  };

  const blob = new Blob([JSON.stringify(chatData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SnapX-MultiModel-chat-${
    new Date().toISOString().split("T")[0]
  }.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateStatusIndicator("Chat exported successfully", "success");
}

function toggleSettings() {
  alert(`🔧 **Multi-Model Settings Panel**

Current Features:
• Switch between Perplexity and Gemini models
• Customize temperature and token limits
• Toggle citations and related questions (Perplexity only)
• Dark/Light theme switching
• Voice input support
• Export chat functionality

Advanced features available:
• API key management
• Custom system prompts
• Search domain filters (Perplexity)
• Response formatting options
• Usage analytics
• Keyboard shortcuts

The app now supports both Perplexity (with real-time search) and Google Gemini (advanced reasoning) models!`);
}

function showError(message) {
  updateStatusIndicator(message, "error");
}

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    sendMessage();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    document.getElementById("chatInput").focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    clearChat();
  }
});

// Settings persistence
function saveSettings() {
  localStorage.setItem("SnapX-MultiModel-settings", JSON.stringify(CONFIG));
}

function loadSettings() {
  const saved = localStorage.getItem("SnapX-MultiModel-settings");
  if (saved) {
    Object.assign(CONFIG, JSON.parse(saved));
  }
}

// Auto-save settings on change
window.addEventListener("beforeunload", saveSettings);

// Initialize
loadSettings();
