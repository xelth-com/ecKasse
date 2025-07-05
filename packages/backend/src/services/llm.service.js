// File: /packages/backend/src/services/llm.service.js

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { DynamicTool } = require("@langchain/core/tools");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");

const logger = require('../config/logger');
const knex = require('../db/knex');

const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-1.5-flash",
    temperature: 0.1,
});

const tools = [
    new DynamicTool({
        name: "listAllProducts",
        description: "Получение списка всех товаров из базы данных. Используй, когда пользователь просит показать все товары или спрашивает 'что у нас есть?'.",
        func: async () => {
            logger.info({ tool: 'listAllProducts' }, '🤖 Агент использует инструмент для листинга всех товаров...');
            try {
                const products = await knex('items').select('*').limit(20);
                return products.length > 0 ? `Вот список найденных товаров: ${JSON.stringify(products)}` : "В базе данных пока нет ни одного товара.";
            } catch (error) {
                logger.error({ msg: "Ошибка в инструменте listAllProducts", error });
                return "Произошла ошибка при получении списка товаров.";
            }
        },
    }),
    new DynamicTool({
        name: "findProduct",
        description: "Поиск конкретного товара в базе данных POS по его названию с помощью полнотекстового поиска.",
        func: async (toolInput) => {
            const productName = (typeof toolInput === 'object' && toolInput.input) ? toolInput.input : toolInput;
            logger.info({ tool: 'findProduct', input: productName }, '🤖 Агент использует FTS5 для поиска товара...');
            try {
                // Используем FTS5 для поиска. Звездочка (*) означает поиск по префиксу.
                const ftsQuery = `"${productName}"*`;
                const results = await knex.raw("SELECT rowid as id FROM items_fts WHERE items_fts MATCH ?", [ftsQuery]);

                if (results.length > 0) {
                    const productIds = results.map(r => r.id);
                    const products = await knex('items').whereIn('id', productIds);
                    return `Найдены товары: ${JSON.stringify(products)}`;
                }
                
                return `Товар, похожий на '${productName}', не найден.`;
            } catch (error) {
                logger.error({ msg: "Ошибка в инструменте findProduct (FTS)", error });
                return "Произошла ошибка при поиске товара.";
            }
        },
    }),
    new DynamicTool({
        name: "createProduct",
        description: "Создание нового товара в базе данных. Входные данные: name, price, categoryName.",
        func: async (input) => {
            logger.info({ tool: 'createProduct', input: input }, '🤖 Агент использует инструмент создания товара...');
            try {
                const { name, price, categoryName } = (typeof input === 'string') ? JSON.parse(input) : input;
                if (!name || !price || !categoryName) return "Ошибка: для создания товара необходимы 'name', 'price' и 'categoryName'.";
                const category = await knex('categories').whereRaw("json_extract(category_names, '$.de') = ?", [categoryName]).first();
                if (!category) return `Категория '${categoryName}' не найдена. Пожалуйста, сначала создайте категорию.`;
                const posDeviceId = 1;
                const newItem = {
                    pos_device_id: posDeviceId,
                    associated_category_unique_identifier: category.id,
                    display_names: JSON.stringify({ menu: { de: name }, button: { de: name.slice(0, 12) }, receipt: { de: name } }),
                    item_price_value: parseFloat(price),
                    item_flags: JSON.stringify({ is_sellable: true, has_negative_price: false }),
                    audit_trail: JSON.stringify({ created_at: new Date().toISOString(), created_by: 'llm_agent', version: 1 }),
                };
                const [createdItem] = await knex('items').insert(newItem).returning('*');
                return `Товар '${name}' успешно создан с ID ${createdItem.id} в категории '${categoryName}'.`;
            } catch (error) {
                logger.error({ msg: "Ошибка в инструменте createProduct", error, input });
                return "Ошибка при создании товара. Убедитесь, что вы передали корректные параметры.";
            }
        },
    }),
    new DynamicTool({
        name: "createCategory",
        description: "Создание новой категории товаров. Входные данные: name, type ('food' или 'drink').",
        func: async (input) => {
            logger.info({ tool: 'createCategory', input: input }, '🤖 Агент использует инструмент создания категории...');
            try {
                const { name, type } = (typeof input === 'string') ? JSON.parse(input) : input;
                if (!name || !type) return "Ошибка: для создания категории необходимы 'name' и 'type'.";
                const posDeviceId = 1;
                const newCategory = {
                    pos_device_id: posDeviceId,
                    category_names: JSON.stringify({ de: name }),
                    category_type: type,
                    audit_trail: JSON.stringify({ created_at: new Date().toISOString(), created_by: 'llm_agent', version: 1 }),
                };
                const [createdCategory] = await knex('categories').insert(newCategory).returning('*');
                return `Категория '${name}' успешно создана с ID ${createdCategory.id}.`;
            } catch(error) {
                logger.error({ msg: "Ошибка в инструменте createCategory", error, input });
                return "Ошибка при создании категории. Убедитесь, что вы передали корректные параметры.";
            }
        },
    }),
];

let agentExecutorPromise;

function getAgentExecutor() {
    if (!agentExecutorPromise) {
        agentExecutorPromise = (async () => {
            const SYSTEM_PROMPT = `Вы - AI-ассистент кассовой системы ecKasse. Твоя задача - помогать пользователю управлять его рестораном или магазином через диалог. Используй доступные инструменты для выполнения задач. Если для выполнения задачи не хватает информации, вежливо запроси её у пользователя. Давай четкие и подтверждающие ответы после успешного выполнения операций. Отвечай на том же языке, на котором задан вопрос пользователя.`;
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
    try {
        logger.info({ msg: 'Сообщение получено сервисом LangChain', message: userMessage });
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
        logger.error({ msg: 'Ошибка в LangChain сервисе', error: error.message, stack: error.stack });
        return {
            text: 'Извините, произошла ошибка при обработке вашего запроса.',
            history: chatHistory,
        };
    }
}

module.exports = { sendMessage };