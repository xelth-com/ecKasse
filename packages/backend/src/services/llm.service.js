// File: /packages/backend/src/services/llm.service.js

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { DynamicTool } = require("@langchain/core/tools");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");

const logger = require('../config/logger');
const knex = require('../db/knex');
const { handleGeminiError, createGeminiErrorLog } = require('../utils/geminiErrorHandler');
const { searchProducts } = require('./search.service');

const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-1.5-flash",
    temperature: 0.1,
});

const tools = [
    new DynamicTool({
        name: "findProduct",
        description: "Use this tool to find any product in the POS database. It performs an advanced hybrid search that understands synonyms, concepts, and corrects typos. Input should be the user's query for a product, for example: 'eco-friendly cup', 'widget', or even a typo like 'supr widge'. The tool returns a structured JSON object with the search results.",
        func: async (toolInput) => {
            const productName = (typeof toolInput === 'object' && toolInput.input) ? toolInput.input : toolInput;
            logger.info({ tool: 'findProduct', input: productName }, '🤖 Agent is using hybrid product search...');
            try {
                const searchResult = await searchProducts(productName);
                logger.info({ searchMetadata: searchResult.metadata }, `Search complete: ${searchResult.metadata?.searchMethod}`);
                // Return structured JSON for the agent to interpret
                return JSON.stringify(searchResult);
            } catch (error) {
                logger.error({ msg: "Error in findProduct tool (hybrid search)", error });
                return JSON.stringify({ 
                    success: false, 
                    message: "An error occurred during the search.",
                    results: [],
                    metadata: { error: error.message }
                });
            }
        },
    }),
    // Здесь могут быть другие инструменты, например, createProduct...
];

let agentExecutorPromise;

function getAgentExecutor() {
    if (!agentExecutorPromise) {
        agentExecutorPromise = (async () => {
            // Enhanced system prompt with detailed search result interpretation rules
            const SYSTEM_PROMPT = `You are an AI assistant for the "ecKasse" POS system. Your primary role is to help users manage their store through natural language.

**General Guidelines:**
- **Tool Usage:** Use the provided tools to interact with the database. Always base your answers on the output of the tools. Do not make up information.
- **Context:** Use the conversation history to understand follow-up questions (e.g., "what is its price?").
- **Language:** Always respond in the same language as the user's last message.
- **Clarity:** If you don't have enough information to use a tool, ask the user for clarification. After a successful operation, provide a clear confirmation.

**Search Result Interpretation Rules:**
When using the findProduct tool, interpret the JSON response according to these rules:

1. **Exact or Close Match (success: true):** If the tool returns { success: true, results: [...] }, inform the user that the product was found. State the name and price of the first item in the results array. If there are other close matches in the array, list them as alternatives.
   Example response: "Да, товар 'Eco Mug' найден. Его цена 12.50€. Также найден похожий товар: 'Super Widget'."

2. **No Exact Match with Suggestions (success: false with results):** If the tool returns { success: false, results: [...] } (meaning no close match was found, but there are semantic suggestions), politely inform the user that an exact match was not found and offer the product names from the results array as suggestions.
   Example response: "Товар 'чашка' не найден. Возможно, вы имели в виду: Eco Mug, Super Widget?"

3. **No Results (success: false with empty results):** If the tool returns { success: false, results: [] }, simply state that the product could not be found.
   Example response: "К сожалению, товар по вашему запросу не найден."

4. **Context Rule:** If the user asks a follow-up question like "what is its price?" or "how much?", use the context from the previous tool call to answer about the last product discussed.

5. **Language Rule:** Always formulate the final answer in the same language as the user's last message.`;
            
            const prompt = ChatPromptTemplate.fromMessages([
                ["system", SYSTEM_PROMPT],
                new MessagesPlaceholder("chat_history"),
                ["human", "{input}"],
                new MessagesPlaceholder("agent_scratchpad"),
            ]);
            
            const agent = await createToolCallingAgent({ llm, tools, prompt });
            return new AgentExecutor({ agent, tools, verbose: process.env.NODE_ENV !== 'production' });
        })();
    }
    return agentExecutorPromise;
}

async function sendMessage(userMessage, chatHistory = []) {
    // Эта функция ДОЛЖНА использовать AgentExecutor для доступа к инструментам
    try {
        logger.info({ msg: 'Message received by LangChain service', message: userMessage });
        const executor = await getAgentExecutor();
        
        const history = chatHistory.map(msg => {
            const content = Array.isArray(msg.parts) ? msg.parts.map(p => p.text).join('') : msg.parts;
            return msg.role === 'user' ? new HumanMessage(content) : new AIMessage(content);
        });

        const result = await executor.invoke({ input: userMessage, chat_history: history });

        const newHistory = [
            ...chatHistory,
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: result.output }] },
        ];
        
        return { text: result.output, history: newHistory };
    } catch (error) {
        // Логика обработки ошибок остается прежней
        const geminiErrorInfo = handleGeminiError(error, { language: 'ru', includeRetryInfo: true });
        const errorLog = createGeminiErrorLog(error, {
            operation: 'llm_chat',
            userMessage: userMessage.substring(0, 100),
            chatHistoryLength: chatHistory.length
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
            history: chatHistory,
            isTemporary: geminiErrorInfo.isTemporary,
            errorType: geminiErrorInfo.errorType
        };
    }
}

module.exports = { sendMessage };