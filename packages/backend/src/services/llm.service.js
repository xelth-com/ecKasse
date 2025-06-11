// File: /packages/backend/src/services/llm.service.js
const {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  Type
} = require("@google/genai");
const logger = require('../config/logger');

const apiKey = process.env.GEMINI_API_KEY;

let genAI;

if (apiKey) {
  genAI = new GoogleGenAI({ apiKey });
  logger.info("Google GenAI SDK initialized.");
} else {
  logger.warn("Google GenAI SDK not initialized due to missing API key. LLM features will be unavailable.");
}

const DUMMY_TOOLS_UPDATED_DESC = [
  {
    functionDeclarations: [
      {
        name: "getProductDetails",
        description: "Retrieve internal product details from the ecKasse POS system's database using either the product's unique ID or its name. Use this to find information like price, category, and description for items managed by this specific POS system.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            productId: { type: Type.STRING, description: "The unique identifier (ID) of the product." },
            productName: { type: Type.STRING, description: "The full or partial name of the product." }
          },
        },
      },
    ],
  },
];

function executeGetProductDetails(args) {
  logger.info({ msg: "Executing dummy function: getProductDetails", args });
  const { productId, productName } = args;
  if (productId === "123" || (productName && productName.toLowerCase().includes("super widget"))) {
    return { id: "123", name: "Super Widget", price: 19.99, category: "Gadgets", description: "The best widget ever!" };
  } else if (productId === "456" || (productName && productName.toLowerCase().includes("eco mug"))) {
    return { id: "456", name: "Eco Mug", price: 12.50, category: "Kitchenware", description: "A sustainable and stylish mug." };
  } else if (productId === "5543") {
    return { id: "5543", name: "Test Product", price: 25.99, category: "Test Category", description: "This is a test product for demonstration." };
  }
  return { error: "Product not found", requestedId: productId, requestedName: productName };
}

// Системный промпт для контекста
const SYSTEM_CONTEXT = `You are an AI assistant integrated into the ecKasse Point of Sale (POS) system. You have access to internal product database through the getProductDetails function. 

IMPORTANT RULES:
1. When users ask about products (by ID, name, or description), you MUST use the getProductDetails function to retrieve current information from the ecKasse database.
2. Never provide generic responses about product databases - always check the internal system first.
3. If a product is not found in the system, then you can explain that it's not in the current inventory.
4. Always use the available tools when they are relevant to the user's question.

You are specifically working within the ecKasse POS system context.`;

