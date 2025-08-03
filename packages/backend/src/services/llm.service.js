// File: /packages/backend/src/services/llm.service.js

const { Type } = require("@google/genai");
const { getGeminiModel } = require('./llm.provider');

const logger = require('../config/logger');
const knex = require('../db/knex');
const { handleGeminiError, createGeminiErrorLog } = require('../utils/geminiErrorHandler');
const { searchProducts } = require('./search.service');
const { generateSalesReport } = require('./reporting.service');
const { createProduct } = require('./product.service');


// Language detection utilities
const LANGUAGE_PATTERNS = {
    russian: /[а-яё]/i,
    german: /[äöüß]/i,
    english: /^[a-z\s.,!?'"\-()0-9]+$/i
};

const EXPLICIT_LANGUAGE_COMMANDS = {
    russian: /(?:отвечай|говори|переключись).*(?:на\s*русском|по-русски)/i,
    german: /(?:speak|reply|answer).*(?:in\s*german|auf\s*deutsch)|(?:sprich|antworte).*deutsch/i,
    english: /(?:speak|reply|answer).*(?:in\s*english|на\s*английском)/i
};

/**
 * Detect the primary language of a text
 * @param {string} text - The text to analyze
 * @returns {string} - Detected language code ('ru', 'de', 'en')
 */
function detectLanguage(text) {
    const cleanText = text.trim().toLowerCase();
    
    // Check for explicit language commands first
    for (const [lang, pattern] of Object.entries(EXPLICIT_LANGUAGE_COMMANDS)) {
        if (pattern.test(cleanText)) {
            return lang === 'russian' ? 'ru' : lang === 'german' ? 'de' : 'en';
        }
    }
    
    // Check for Russian (Cyrillic)
    if (LANGUAGE_PATTERNS.russian.test(text)) {
        return 'ru';
    }
    
    // Check for German (umlauts and ß)
    if (LANGUAGE_PATTERNS.german.test(text)) {
        return 'de';
    }
    
    // Default to English if no specific patterns found
    return 'en';
}

/**
 * Determine if a text is a short phrase (likely a product name)
 * @param {string} text - The text to analyze
 * @returns {boolean} - True if it's a short phrase
 */
function isShortPhrase(text) {
    const words = text.trim().split(/\s+/);
    return words.length <= 3;
}

/**
 * Check if user is explicitly requesting a language switch
 * @param {string} text - The text to analyze
 * @returns {string|null} - Language code if explicit command detected, null otherwise
 */
function detectExplicitLanguageCommand(text) {
    const cleanText = text.trim().toLowerCase();
    
    for (const [lang, pattern] of Object.entries(EXPLICIT_LANGUAGE_COMMANDS)) {
        if (pattern.test(cleanText)) {
            return lang === 'russian' ? 'ru' : lang === 'german' ? 'de' : 'en';
        }
    }
    
    return null;
}

/**
 * Get or initialize conversation language state
 * @param {Array} chatHistory - Current chat history
 * @returns {Object} - Language state object
 */
function getLanguageState(chatHistory) {
    // Check if language state exists in history metadata
    if (chatHistory && chatHistory.length > 0 && chatHistory[0]._languageState) {
        return chatHistory[0]._languageState;
    }
    
    // Default to Russian if no state found
    return { current_language: 'ru' };
}

/**
 * Update language state in chat history
 * @param {Array} chatHistory - Current chat history
 * @param {string} newLanguage - New language code
 * @returns {Array} - Updated chat history
 */
function updateLanguageState(chatHistory, newLanguage) {
    const updatedHistory = [...chatHistory];
    
    // Add language state to first message if history exists
    if (updatedHistory.length > 0) {
        updatedHistory[0]._languageState = { current_language: newLanguage };
    }
    
    return updatedHistory;
}

// Tool function declarations for native SDK
const findProductDeclaration = {
    name: "findProduct",
    description: "Searches for products in the database. Can filter results by dietary needs (vegetarian/vegan) and exclude specific allergens.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: "The product name or general category to search for (e.g., 'pasta', 'salad', 'Tiramisu')."
            },
            excludeAllergens: {
                type: Type.ARRAY,
                description: "A list of allergens to exclude from the results, e.g., ['nuts', 'dairy'].",
                items: {
                    type: Type.STRING
                }
            },
            dietaryFilter: {
                type: Type.STRING,
                description: "Filter for specific dietary needs.",
                enum: ["vegetarian", "vegan"]
            }
        },
        required: ["query"]
    }
};

