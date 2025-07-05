// File: /packages/backend/src/services/llm.service.js

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { AgentExecutor, createReactAgent } = require("langchain/agents");
const { DynamicTool } = require("@langchain/core/tools");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");

// Подключаем наш логгер и настроенный Knex
const logger = require('../config/logger');
const knex = require('../db/knex'); // Убедитесь, что knexfile.js настроен правильно

const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-1.5-flash", // Используем указанную модель
    temperature: 0.1,
});

const tools = [
    new DynamicTool({
        name: "findProduct",
        description: "Поиск товара в базе данных POS по его названию. Возвращает полную информацию о товаре в формате JSON.",
        func: async (productName) => {
            try {
                const product = await knex('items')
                    .whereRaw("json_extract(display_names, '$.menu.de') LIKE ?", [`%${productName}%`])
                    .first();
                if (product) {
                    return `Найден товар: ${JSON.stringify(product)}`;
                }
                return `Товар с названием '${productName}' не найден.`;
            } catch (error) {
                logger.error({ msg: "Ошибка в инструменте findProduct", error });
                return "Произошла ошибка при поиске товара.";
            }
        },
    }),
    new DynamicTool({
        name: "createProduct",
        description: "Создание нового товара в базе данных POS. Требуются параметры: name (название), price (цена) и categoryName (название категории).",
        func: async (input) => {
             try {
                const { name, price, categoryName } = JSON.parse(input);
                if (!name || !price || !categoryName) {
                    return "Ошибка: для создания товара необходимы 'name', 'price' и 'categoryName'.";
                }

                const category = await knex('categories').whereRaw("json_extract(category_names, '$.de') = ?", [categoryName]).first();
                if (!category) {
                    return `Категория '${categoryName}' не найдена. Пожалуйста, сначала создайте категорию с помощью инструмента createCategory.`;
                }

                const posDeviceId = 1; // Предполагаем, что работаем с Kассой №1

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
                return "Ошибка при создании товара. Убедитесь, что вы передали корректный JSON с полями 'name', 'price' и 'categoryName'.";
            }
        },
    }),
    new DynamicTool({
        name: "createCategory",
        description: "Создание новой категории товаров. Требуются параметры: name (название) и type ('food' или 'drink').",
        func: async (input) => {
            try {
                const { name, type } = JSON.parse(input);
                 if (!name || !type) {
                    return "Ошибка: для создания категории необходимы 'name' и 'type'.";
                }

                const posDeviceId = 1; // Предполагаем, что работаем с Kассой №1
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
                return "Ошибка при создании категории. Убедитесь, что вы передали корректный JSON с полями 'name' и 'type'.";
            }
        },
    }),
];

const SYSTEM_PROMPT = `Вы - AI-ассистент кассовой системы ecKasse.
Ваша задача - помогать пользователю управлять его рестораном или магазином через диалог.
- Всегда используйте доступные инструменты для выполнения задач, связанных с базой данных (поиск, создание товаров/категорий).
- Если для выполнения задачи не хватает информации (например, при создании товара не указана категория), вежливо запросите её у пользователя.
- Давайте четкие и подтверждающие ответы после успешного выполнения операций.
- Если вы не знаете, как выполнить запрос, сообщите об этом.

TOOLS:
{tools}

Используйте следующий формат:

Question: вопрос пользователя
Thought: подумайте о том, что вам нужно сделать
Action: действие из [{tool_names}]
Action Input: параметры для действия
Observation: результат действия
... (эта последовательность Thought/Action/Action Input/Observation может повторяться)
Thought: теперь я знаю окончательный ответ
Final Answer: окончательный ответ пользователю`;

const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
]);

async function createAgent() {
    const agent = await createReactAgent({
        llm,
        tools,
        prompt,
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: process.env.NODE_ENV !== 'production', // Включаем подробное логирование для разработки
    });

    return agentExecutor;
}

async function sendMessage(userMessage, chatHistory = []) {
    try {
        logger.info({ msg: 'Сообщение получено сервисом LangChain', message: userMessage });

        const agentExecutor = await createAgent();

        const result = await agentExecutor.invoke({
            input: userMessage,
            chat_history: chatHistory.map(msg => ({
                role: msg.role,
                content: msg.parts.map(part => part.text).join(''),
            })),
        });

        // Обновляем историю для отправки на клиент
        const newHistory = [
            ...chatHistory,
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: result.output }] },
        ];
        
        return {
            text: result.output,
            history: newHistory,
        };
    } catch (error) {
        logger.error({ msg: 'Ошибка в LangChain сервисе', error: error.message, stack: error.stack });
        return {
            text: 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.',
            history: chatHistory,
        };
    }
}

module.exports = {
    sendMessage,
};