async function sendMessageToGemini(userMessage, initialChatHistory = []) {
  if (!genAI) {
    const errorMsg = "Google GenAI SDK is not initialized.";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Используем более новую модель с лучшей поддержкой function calling
  const modelId = "gemini-2.5-flash-preview-05-20";

  // Добавляем системный контекст в начало разговора
  let currentTurnContents = [
    // Системное сообщение для контекста
    { role: "user", parts: [{ text: SYSTEM_CONTEXT }] },
    { role: "model", parts: [{ text: "Understood. I am now operating as an AI assistant within the ecKasse POS system. I will use the getProductDetails function whenever users ask about product information, and I will always check the internal database first before providing any product-related responses." }] },
    ...initialChatHistory,
    { role: "user", parts: [{ text: userMessage }] }
  ];

  logger.info({ msg: 'Sending initial message to Gemini with system context', model: modelId, contents: currentTurnContents, tools: DUMMY_TOOLS_UPDATED_DESC });

  try {
    const result = await genAI.models.generateContent({ 
      model: modelId,
      contents: currentTurnContents,
      tools: DUMMY_TOOLS_UPDATED_DESC,
      // Улучшенная конфигурация для function calling
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY"
        }
      },
      // Добавляем параметры генерации для лучшего function calling
      generationConfig: {
        temperature: 0.1, // Низкая температура для более предсказуемого поведения
        maxOutputTokens: 2048,
      }
    });

    const candidate = result.candidates?.[0];

    if (!candidate) {
      logger.warn({ msg: 'Gemini response had no candidates.', promptFeedback: result.promptFeedback, rawResponse: result });
      return { text: "Sorry, I couldn't generate a response. Please try again.", history: currentTurnContents };
    }

    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          const functionCall = part.functionCall;
          logger.info({ msg: "Gemini requested function call (SUCCESS!)", functionCall });

          let functionResponsePayload;
          if (functionCall.name === "getProductDetails") {
            functionResponsePayload = executeGetProductDetails(functionCall.args);
          } else {
            logger.warn({ msg: "Unknown function requested by Gemini", functionName: functionCall.name });
            functionResponsePayload = { error: `Unknown function: ${functionCall.name}` };
          }

          const historyForFunctionResponse = [
            ...currentTurnContents,
            { role: "model", parts: [part] },
            {
              role: "function",
              parts: [{ functionResponse: { name: functionCall.name, response: functionResponsePayload } }]
            }
          ];
          
          logger.info({ msg: "Sending function response back to Gemini", functionResponse: functionResponsePayload });
          const secondResult = await genAI.models.generateContent({ 
            model: modelId,
            contents: historyForFunctionResponse,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
            }
          });

          const finalCandidate = secondResult.candidates?.[0];
          let finalText = "Could not extract text after function call.";
          if (finalCandidate?.content?.parts?.[0]?.text) {
            finalText = finalCandidate.content.parts[0].text;
            logger.info({ msg: "Received final Gemini response after function call", text: finalText });
          } else { 
              logger.warn({ msg: 'Gemini did not return text after function call', secondResult });
          }
          return { text: finalText, history: historyForFunctionResponse }; 
        }
      }
    }
    
    let directText = "No direct text response from Gemini.";
    if (candidate.content?.parts?.[0]?.text) {
      directText = candidate.content.parts[0].text;
      logger.info({ msg: "Received direct Gemini response (no function call)", text: directText });
    } else { 
        logger.warn({ msg: 'Gemini response did not contain text and no function call', finishReason: candidate.finishReason, safetyRatings: candidate.safetyRatings, promptFeedback: result.promptFeedback });
        directText = `I received a response, but it didn't contain text. Finish reason: ${candidate.finishReason || 'unknown'}`;
    }
    
    const finalHistoryForThisTurn = [
        ...currentTurnContents, 
        { role: "model", parts: [{ text: directText }] } 
    ];
    return { text: directText, history: finalHistoryForThisTurn };

  } catch (error) {
    logger.error({ msg: 'Error communicating with Gemini API (@google/genai)', error: error.message, stack: error.stack });
    
    // Если toolConfig не работает, попробуем без него
    if (error.message.includes('toolConfig') || error.message.includes('functionCallingConfig')) {
      logger.info({ msg: 'Retrying without toolConfig due to error' });
      try {
        const retryResult = await genAI.models.generateContent({ 
          model: modelId,
          contents: currentTurnContents,
          tools: DUMMY_TOOLS_UPDATED_DESC,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          }
        });
        
        // Обрабатываем результат так же, как выше
        const candidate = retryResult.candidates?.[0];
        
        // Проверяем на function call даже в retry
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              const functionCall = part.functionCall;
              logger.info({ msg: "Function call found in retry", functionCall });
              
              let functionResponsePayload;
              if (functionCall.name === "getProductDetails") {
                functionResponsePayload = executeGetProductDetails(functionCall.args);
              } else {
                functionResponsePayload = { error: `Unknown function: ${functionCall.name}` };
              }

              const historyForFunctionResponse = [
                ...currentTurnContents,
                { role: "model", parts: [part] },
                {
                  role: "function",
                  parts: [{ functionResponse: { name: functionCall.name, response: functionResponsePayload } }]
                }
              ];
              
              const secondResult = await genAI.models.generateContent({ 
                model: modelId,
                contents: historyForFunctionResponse,
              });

              const finalCandidate = secondResult.candidates?.[0];
              if (finalCandidate?.content?.parts?.[0]?.text) {
                return { text: finalCandidate.content.parts[0].text, history: historyForFunctionResponse };
              }
            }
          }
        }
        
        if (candidate?.content?.parts?.[0]?.text) {
          return { text: candidate.content.parts[0].text, history: currentTurnContents };
        }
      } catch (retryError) {
        logger.error({ msg: 'Retry also failed', error: retryError.message });
      }
    }
    
    let errorMessage = error.message;
    if (error.errorDetails) { 
      errorMessage += ` Details: ${JSON.stringify(error.errorDetails)}`;
    } else if (error.response && error.response.data) { 
      errorMessage += ` Details: ${JSON.stringify(error.response.data)}`;
    }
    throw new Error(`Gemini API Error: ${errorMessage}`);
  }
}

module.exports = { sendMessageToGemini, DUMMY_TOOLS: DUMMY_TOOLS_UPDATED_DESC };