const createProductDeclaration = {
    name: "createProduct",
    description: "Use this tool to create a new product in the database. It requires a name, a price, and a category name. For example: 'Create a product named Latte for 3.50 in the Drinks category'.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            name: {
                type: Type.STRING,
                description: "The name of the product"
            },
            price: {
                type: Type.NUMBER,
                description: "The price of the product"
            },
            category: {
                type: Type.STRING,
                description: "The category name for the product"
            },
            description: {
                type: Type.STRING,
                description: "Optional description of the product"
            }
        },
        required: ["name", "price", "category"]
    }
};

const getSalesReportDeclaration = {
    name: "getSalesReport",
    description: "Use this tool to get a sales report for a specific period. Supported periods are 'today', 'week', and 'month'. The data can also be grouped by 'category' or 'hour'. For example: 'show me the sales report for this week grouped by category'.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            period: {
                type: Type.STRING,
                description: "Time period for the report",
                enum: ["today", "week", "month"]
            },
            groupBy: {
                type: Type.STRING,
                description: "How to group the report data",
                enum: ["category", "hour", "none"]
            }
        },
        required: ["period"]
    }
};

const toolsConfig = {
    functionDeclarations: [findProductDeclaration, createProductDeclaration, getSalesReportDeclaration]
};

// Tool function implementations
const toolFunctions = {
    findProduct: async (args) => {
        const productName = args.query;
        const filters = {
            excludeAllergens: args.excludeAllergens || [],
            dietaryFilter: args.dietaryFilter || null
        };
        logger.info({ tool: 'findProduct', input: productName, filters }, '🤖 Agent is using hybrid product search with filters...');
        try {
            const searchResult = await searchProducts(productName, filters);
            logger.info({ searchMetadata: searchResult.metadata }, `Search complete: ${searchResult.metadata?.searchMethod}`);
            return searchResult;
        } catch (error) {
            logger.error({ msg: "Error in findProduct tool (hybrid search)", error });
            return { 
                success: false, 
                message: "An error occurred during the search.",
                results: [],
                metadata: { error: error.message }
            };
        }
    },
    
    createProduct: async (args) => {
        logger.info({ tool: 'createProduct', input: args }, '🤖 Agent is calling the real product service...');
        try {
            const productData = {
                name: args.name,
                price: args.price,
                categoryName: args.category,
                description: args.description || `A new ${args.name}`
            };
            
            const result = await createProduct(productData, { type: 'ai_agent', id: 1, model: 'gemini-1.5-flash' });
            return result;
        } catch (error) {
            logger.error({ tool: 'createProduct', error: error.message }, 'Error in createProduct tool');
            return {
                success: false,
                message: 'Error creating product: ' + error.message,
                error: error.message
            };
        }
    },
    
    getSalesReport: async (args) => {
        logger.info({ tool: 'getSalesReport', input: args }, '🤖 Agent is calling the real reporting service...');
        try {
            const period = args.period || 'today';
            const groupBy = args.groupBy || 'none';
            const report = await generateSalesReport({ period, groupBy });
            return report;
        } catch (error) {
            logger.error({ tool: 'getSalesReport', error: error.message }, 'Error in getSalesReport tool');
            return {
                success: false,
                message: 'Error generating sales report: ' + error.message,
                error: error.message
            };
        }
    }
};

/**
 * Get the default Gemini model configuration
 */
function getDefaultModelConfig() {
    return { name: "gemini-2.5-flash", temperature: 0.1 };
}

/**
 * Create system prompt for the conversation
 */
