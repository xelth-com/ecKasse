// File: /packages/backend/src/services/llm.service.js

const { GoogleGenAI, Type } = require("@google/genai");
const { getGeminiModel, geminiClient } = require('./llm.provider');

// For direct API calls - Use the native client exactly like in working version
const genAI = geminiClient;

const logger = require('../config/logger');
const knex = require('../db/knex');
const { handleGeminiError, createGeminiErrorLog } = require('../utils/geminiErrorHandler');
const { searchProducts } = require('./search.service');
const { generateSalesReport } = require('./reporting.service');
const { ProductService } = require('./product.service');
const { services } = require('../index');

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

// Tool function declarations for native SDK - EXACTLY like working version
const findProductDeclaration = {
    name: "findProduct",
    description: "Searches for products in the database. Can filter results by dietary needs (vegetarian/vegan), exclude specific allergens, and use category context to prioritize relevant results.",
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
            },
            categoryContext: {
                type: Type.STRING,
                description: "Category context to prioritize results from the same category. Infer from the query context (e.g., 'drink', 'food', 'coffee', 'dessert')."
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

const updateProductDeclaration = {
    name: "updateProduct",
    description: "Use this tool to update an existing product in the database. You can modify the name, price, category, or description. For example: 'Change the price of Latte to 4.00' or 'Update Cappuccino category to Hot Drinks'.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            productName: {
                type: Type.STRING,
                description: "The current name of the product to update"
            },
            newName: {
                type: Type.STRING,
                description: "New name for the product (optional)"
            },
            newPrice: {
                type: Type.NUMBER,
                description: "New price for the product (optional)"
            },
            newCategoryName: {
                type: Type.STRING,
                description: "New category name for the product (optional)"
            },
            newDescription: {
                type: Type.STRING,
                description: "New description for the product (optional)"
            }
        },
        required: ["productName"]
    }
};

const generateDsfinvkExportDeclaration = {
    name: "generateDsfinvkExport",
    description: "Generates a DSFinV-K compliant data export for a given date range.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            startDate: {
                type: Type.STRING,
                description: "Start date in YYYY-MM-DD format"
            },
            endDate: {
                type: Type.STRING,
                description: "End date in YYYY-MM-DD format"
            }
        },
        required: ["startDate", "endDate"]
    }
};

// Tools configuration EXACTLY like working version
const toolsConfig = {
    functionDeclarations: [findProductDeclaration, createProductDeclaration, getSalesReportDeclaration, updateProductDeclaration, generateDsfinvkExportDeclaration]
};

