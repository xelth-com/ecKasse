// File: /packages/backend/src/services/llm.service.js
const {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  Type,
  FunctionCallingConfigMode
} = require("@google/genai");
const logger = require('../config/logger');

const apiKey = process.env.GEMINI_API_KEY;

let genAI;

if (apiKey) {
  genAI = new GoogleGenAI({ vertexai: false, apiKey });
  logger.info("Google GenAI SDK initialized.");
} else {
  logger.warn("Google GenAI SDK not initialized due to missing API key. LLM features will be unavailable.");
}

// Function declaration using official Google example structure
const getProductDetailsFunctionDeclaration = {
  name: "getProductDetails",
  parameters: {
    type: Type.OBJECT,
    description: "Retrieve internal product details from the ecKasse POS system's database using either the product's unique ID or its name. Use this to find information like price, category, and description for items managed by this specific POS system.",
    properties: {
      productId: {
        type: Type.STRING,
        description: "The unique identifier (ID) of the product."
      },
      productName: {
        type: Type.STRING,
        description: "The full or partial name of the product."
      }
    },
    required: [] // Making both optional so user can search by either ID or name
  }
};

function executeGetProductDetails(args) {
  logger.info({ msg: "Executing dummy function: getProductDetails", args });
  const { productId, productName } = args || {};
  
  if (productId === "123" || (productName && productName.toLowerCase().includes("super widget"))) {
    return { id: "123", name: "Super Widget", price: 19.99, category: "Gadgets", description: "The best widget ever!" };
  } else if (productId === "456" || (productName && productName.toLowerCase().includes("eco mug"))) {
    return { id: "456", name: "Eco Mug", price: 12.50, category: "Kitchenware", description: "A sustainable and stylish mug." };
  } else if (productId === "5543") {
    return { id: "5543", name: "Test Product", price: 25.99, category: "Test Category", description: "This is a test product for demonstration." };
  }
  return { error: "Product not found", requestedId: productId, requestedName: productName };
}

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

  // Try different models in order of preference
  const models = [
    "gemini-2.5-flash-preview-05-20", // Your original choice
      "gemini-2.0-flash",              // Latest stable
    "gemini-1.5-flash-latest"        // Fallback
  ];

  for (const modelId of models) {
    try {
      logger.info(`Attempting with model: ${modelId}`);
      const result = await attemptWithModel(modelId, userMessage, initialChatHistory);
      if (result) {
        logger.info(`Success with model: ${modelId}`);
        return result;
      }
    } catch (error) {
      logger.warn(`Model ${modelId} failed: ${error.message}`);
      continue;
    }
  }

  throw new Error("All model versions failed");
}

async function attemptWithModel(modelId, userMessage, initialChatHistory) {
  // Build conversation history following Google's pattern
  let contents = [
    { role: "user", parts: [{ text: SYSTEM_CONTEXT }] },
    { role: "model", parts: [{ text: "Understood. I am now operating as an AI assistant within the ecKasse POS system. I will use the getProductDetails function whenever users ask about product information, and I will always check the internal database first before providing any product-related responses." }] },
    ...initialChatHistory,
    { role: "user", parts: [{ text: userMessage }] }
  ];

  logger.info({ 
    msg: 'Sending message to Gemini using official API structure', 
    model: modelId, 
    messageLength: userMessage.length,
    historyLength: initialChatHistory.length 
  });

  try {
    // Using the official Google API structure
    const response = await genAI.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [getProductDetailsFunctionDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['getProductDetails']
          }
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        }
      }
    });

    logger.info({ msg: "Raw response received", response: JSON.stringify(response, null, 2) });

    // Check if there are function calls in the response
    if (response.functionCalls && response.functionCalls.length > 0) {
      logger.info({ msg: "Function calls detected", functionCalls: response.functionCalls });

      // Execute the function calls
      const functionResults = [];
      for (const functionCall of response.functionCalls) {
        if (functionCall.name === "getProductDetails") {
          const result = executeGetProductDetails(functionCall.args);
          functionResults.push({
            name: functionCall.name,
            response: result
          });
        } else {
          logger.warn({ msg: "Unknown function called", functionName: functionCall.name });
          functionResults.push({
            name: functionCall.name,
            response: { error: `Unknown function: ${functionCall.name}` }
          });
        }
      }

      // Build history with function calls and responses
      const updatedContents = [
        ...contents,
        { 
          role: "model", 
          parts: response.functionCalls.map(fc => ({ functionCall: fc }))
        },
        {
          role: "function",
          parts: functionResults.map(fr => ({ 
            functionResponse: fr
          }))
        }
      ];

      logger.info({ msg: "Sending function results back to model", functionResults });

      // Get final response after function execution
      const finalResponse = await genAI.models.generateContent({
        model: modelId,
        contents: updatedContents,
        config: {
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          }
        }
      });

      // Extract text from final response
      const finalText = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (finalText) {
        logger.info({ msg: "Function call workflow completed", finalText });
        return { 
          text: finalText, 
          history: [...updatedContents, { role: "model", parts: [{ text: finalText }] }]
        };
      } else {
        logger.warn({ msg: "No text in final response after function call", finalResponse });
        return {
          text: `Function executed successfully. Results: ${JSON.stringify(functionResults, null, 2)}`,
          history: updatedContents
        };
      }
    }

    // Handle direct text response (no function calls)
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.text) {
      const directText = candidate.content.parts[0].text;
      logger.info({ msg: "Direct text response received", text: directText });
      
      const finalHistory = [
        ...contents, 
        { role: "model", parts: [{ text: directText }] }
      ];
      return { text: directText, history: finalHistory };
    }

    // Fallback handling
    logger.warn({ 
      msg: 'Unexpected response format', 
      candidates: response.candidates,
      promptFeedback: response.promptFeedback 
    });
    
    return { 
      text: "Received response but couldn't extract text content.", 
      history: contents 
    };

  } catch (error) {
    logger.error({ 
      msg: 'Error with model', 
      model: modelId, 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }
}

module.exports = { 
  sendMessageToGemini, 
  DUMMY_TOOLS: [{ functionDeclarations: [getProductDetailsFunctionDeclaration] }]
};