function createSystemPrompt(conversationLanguage = 'ru') {
    return `You are an AI assistant for the "ecKasse" POS system. Your primary role is to help users manage their store through natural language.

**General Guidelines:**
- **CRITICAL: ALWAYS use tools:** When a user asks about finding, searching, or looking for products, ALWAYS use the findProduct tool first. Never try to answer without checking the database. NEVER ask for clarification before searching - always search first with the user's exact query.
- **Tool Usage:** Use the provided tools to interact with the database. Always base your answers on the output of the tools. Do not make up information.
- **Product Search:** For ANY request that involves finding products (words like "найди", "find", "search", "ищи", "ищу", "покажи", "show"), immediately use the findProduct tool with the user's query.
- **Context:** Use the conversation history to understand follow-up questions (e.g., "what is its price?").
- **Clarity:** After using a tool, provide a clear response based on the tool's output.

**Advanced Language Handling Rules:**
1. **Primary Language:** Your current conversation language is "${conversationLanguage}". Always respond in this language unless instructed otherwise.
2. **Language Detection:** Analyze every user message to determine its language.
3. **Full Sentence Language Switch:** If the user writes a complete sentence (4+ words) in a different language, this indicates a conversation language change. Switch your responses to this new language.
4. **Short Phrases (Product Names):** If the user writes a short phrase (1-3 words) in a different language, treat it as a product name. Use the phrase for tool searches but respond in your current primary language.
5. **Explicit Language Commands:** If the user explicitly asks you to switch languages (e.g., "speak English", "отвечай на русском", "sprich Deutsch"), immediately switch to the requested language and confirm the switch.
6. **Context Preservation:** When switching languages, maintain the same helpful and professional tone.

**Language Examples:**
- User (RU): "Найди Bruschetta" → You MUST call findProduct tool with query "Bruschetta", then respond in Russian
- User (EN): "Could you please find the Eco Mug?" → You MUST call findProduct tool with query "Eco Mug", then switch to English and respond in English
- User (Any): "Please respond in German" → You switch to German and confirm: "Verstanden. Ich antworte jetzt auf Deutsch."

**Tool Usage Examples:**
- To find vegetarian pasta: findProduct({query: "pasta", dietaryFilter: "vegetarian"})
- To find a dessert with no nuts: findProduct({query: "dessert", excludeAllergens: ["nuts"]})
- To find a shrimp dish: findProduct({query: "shrimps"})

**MANDATORY Tool Usage Examples - You MUST follow these patterns:**
- User: "Найди Super Widget" → You MUST call: findProduct({"query": "Super Widget"})
- User: "ищи кружку" → You MUST call: findProduct({"query": "кружку"}) - NEVER ask for clarification, search immediately
- User: "Find coffee" → You MUST call: findProduct({"query": "coffee"})
- User: "Show me mugs" → You MUST call: findProduct({"query": "mugs"})

Your primary goal is to translate the user's request into the most effective tool call. If the user mentions dietary needs or allergies, you MUST use the corresponding filter parameters in the \`findProduct\` tool.

**Context Handling Examples:**
- Previous: "I found Eco Mug for 12.50€" → User: "how much does it cost?" → You: "Eco Mug costs 12.50€" (NO tool call needed)
- Previous: "Точное совпадение не найдено, но есть похожий товар: Premium Coffee Cup - 8.75€" → User: "сколько она стоит?" → You: "Premium Coffee Cup стоит 8.75€" (NO tool call needed)

**Search Result Interpretation Rules:**
When using the findProduct tool, interpret the response according to these rules:

1. **Exact or Close Match (success: true):** If the tool returns success: true and results array, inform the user that the product was found. State the name and price of the first item in the results array. If there are other close matches in the array, list them as alternatives.
   Example response: "Да, товар 'Eco Mug' найден. Его цена 12.50€. Также найден похожий товар: 'Super Widget'."

2. **No Exact Match with Suggestions (success: false with results):** If the tool returns success: false but with results array containing suggestions, politely inform the user that an exact match was not found and offer the product names from the results array as suggestions.
   Example response: "Товар 'чашка' не найден. Возможно, вы имели в виду: Eco Mug, Super Widget?"

3. **No Results (success: false with empty results):** If the findProduct tool returns success: false AND results array is empty, you MUST respond with EXACTLY this text and nothing else: "К сожалению, товар по вашему запросу не найден."

4. **Context Rule:** If the user asks a follow-up question like "what is its price?" or "how much?" or "сколько она стоит?", you MUST refer to the previous conversation to identify which product they're asking about. Use the product name and price from your previous response to answer directly, without calling tools again.
   
   **Specific Context Scenario:** If the previous conversation included finding products (like "ищи кружку" followed by a product result), and the user asks "сколько она стоит?", extract the product name and price from your previous response and state: "[Product Name] стоит [Price]€."

5. **Response Language:** Always formulate your response in your current primary language (${conversationLanguage}), unless the language handling rules above indicate a switch.`;
}