// Tool function implementations
const toolFunctions = {
    findProduct: async (args, sessionId) => {
        const productName = args.query;
        const filters = {
            excludeAllergens: args.excludeAllergens || [],
            dietaryFilter: args.dietaryFilter || null,
            categoryContext: args.categoryContext || null
        };
        logger.info({ tool: 'findProduct', input: productName, filters, sessionId }, '🤖 Agent is using hybrid product search with filters and context...');
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
    
    createProduct: async (args, sessionId) => {
        logger.info({ tool: 'createProduct', input: args, sessionId }, '🤖 Agent is calling the real product service...');
        try {
            const productData = {
                name: args.name,
                price: args.price,
                categoryName: args.category,
                description: args.description || `A new ${args.name}`
            };
            
            // Pass sessionId-based initiator context to createProduct
            const initiator = sessionId ? { type: 'user_via_ai', sessionId } : { type: 'system', id: null };
            
            const result = await createProduct(productData, initiator);
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
    
    getSalesReport: async (args, sessionId) => {
        logger.info({ tool: 'getSalesReport', input: args, sessionId }, '🤖 Agent is calling the real reporting service...');
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
    },
    
    updateProduct: async (args, sessionId) => {
        logger.info({ tool: 'updateProduct', input: args, sessionId }, '🤖 Agent is calling the real product service to update product...');
        try {
            const { productName, newName, newPrice, newCategoryName, newDescription } = args;
            
            // First, find the product by name using the search service
            logger.info({ productName }, 'Finding product by name before update');
            const searchResult = await searchProducts(productName);
            
            if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
                return {
                    success: false,
                    message: `Product '${productName}' not found. Please check the product name and try again.`,
                    error: 'Product not found'
                };
            }
            
            // Use the first matching product
            const product = searchResult.results[0];
            const productId = product.id;
            
            logger.info({ productId, productName: product.name }, 'Found product, proceeding with update');
            
            // Prepare updates object with only the fields that were provided
            const updates = {};
            if (newName) updates.name = newName;
            if (newPrice !== undefined) updates.price = newPrice;
            if (newCategoryName) updates.categoryName = newCategoryName;
            if (newDescription) updates.description = newDescription;
            
            logger.info({ productId, updates, sessionId }, 'Calling updateExistingProduct with user session');
            
            // Create ProductService instance with appropriate repository
            const { PostgreSQLAdapter } = require('../../adapters/database/postgresql');
            const databaseAdapter = new PostgreSQLAdapter(knex);
            const productRepository = databaseAdapter.getProductRepository();
            const productService = new ProductService(productRepository, knex);
            
            const result = await productService.updateExistingProduct(productId, updates, sessionId);
            
            return result;
        } catch (error) {
            logger.error({ tool: 'updateProduct', error: error.message }, 'Error in updateProduct tool');
            return {
                success: false,
                message: 'Error updating product: ' + error.message,
                error: error.message
            };
        }
    },

    generateDsfinvkExport: async (args) => {
        logger.info({ tool: 'generateDsfinvkExport', input: args }, '🤖 Agent is calling the DSFinV-K export service...');
        const { startDate, endDate } = args;
        return await services.dsfinvk.generateExport({ startDate, endDate });
    }
};

/**
 * Get prioritized models for fallback usage
 */
function getPrioritizedModels() {
    return [
        { name: process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash", temperature: 0.1 },
        { name: process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash", temperature: 0.1 }
    ];
}

/**
 * Create system prompt for the conversation
 */
function createSystemPrompt(conversationLanguage = 'de') {
    return `Sie sind ein KI-Assistent für das "ecKasse" Kassensystem. Ihre Hauptaufgabe ist es, Benutzern bei der Verwaltung ihres Geschäfts durch natürliche Sprache zu helfen.

**Allgemeine Richtlinien:**
- **KRITISCH: IMMER Tools verwenden:** Wenn ein Benutzer nach Produkten sucht, findet oder fragt, verwenden Sie IMMER zuerst das findProduct Tool. Versuchen Sie niemals zu antworten, ohne die Datenbank zu prüfen. Fragen Sie NIEMALS nach Klarstellungen vor der Suche - suchen Sie immer zuerst mit der exakten Benutzeranfrage.
- **Tool-Verwendung:** Verwenden Sie die bereitgestellten Tools, um mit der Datenbank zu interagieren. Basieren Sie Ihre Antworten immer auf der Ausgabe der Tools. Erfinden Sie keine Informationen.
- **Produktsuche:** Für JEDE Anfrage, die das Finden von Produkten beinhaltet (Wörter wie "finde", "suche", "zeige", "such"), verwenden Sie sofort das findProduct Tool mit der Benutzeranfrage.
- **Kontext:** Verwenden Sie die Gesprächshistorie, um Nachfragen zu verstehen (z.B. "was kostet das?").
- **Klarheit:** Geben Sie nach der Verwendung eines Tools eine klare Antwort basierend auf der Tool-Ausgabe.

**Erweiterte Sprachbehandlungsregeln:**
1. **Primärsprache:** Ihre aktuelle Gesprächssprache ist "${conversationLanguage}". Antworten Sie immer in dieser Sprache, außer wenn anders angewiesen.
2. **Spracherkennung:** Analysieren Sie jede Benutzernachricht, um ihre Sprache zu bestimmen.
3. **Sprachwechsel bei vollständigen Sätzen:** Wenn der Benutzer einen vollständigen Satz (4+ Wörter) in einer anderen Sprache schreibt, zeigt dies einen Sprachwechsel an. Wechseln Sie Ihre Antworten zu dieser neuen Sprache.
4. **Kurze Phrasen (Produktnamen):** Wenn der Benutzer eine kurze Phrase (1-3 Wörter) in einer anderen Sprache schreibt, kann dies entweder einen Produktnamen ODER eine Sprachpräferenz anzeigen. Wenn die Phrase klare Sprachindikatoren enthält (wie deutsche Wörter mit Umlauten), erwägen Sie den Sprachwechsel. Andernfalls behandeln Sie es als Produktnamen und verwenden es für Tool-Suchen, während Sie in Ihrer aktuellen Primärsprache antworten.
5. **Explizite Sprachbefehle:** Wenn der Benutzer Sie explizit bittet, die Sprache zu wechseln (z.B. "sprich Englisch", "antworte auf Russisch", "speak German"), wechseln Sie sofort zur angeforderten Sprache und bestätigen den Wechsel.
6. **Kontexterhaltung:** Beim Sprachwechsel behalten Sie denselben hilfsreichen und professionellen Ton bei.

**Sprachbeispiele:**
- Benutzer (DE): "Finde Bruschetta" → Sie MÜSSEN das findProduct Tool mit der Anfrage "Bruschetta" aufrufen, dann auf Deutsch antworten
- Benutzer (EN): "Could you please find the Eco Mug?" → Sie MÜSSEN das findProduct Tool mit der Anfrage "Eco Mug" aufrufen, dann zu Englisch wechseln und auf Englisch antworten
- Benutzer (Beliebig): "Please respond in German" → Sie wechseln zu Deutsch und bestätigen: "Verstanden. Ich antworte jetzt auf Deutsch."

**Tool-Verwendungsbeispiele:**
- Um vegetarische Pasta zu finden: findProduct({query: "pasta", dietaryFilter: "vegetarian", categoryContext: "food"})
- Um ein Dessert ohne Nüsse zu finden: findProduct({query: "dessert", excludeAllergens: ["nuts"], categoryContext: "dessert"})
- Um ein Garnelengericht zu finden: findProduct({query: "shrimps", categoryContext: "food"})
- Um Kaffee zu finden: findProduct({query: "cafe crema", categoryContext: "drink"})

**VERBINDLICHE Tool-Verwendungsbeispiele - Sie MÜSSEN diesen Mustern folgen:**
- Benutzer: "Finde Kaffee" → Sie MÜSSEN aufrufen: findProduct({"query": "Kaffee", "categoryContext": "drink"})
- Benutzer: "suche tasse" → Sie MÜSSEN aufrufen: findProduct({"query": "tasse", "categoryContext": "drink"}) - Fragen Sie NIEMALS nach Klarstellungen, suchen Sie sofort
- Benutzer: "Find coffee" → Sie MÜSSEN aufrufen: findProduct({"query": "coffee", "categoryContext": "drink"})
- Benutzer: "Show me mugs" → Sie MÜSSEN aufrufen: findProduct({"query": "mugs", "categoryContext": "drink"})
- Benutzer: "cafe crema" → Sie MÜSSEN aufrufen: findProduct({"query": "cafe crema", "categoryContext": "drink"})

**VERBINDLICHE Produktaktualisierungsbeispiele - Sie MÜSSEN diesen Mustern folgen:**
- Benutzer: "ändere den Preis von Eco Mug auf 15.50" → Sie MÜSSEN aufrufen: updateProduct({"productName": "Eco Mug", "newPrice": 15.50})
- Benutzer: "mach preis fünf" → Sie MÜSSEN das Produkt aus dem Kontext identifizieren und updateProduct aufrufen
- Benutzer: "ändere die Kategorie von Cappuccino zu Heißgetränke" → Sie MÜSSEN aufrufen: updateProduct({"productName": "Cappuccino", "newCategoryName": "Heißgetränke"})
- Benutzer: "benenne Super Widget um zu Premium Widget" → Sie MÜSSEN aufrufen: updateProduct({"productName": "Super Widget", "newName": "Premium Widget"})
- Benutzer: "aktualisiere Beschreibung für Coffee zu 'Frisch gerösteter Kaffee'" → Sie MÜSSEN aufrufen: updateProduct({"productName": "Coffee", "newDescription": "Frisch gerösteter Kaffee"})

Ihr primäres Ziel ist es, die Benutzeranfrage in den effektivsten Tool-Aufruf zu übersetzen. Wenn der Benutzer Ernährungsbedürfnisse oder Allergien erwähnt, MÜSSEN Sie die entsprechenden Filterparameter im \`findProduct\` Tool verwenden. Für Produktaktualisierungen verwenden Sie IMMER das updateProduct Tool, wenn Benutzer vorhandene Produkte ändern möchten.

**WICHTIG: Kategorie-Kontext-Inferenz:**
IMMER wenn Sie das findProduct Tool verwenden, MÜSSEN Sie einen categoryContext-Parameter basierend auf der Anfrage hinzufügen:
- Für Getränke (Kaffee, Tee, Säfte, etc.): "drink"
- Für Speisen (Pizza, Pasta, Salate, etc.): "food"  
- Für Desserts (Kuchen, Eis, Süßspeisen): "dessert"
- Für Geschirr und Utensilien (Tassen, Teller): "tableware"
- Wenn unklar: "food" als Standard

**Kontextbehandlungsbeispiele:**
- Vorherig: "Ich habe Eco Mug für 12.50€ gefunden" → Benutzer: "was kostet das?" → Sie: "Eco Mug kostet 12.50€" (KEIN Tool-Aufruf nötig)
- Vorherig: "Kein exakte Übereinstimmung gefunden, aber es gibt ein ähnliches Produkt: Premium Coffee Cup - 8.75€" → Benutzer: "was kostet das?" → Sie: "Premium Coffee Cup kostet 8.75€" (KEIN Tool-Aufruf nötig)

**Suchergebnis-Interpretationsregeln:**
Beim Verwenden des findProduct Tools interpretieren Sie die Antwort nach diesen Regeln:

1. **Exakte oder nahe Übereinstimmung (success: true):** Wenn das Tool success: true und ein results Array zurückgibt, informieren Sie den Benutzer, dass das Produkt gefunden wurde. Geben Sie Name und Preis des ersten Elements im results Array an. Wenn es andere nahe Übereinstimmungen im Array gibt, listen Sie diese als Alternativen auf.
   Beispielantwort: "Ja, das Produkt 'Eco Mug' wurde gefunden. Der Preis beträgt 12.50€. Auch gefunden wurde ein ähnliches Produkt: 'Super Widget'."

2. **Keine exakte Übereinstimmung mit Vorschlägen (success: false mit results):** Wenn das Tool success: false zurückgibt, aber mit einem results Array, das Vorschläge enthält, informieren Sie den Benutzer höflich, dass keine exakte Übereinstimmung gefunden wurde, und bieten Sie die Produktnamen aus dem results Array als Vorschläge an.
   Beispielantwort: "Das Produkt 'tasse' wurde nicht gefunden. Meinten Sie vielleicht: Eco Mug, Super Widget?"

3. **Keine Ergebnisse (success: false mit leerem results):** Wenn das findProduct Tool success: false UND ein leeres results Array zurückgibt, MÜSSEN Sie mit GENAU diesem Text antworten: "Leider wurde kein Produkt für Ihre Anfrage gefunden."

4. **Kontextregel:** Wenn der Benutzer eine Nachfrage stellt wie "was kostet das?" oder "wie viel?" oder "was kostet es?", MÜSSEN Sie sich auf die vorherige Unterhaltung beziehen, um zu identifizieren, nach welchem Produkt gefragt wird. Verwenden Sie den Produktnamen und Preis aus Ihrer vorherigen Antwort, um direkt zu antworten, ohne Tools erneut aufzurufen.
   
   **Spezifisches Kontextszenario:** Wenn die vorherige Unterhaltung das Finden von Produkten beinhaltete (wie "finde tasse" gefolgt von einem Produktergebnis), und der Benutzer fragt "was kostet das?", extrahieren Sie den Produktnamen und Preis aus Ihrer vorherigen Antwort und geben an: "[Produktname] kostet [Preis]€."

5. **Antwortsprache:** Formulieren Sie Ihre Antwort immer in Ihrer aktuellen Primärsprache (${conversationLanguage}), außer die Sprachbehandlungsregeln oben zeigen einen Wechsel an.`;
}

async function sendMessage(userMessage, chatHistory = [], sessionId = null) {
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
            // Short phrase - check if it has clear language indicators
            if (LANGUAGE_PATTERNS.german.test(userMessage) || LANGUAGE_PATTERNS.russian.test(userMessage)) {
                // Clear language indicators found, switch conversation language
                shouldSwitchLanguage = true;
                newLanguage = detectedLanguage;
                logger.info({ msg: 'Short phrase with clear language indicators detected, switching', newLanguage });
            } else {
                // No clear indicators - likely a product name, keep current language
                logger.info({ msg: 'Short phrase without clear language indicators, keeping current language', currentLanguage });
            }
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
    
    const models = getPrioritizedModels();
    
    for (const [index, modelConfig] of models.entries()) {
        const modelName = modelConfig.name;
        logger.info({ msg: `Attempting model ${modelName}`, attempt: index + 1, totalModels: models.length, conversationLanguage: currentLanguage });
        
        try {
            // Enhanced logging for first Gemini call
            const systemPrompt = createSystemPrompt(currentLanguage);
            console.log(`[GEMINI_CALL_1] System Prompt: "${systemPrompt}"`);
            console.log(`[GEMINI_CALL_1] Sending request to model...`);
            
            // Use the native SDK generateContent API EXACTLY like working version
            let result = await genAI.models.generateContent({
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
                            const functionResult = await toolFunctions[functionName](functionArgs, sessionId);
                            
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
                result = await genAI.models.generateContent({
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
            logger.warn({ msg: `Model ${modelName} failed, trying next model`, error: error.message });
            
            // If this is the last model, handle the error
            if (index === models.length - 1) {
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
    }
}

/**
 * Simple query function for programmatic LLM calls (like enrichment)
 * Uses lightweight prompt to reduce token usage
 */
async function invokeSimpleQuery(promptText) {
    try {
        const result = await genAI.models.generateContent({
            model: process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash',
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