async function sendMessage(userMessage, chatHistory = []) {
    // Enhanced logging for debugging
    console.log(`[AGENT_INPUT] User Message: "${userMessage}"`);
    console.log(`[AGENT_INPUT] Chat History Length: ${chatHistory.length}`);
    
    logger.info({ msg: 'Message received by native Gemini service', message: userMessage });
    
    // Get current language state from conversation
    const languageState = getLanguageState(chatHistory);
    let currentLanguage = languageState.current_language;
    
    // Detect language of the current user message
    const detectedLanguage = detectLanguage(userMessage);
    logger.info({ msg: 'Language analysis', currentLanguage, detectedLanguage, isShortPhrase: isShortPhrase(userMessage) });
    
    // Check for explicit language switch command
    const explicitLanguageCommand = detectExplicitLanguageCommand(userMessage);
    
    // Determine if we should switch conversation language
    let shouldSwitchLanguage = false;
    let newLanguage = currentLanguage;
    
    if (explicitLanguageCommand) {
        // User explicitly requested a language switch
        shouldSwitchLanguage = true;
        newLanguage = explicitLanguageCommand;
        logger.info({ msg: 'Explicit language command detected', newLanguage });
    } else if (detectedLanguage !== currentLanguage) {
        // User message is in a different language
        if (isShortPhrase(userMessage)) {
            // Short phrase - likely a product name, keep current language
            logger.info({ msg: 'Short phrase detected, keeping current language', currentLanguage });
        } else {
            // Full sentence - switch conversation language
            shouldSwitchLanguage = true;
            newLanguage = detectedLanguage;
            logger.info({ msg: 'Full sentence in new language detected, switching', newLanguage });
        }
    }
    
    // Update chat history with new language state if needed
    let updatedChatHistory = chatHistory;
    if (shouldSwitchLanguage) {
        updatedChatHistory = updateLanguageState(chatHistory, newLanguage);
        currentLanguage = newLanguage;
    }
    
    // Convert chat history to native SDK format
    const history = updatedChatHistory.filter(msg => !msg._languageState).map(msg => {
        const content = Array.isArray(msg.parts) ? msg.parts.map(p => p.text).join('') : msg.parts;
        return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: content }]
        };
    });
    
    const modelConfig = getDefaultModelConfig();
    const modelName = modelConfig.name;
    logger.info({ msg: `Using model ${modelName}`, conversationLanguage: currentLanguage });
    
    try {
            // Enhanced logging for first Gemini call
            const systemPrompt = createSystemPrompt(currentLanguage);
            console.log(`[GEMINI_CALL_1] System Prompt: "${systemPrompt}"`);
            console.log(`[GEMINI_CALL_1] Sending request to model...`);
            
            // Use the native SDK generateContent API
            const model = getGeminiModel({ modelName });
            let result = await model.generateContent({
                model: modelName,
                systemInstruction: createSystemPrompt(currentLanguage),
                contents: [
                    ...history,
                    { role: 'user', parts: [{ text: userMessage }] }
                ],
                config: {
                    tools: [toolsConfig],
                    generationConfig: {
                        temperature: modelConfig.temperature
                    }
                }
            });
            
            // The result structure has candidates array, not a response property
            if (!result.candidates || result.candidates.length === 0) {
                throw new Error('No candidates in response');
            }
            
            const candidate = result.candidates[0];
            let content = candidate.content;
            
            // Enhanced logging for response analysis
            const functionCalls = content.parts && content.parts.some(part => part.functionCall) 
                ? content.parts.filter(part => part.functionCall).map(part => part.functionCall)
                : [];
            console.log('[GEMINI_RESPONSE_1] Raw model response received.');
            console.log(`[GEMINI_RESPONSE_1] Parsed Function Calls: ${JSON.stringify(functionCalls, null, 2)}`);
            
            // Check for function calls and handle tool execution loop
            if (content.parts && content.parts.some(part => part.functionCall)) {
                const functionCallParts = content.parts.filter(part => part.functionCall);
                logger.info({ msg: 'Function calls detected', count: functionCallParts.length, functions: functionCallParts.map(fc => fc.functionCall.name) });
                
                const functionResponseParts = [];
                
                // Execute all function calls
                for (const part of functionCallParts) {
                    const functionCall = part.functionCall;
                    const functionName = functionCall.name;
                    const functionArgs = functionCall.args;
                    
                    // Enhanced logging for tool execution
                    console.log(`[TOOL_EXEC] Attempting to execute tool: "${functionName}"`);
                    console.log(`[TOOL_EXEC] Arguments: ${JSON.stringify(functionArgs, null, 2)}`);
                    
                    logger.info({ msg: `Executing function: ${functionName}`, args: functionArgs });
                    
                    if (toolFunctions[functionName]) {
                        try {
                            const functionResult = await toolFunctions[functionName](functionArgs);
                            
                            // Enhanced logging for tool result
                            console.log(`[TOOL_RESULT] Raw result from tool "${functionName}": ${JSON.stringify(functionResult, null, 2)}`);
                            
                            functionResponseParts.push({
                                functionResponse: {
                                    name: functionName,
                                    response: functionResult
                                }
                            });
                        } catch (error) {
                            logger.error({ msg: `Error executing function ${functionName}`, error: error.message });
                            functionResponseParts.push({
                                functionResponse: {
                                    name: functionName,
                                    response: { error: `Error executing ${functionName}: ${error.message}` }
                                }
                            });
                        }
                    } else {
                        logger.error({ msg: `Unknown function: ${functionName}` });
                        functionResponseParts.push({
                            functionResponse: {
                                name: functionName,
                                response: { error: `Unknown function: ${functionName}` }
                            }
                        });
                    }
                }
                
                // Enhanced logging for second Gemini call
                console.log('[GEMINI_CALL_2] Sending tool results back to model for final response.');
                
                // Send function responses back to the model
                result = await model.generateContent({
                    model: modelName,
                    systemInstruction: createSystemPrompt(currentLanguage),
                    contents: [
                        ...history,
                        { role: 'user', parts: [{ text: userMessage }] },
                        { role: 'model', parts: content.parts },
                        { role: 'user', parts: functionResponseParts }
                    ],
                    config: {
                        tools: [toolsConfig],
                        generationConfig: {
                            temperature: modelConfig.temperature
                        }
                    }
                });
                
                if (!result.candidates || result.candidates.length === 0) {
                    throw new Error('No candidates in function response');
                }
                content = result.candidates[0].content;
            }
            
            // Extract text from content parts
            const responseText = content.parts
                .filter(part => part.text)
                .map(part => part.text)
                .join('');
            
            // Enhanced logging for final output
            console.log(`[AGENT_OUTPUT] "${responseText}"`);
            
            logger.info({ msg: `Model ${modelName} succeeded`, response_length: responseText.length });
            
            // Create new history with language state preserved
            const newHistory = [
                ...updatedChatHistory,
                { role: 'user', parts: [{ text: userMessage }] },
                { role: 'model', parts: [{ text: responseText }] },
            ];
            
            // Ensure language state is preserved in the new history
            if (newHistory.length > 0 && shouldSwitchLanguage) {
                newHistory[0]._languageState = { current_language: currentLanguage };
            }
            
            return { text: responseText, history: newHistory };
            
    } catch (error) {
        logger.error({ msg: `Model ${modelName} failed`, error: error.message });
        
        const geminiErrorInfo = handleGeminiError(error, { language: currentLanguage, includeRetryInfo: true });
        const errorLog = createGeminiErrorLog(error, {
            operation: 'llm_chat',
            userMessage: userMessage.substring(0, 100),
            chatHistoryLength: updatedChatHistory.length,
            lastModelAttempted: modelName
        });

        if (errorLog.level === 'warn') {
            logger.warn(errorLog);
        } else {
            logger.error(errorLog);
        }
        
        let responseText = geminiErrorInfo.userMessage;
        if (geminiErrorInfo.isTemporary && geminiErrorInfo.retryMessage) {
            responseText += ' ' + geminiErrorInfo.retryMessage;
        }
        
        return {
            text: responseText,
            history: updatedChatHistory,
            isTemporary: geminiErrorInfo.isTemporary,
            errorType: geminiErrorInfo.errorType
        };
    }
}

/**
 * Simple query function for programmatic LLM calls (like enrichment)
 * Uses lightweight prompt to reduce token usage
 */
async function invokeSimpleQuery(promptText) {
    try {
        const model = getGeminiModel({ modelName: 'gemini-2.5-flash' });
        const result = await model.generateContent({
            systemInstruction: "You are a helpful assistant that responds accurately and concisely. If the user asks for JSON, provide only the valid JSON object and nothing else.",
            generationConfig: {
                temperature: 0.1
            },
            contents: [{ role: 'user', parts: [{ text: promptText }] }]
        });
        
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('No candidates in response');
        }
        
        const content = result.candidates[0].content;
        return content.parts
            .filter(part => part.text)
            .map(part => part.text)
            .join('');
    } catch (error) {
        console.error('Error in invokeSimpleQuery:', error);
        return JSON.stringify({ error: `Failed to process simple query: ${error.message}` });
    }
}

module.exports = { sendMessage, invokeSimpleQuery };