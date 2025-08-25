/**
 * eckasse Menu Parser with LLM Integration
 * 
 * Автоматически конвертирует отсканированные меню в OOP-POS-MDF формат
 * Поддерживает Google Gemini, OpenAI GPT, и Claude
 * 
 * Features:
 * - LLM для извлечения структурированных данных из изображений меню
 * - Автоматическое определение категорий и цен
 * - Многоязычная поддержка
 * - Валидация и коррекция данных
 * 
 * @author eckasse Development Team
 * @version 2.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const { getGeminiModel } = require('../application/llm.provider');

class MenuParserLLM {
  constructor(options = {}) {
    this.logger = winston.createLogger({
      level: options.logLevel || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/menu-parser.log' })
      ]
    });

    // Initialize LLM clients
    this.initializeLLMClients(options);
    
    this.defaultBusinessType = options.businessType || 'restaurant';
    this.defaultLanguage = options.defaultLanguage || 'de';
    this.supportedLanguages = options.supportedLanguages || ['de', 'en'];
    this.enableValidation = options.enableValidation !== false;
    
    // Menu parsing configuration
    this.parsingConfig = {
      maxRetries: 3,
      confidenceThreshold: 0.8,
      directImageProcessing: true,
      useMultipleModels: true,
      fallbackToManualReview: true
    };
  }

  initializeLLMClients(options) {
    // Google Gemini - use centralized provider
    this.gemini25Model = getGeminiModel({ modelName: process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash' });
    this.gemini20Model = getGeminiModel({ modelName: process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash' });
    
    console.log('Using Gemini through centralized provider');
  }

  /**
   * Главная функция парсинга меню - поддерживает файлы напрямую
   */
  async parseMenu(input, options = {}) {
    const requestId = uuidv4();
    this.logger.info('Starting menu parsing', { requestId, inputType: typeof input });

    try {
      let files = [];

      // Step 1: Prepare files for Gemini
      if (typeof input === 'string') {
        // Check if it's a file path
        try {
          await fs.access(input);
          files = [await this.prepareFileForGemini(input)];
          this.logger.info('File prepared for Gemini', { 
            requestId, 
            filePath: input,
            fileSize: files[0].size,
            mimeType: files[0].mimeType
          });
        } catch {
          // Not a file path, treat as direct text input
          this.logger.info('Input treated as direct text', { 
            requestId,
            textLength: input.length,
            textPreview: input.substring(0, 100)
          });
        }
      } else if (Array.isArray(input)) {
        // Multiple files - preserve order
        for (const [index, filePath] of input.entries()) {
          const file = await this.prepareFileForGemini(filePath);
          file.order = index;
          files.push(file);
        }
        this.logger.info('Multiple files prepared', { 
          requestId, 
          fileCount: files.length,
          files: files.map(f => ({ path: f.path, size: f.size, mimeType: f.mimeType, order: f.order }))
        });
      }

      // Step 2: Parse with LLM (direct file or text)
      const result = await this.parseWithLLM(files.length > 0 ? files : input, options, requestId);

      // Step 3: Convert to OOP-POS-MDF format
      const configuration = await this.convertToOOPPOSMDF(result, options);

      this.logger.info('Menu parsing completed successfully', {
        requestId,
        itemsFound: result.items?.length || 0,
        categoriesFound: result.categories?.length || 0,
        inputType: files.length > 0 ? 'files' : 'text'
      });

      return {
        success: true,
        requestId,
        configuration,
        metadata: {
          itemsFound: result.items?.length || 0,
          categoriesFound: result.categories?.length || 0,
          confidence: result.confidence || 0,
          language: options.language || this.defaultLanguage,
          processingTime: Date.now(),
          inputFiles: files.length > 0 ? files.map(f => ({ 
            path: f.path, 
            mimeType: f.mimeType, 
            size: f.size, 
            order: f.order 
          })) : null
        },
        rawData: {
          inputType: files.length > 0 ? 'files' : 'text',
          parsedData: result
        }
      };

    } catch (error) {
      this.logger.error('Menu parsing failed', { requestId, error: error.message });
      throw error;
    }
  }

  /**
   * Подготовка файла для отправки в Gemini
   */
  async prepareFileForGemini(filePath) {
    const path = require('path');

    // Read file as buffer
    const fileBuffer = await fs.readFile(filePath);
    const fileSize = fileBuffer.length;
    const fileExtension = path.extname(filePath).toLowerCase();

    // Determine MIME type based on extension
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.flv': 'video/x-flv',
      '.mpg': 'video/mpeg',
      '.mpeg': 'video/mpeg',
      '.wmv': 'video/x-ms-wmv',
      '.3gpp': 'video/3gpp',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.aiff': 'audio/aiff',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac'
    };

    const mimeType = mimeTypes[fileExtension] || 'application/octet-stream';

    // Check if file type is supported by Gemini
    const supportedTypes = Object.values(mimeTypes);
    if (!supportedTypes.includes(mimeType)) {
      throw new Error(`Unsupported file type: ${fileExtension}. Supported types: ${Object.keys(mimeTypes).join(', ')}`);
    }

    this.logger.info('File prepared for Gemini', {
      filePath,
      fileSize,
      mimeType,
      fileExtension
    });

    return {
      path: filePath,
      data: fileBuffer.toString('base64'),
      mimeType,
      size: fileSize,
      extension: fileExtension
    };
  }


  /**
   * Предварительная обработка текста меню
   */
  async preprocessMenuText(text) {
    // Log original text quality before preprocessing
    const originalLines = text.split('\n').filter(line => line.trim().length > 0);
    const originalCharCount = text.length;
    const originalWordCount = text.split(/\s+/).length;
    
    this.logger.info('Text preprocessing started', {
      originalTextLength: originalCharCount,
      originalLineCount: originalLines.length,
      originalWordCount: originalWordCount,
      textPreview: text.substring(0, 500) + (text.length > 500 ? '\n... (truncated)' : ''),
      sampleLines: originalLines.slice(0, 5)
    });

    // Clean up text artifacts
    let cleaned = text
      .replace(/[^\w\s\d\.,€$£¥\-()\/\[\]]/g, ' ') // Remove strange characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Remove common text parsing errors
    cleaned = cleaned
      .replace(/(\d)\s+[,.](\d)/g, '$1.$2') // Fix decimal separators
      .replace(/€\s+(\d)/g, '€$1') // Fix currency spacing
      .replace(/(\d)\s+€/g, '$1€')
      .replace(/\b(\d+)[oO](\d+)\b/g, '$1.0$2'); // Fix 'o' -> '0' in prices

    // Log cleaned text quality after preprocessing
    const cleanedLines = cleaned.split('\n').filter(line => line.trim().length > 0);
    const cleanedCharCount = cleaned.length;
    const cleanedWordCount = cleaned.split(/\s+/).length;
    
    // Calculate improvement metrics
    const charactersRemoved = originalCharCount - cleanedCharCount;
    const compressionRatio = cleanedCharCount / originalCharCount;
    
    this.logger.info('Text preprocessing completed', {
      cleanedTextLength: cleanedCharCount,
      cleanedLineCount: cleanedLines.length,
      cleanedWordCount: cleanedWordCount,
      improvementMetrics: {
        charactersRemoved: charactersRemoved,
        compressionRatio: compressionRatio,
        lineCountChange: cleanedLines.length - originalLines.length,
        wordCountChange: cleanedWordCount - originalWordCount
      },
      cleanedTextPreview: cleaned.substring(0, 500) + (cleaned.length > 500 ? '\n... (truncated)' : ''),
      sampleCleanedLines: cleanedLines.slice(0, 5)
    });

    return cleaned;
  }

  /**
   * Парсинг меню с помощью LLM - поддерживает файлы и текст
   */
  async parseWithLLM(input, options, requestId) {
    const businessType = options.businessType || this.defaultBusinessType;
    const language = options.language || this.defaultLanguage;

    const systemPrompt = this.createSystemPrompt(businessType, language, options.restaurantName);
    const isFileInput = Array.isArray(input) && input.length > 0 && input[0].mimeType;
    
    let bestResult = null;
    let attempts = 0;

    // Try different models for best results using unified provider
    const models = [
      getGeminiModel({ modelName: process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash' }),
      getGeminiModel({ modelName: process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash' })
    ].map((client, index) => ({
      name: index === 0 ? (process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash') : (process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash'),
      client: client,
      type: 'gemini'
    }));
    

    for (const model of models) {
      if (attempts >= this.parsingConfig.maxRetries) break;

      try {
        attempts++;
        this.logger.info('Attempting LLM parsing', { 
          requestId, 
          model: model.name, 
          attempt: attempts,
          inputType: isFileInput ? 'files' : 'text',
          fileCount: isFileInput ? input.length : 0
        });

        let result;
        if (isFileInput && model.type === 'gemini') {
          // Gemini supports files directly
          result = await this.callLLMWithFiles(model, systemPrompt, input, options);
        } else {
          // Text input for any model
          const userPrompt = this.createUserPrompt(input, options);
          result = await this.callLLM(model, systemPrompt, userPrompt);
        }

        const parsed = this.parseLLMResponse(result);

        if (this.validateParsedData(parsed)) {
          bestResult = { ...parsed, model: model.name, confidence: this.calculateConfidence(parsed) };
          
          if (bestResult.confidence > this.parsingConfig.confidenceThreshold) {
            break; // Good enough result
          }
        }

      } catch (error) {
        this.logger.warn('LLM parsing attempt failed', { 
          requestId, 
          model: model.name, 
          attempt: attempts, 
          error: error.message,
          errorStack: error.stack
        });
      }
    }

    if (!bestResult) {
      // Enhanced logging before throwing the error
      this.logger.error('All LLM parsing attempts failed', {
        requestId,
        totalAttempts: attempts,
        maxRetries: this.parsingConfig.maxRetries,
        availableModels: models.map(m => m.name),
        confidenceThreshold: this.parsingConfig.confidenceThreshold,
        inputType: isFileInput ? 'files' : 'text',
        inputSize: isFileInput ? input.length : (typeof input === 'string' ? input.length : 0),
        businessType,
        language
      });
      
      throw new Error('Failed to parse menu with any available LLM model');
    }

    this.logger.info('LLM parsing successful', { 
      requestId, 
      model: bestResult.model, 
      confidence: bestResult.confidence 
    });

    return bestResult;
  }

  /**
   * Создание system prompt для LLM
   */
  createSystemPrompt(businessType, language, restaurantName = null) {
    return `Du bist ein Experte für die Analyse von Restaurant-Menüs und POS-Systemen. 
Deine Aufgabe ist es, gescannten Menütext in strukturierte JSON-Daten zu konvertieren.

BUSINESS TYPE: ${businessType}
OUTPUT LANGUAGE: ${language}${restaurantName ? `\nRESTAURANT NAME: ${restaurantName}` : ''}

WICHTIGE ANWEISUNGEN:
1. Extrahiere alle Artikel mit Namen, Preisen und VOLLSTÄNDIGEN BESCHREIBUNGEN
2. Organisiere Artikel in logische Kategorien (Vorspeisen, Hauptspeisen, Getränke, etc.)
3. Erkenne Allergene und besondere Eigenschaften (vegan, glutenfrei, etc.)
4. Normalisiere Preise im Format "X.XX" (Dezimaltrennzeichen: Punkt)
5. Identifiziere Währung automatisch
6. Berücksichtige verschiedene Portionsgrößen und Varianten

PARSING-PROZESS:
1. Identifiziere ALLE Kategorien auf dem Menü
2. Für jeden Artikel extrahiere:
   - Vollständigen Namen
   - KOMPLETTE Beschreibung (sehr wichtig für Suchfunktionen)
   - Hauptpreis und alle Varianten
   - Genaue Kategorie-Zuordnung

ANTWORT-FORMAT (JSON):
{
  "restaurant_info": {
    "name": "Restaurantname (falls erkennbar)",
    "currency": "€/$£/etc"
  },
  "categories": [
    {
      "temp_id": 1,
      "name": "Kategoriename",
      "type": "food/drink",
      "description": "Optional"
    }
  ],
  "items": [
    {
      "menu_number": "24b (optional, if present on menu)",
      "name": "Vollständiger Artikelname",
      "description": "VOLLSTÄNDIGE Beschreibung mit allen Details, Zutaten und Zubereitungsarten",
      "price": 12.50,
      "categoryName": "Exakter Kategoriename aus der categories-Liste",
      "allergens": ["gluten", "dairy"],
      "dietary_info": ["vegetarian", "vegan", "gluten_free"],
      "portion_size": "Normal/Klein/Groß",
      "variants": [
        {"name": "Klein", "price": 10.50},
        {"name": "Groß", "price": 15.50}
      ]
    }
  ],
  "parsing_notes": [
    "Hinweise auf Unsicherheiten oder Besonderheiten"
  ]
}

WICHTIG: Die 'description' ist das wichtigste Feld! Erfasse ALLE Textinformationen zu einem Artikel, einschließlich Zutaten, Zubereitungsart, Beilagen und besondere Eigenschaften. Diese Details sind essentiell für die spätere Suchfunktionalität.

Achte auf häufige Textfehler und korrigiere sie intelligent.`;
  }

  /**
   * Создание user prompt с текстом меню
   */
  createUserPrompt(menuText, options) {
    return `Analysiere bitte das folgende Restaurant-Menü und konvertiere es in das angegebene JSON-Format:

MENÜTEXT:
${menuText}

ZUSÄTZLICHE ANFORDERUNGEN:
- Erstelle sinnvolle Kategorien basierend auf dem Menüinhalt
- Achte auf Preisangaben und korrigiere Textfehler
- Erkenne automatisch die Sprache des Menüs
- Identifiziere Allergene und besondere Eigenschaften
- Erstelle eindeutige IDs für alle Artikel

Antworte nur mit dem validen JSON-Objekt.`;
  }


  /**
   * Вызов LLM API с файлами (только для Gemini)
   */
  async callLLMWithFiles(model, systemPrompt, files, options) {
    console.log('🔍 Calling LLM with files:', model.type, model.name);
    console.log('📁 Files count:', files.length);
    console.log('📝 System prompt length:', systemPrompt.length);
    
    // Prepare parts array for Gemini multimodal request
    const parts = [{text: systemPrompt}];
    
    // Add files to parts
    for (const file of files) {
      console.log(`📄 Adding file: ${file.path} (${file.mimeType}, ${file.size} bytes)`);
      parts.push({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType
        }
      });
    }
    
    // Add user instruction about multiple files if needed
    if (files.length > 1) {
      parts.push({text: `\nПожалуйста, обработайте все ${files.length} файла в указанном порядке и объедините информацию из всех файлов в одну структуру меню. Сохраните последовательность блюд как они представлены в файлах.`});
    }

    // Structure the request correctly for the SDK
    const request = [{ role: 'user', parts: parts }];

    console.log('🤖 Calling Gemini API with files...');
    // Use the unified provider client directly
    const result = await model.client.generateContent(request);
    console.log('✅ Gemini API response received');
    const text = result.candidates[0].content.parts[0].text;
    console.log('📄 Response text length:', text.length);
    console.log('📄 First 200 chars:', text.substring(0, 200));
    return text;
  }

  /**
   * Вызов LLM API с текстом
   */
  async callLLM(model, systemPrompt, userPrompt) {
    console.log('🔍 Calling LLM:', model.type, model.name);
    console.log('📝 System prompt length:', systemPrompt.length);
    console.log('📝 User prompt length:', userPrompt.length);
    
    switch (model.type) {
      case 'gemini':
        console.log('🤖 Calling Gemini API...');
        // Use the unified provider client directly with correct request structure
        const request = [{ 
          role: 'user', 
          parts: [
            { text: systemPrompt },
            { text: userPrompt }
          ]
        }];
        const result = await model.client.generateContent(request);
        console.log('✅ Gemini API response received');
        const text = result.candidates[0].content.parts[0].text;
        console.log('📄 Response text length:', text.length);
        console.log('📄 First 200 chars:', text.substring(0, 200));
        return text;


      default:
        throw new Error(`Unsupported model type: ${model.type}`);
    }
  }

  /**
   * Парсинг ответа LLM
   */
  parseLLMResponse(response) {
    try {
      this.logger.debug('Raw LLM response received', { 
        responseLength: response.length,
        responsePreview: response.substring(0, 500) + (response.length > 500 ? '...' : '')
      });

      // Clean response text
      let cleanedResponse = response.trim();
      
      // Remove markdown code blocks if present
      cleanedResponse = cleanedResponse.replace(/```json\s*|\s*```/g, '');
      this.logger.debug('After markdown removal', { 
        cleanedLength: cleanedResponse.length,
        cleanedPreview: cleanedResponse.substring(0, 200) + (cleanedResponse.length > 200 ? '...' : '')
      });
      
      // Find JSON object
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
        this.logger.debug('JSON pattern found', { 
          matchLength: cleanedResponse.length,
          matchPreview: cleanedResponse.substring(0, 200) + (cleanedResponse.length > 200 ? '...' : '')
        });
      } else {
        this.logger.warn('No JSON pattern found in response', { 
          originalResponse: response,
          cleanedResponse: cleanedResponse
        });
      }

      const parsed = JSON.parse(cleanedResponse);
      this.logger.debug('JSON parsing successful', { 
        hasItems: !!parsed.items,
        itemsCount: parsed.items ? parsed.items.length : 0,
        hasCategories: !!parsed.categories,
        categoriesCount: parsed.categories ? parsed.categories.length : 0,
        hasRestaurantInfo: !!parsed.restaurant_info,
        topLevelKeys: Object.keys(parsed)
      });

      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse LLM response as JSON', {
        error: error.message,
        errorStack: error.stack,
        responseLength: response.length,
        responsePreview: response.substring(0, 1000),
        cleanedResponseAttempt: response.trim().replace(/```json\s*|\s*```/g, '')
      });
      throw new Error(`Failed to parse LLM response as JSON: ${error.message}`);
    }
  }

  /**
   * Валидация парсеных данных
   */
  validateParsedData(data) {
    this.logger.debug('Starting validation of parsed data', { 
      hasData: !!data,
      dataType: typeof data,
      topLevelKeys: data ? Object.keys(data) : null
    });

    // Basic validation
    if (!data || typeof data !== 'object') {
      this.logger.warn('Validation failed: data is not an object', { 
        data: data,
        type: typeof data 
      });
      return false;
    }

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      this.logger.warn('Validation failed: items array is missing or empty', { 
        hasItems: !!data.items,
        itemsType: typeof data.items,
        isArray: Array.isArray(data.items),
        itemsLength: data.items ? data.items.length : 'N/A'
      });
      return false;
    }

    if (!data.categories || !Array.isArray(data.categories) || data.categories.length === 0) {
      this.logger.warn('Validation failed: categories array is missing or empty', { 
        hasCategories: !!data.categories,
        categoriesType: typeof data.categories,
        isArray: Array.isArray(data.categories),
        categoriesLength: data.categories ? data.categories.length : 'N/A'
      });
      return false;
    }

    // Check items have required fields
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.name || typeof item.price !== 'number' || (!item.category_id && !item.categoryName)) {
        this.logger.warn('Validation failed: item missing required fields', { 
          itemIndex: i,
          itemName: item.name,
          hasName: !!item.name,
          priceType: typeof item.price,
          priceValue: item.price,
          hasCategoryId: !!item.category_id,
          hasCategoryName: !!item.categoryName,
          itemKeys: Object.keys(item)
        });
        return false;
      }
    }

    // Check categories have required fields
    for (let i = 0; i < data.categories.length; i++) {
      const category = data.categories[i];
      if (!category.name || (!category.id && !category.temp_id)) {
        this.logger.warn('Validation failed: category missing required fields', { 
          categoryIndex: i,
          categoryName: category.name,
          hasName: !!category.name,
          hasId: !!category.id,
          hasTempId: !!category.temp_id,
          categoryKeys: Object.keys(category)
        });
        return false;
      }
    }

    this.logger.debug('Validation successful', { 
      itemsCount: data.items.length,
      categoriesCount: data.categories.length
    });
    return true;
  }

  /**
   * Расчет уверенности в результате
   */
  calculateConfidence(data) {
    let score = 0.5; // Base score

    // Items with prices
    const itemsWithPrices = data.items.filter(item => typeof item.price === 'number' && item.price > 0);
    score += (itemsWithPrices.length / data.items.length) * 0.3;

    // Categories coverage
    const categoriesUsed = new Set(data.items.map(item => item.category_id));
    score += (categoriesUsed.size / data.categories.length) * 0.2;

    // Items with descriptions
    const itemsWithDescriptions = data.items.filter(item => item.description && item.description.length > 5);
    score += (itemsWithDescriptions.length / data.items.length) * 0.1;

    // Language detection
    if (data.restaurant_info?.detected_language) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Улучшение и валидация данных
   */
  async enhanceAndValidate(parsedData, options) {
    // Add missing IDs
    parsedData.categories.forEach((category, index) => {
      if (!category.id) category.id = index + 1;
    });

    parsedData.items.forEach((item, index) => {
      if (!item.id) item.id = index + 1;
      if (!item.short_name) item.short_name = this.generateShortName(item.name);
    });

    // Validate price formats
    parsedData.items.forEach(item => {
      if (typeof item.price === 'string') {
        item.price = parseFloat(item.price.replace(/[^\d.,]/g, '').replace(',', '.'));
      }
      item.price = Math.round(item.price * 100) / 100; // Round to 2 decimal places
    });

    // Enhance categories
    parsedData.categories.forEach(category => {
      if (!category.type) {
        category.type = this.guesseCategoryType(category.name);
      }
    });

    // Add allergen information if missing
    parsedData.items.forEach(item => {
      if (!item.allergens) item.allergens = [];
      if (!item.dietary_info) item.dietary_info = [];
      
      // Try to detect allergens from description
      this.detectAllergensFromText(item.name + ' ' + (item.description || ''), item);
    });

    return parsedData;
  }

  /**
   * Генерация короткого названия для кнопки
   */
  generateShortName(fullName) {
    if (fullName.length <= 12) return fullName;
    
    // Try to create meaningful abbreviation
    const words = fullName.split(' ');
    if (words.length > 1) {
      return words.slice(0, 2).join(' ').substring(0, 12);
    }
    
    return fullName.substring(0, 12);
  }

  /**
   * Определение типа категории
   */
  guesseCategoryType(categoryName) {
    const drinkKeywords = ['getränk', 'drink', 'beverage', 'wein', 'wine', 'bier', 'beer', 'cocktail', 'saft', 'juice', 'kaffee', 'coffee', 'tee', 'tea'];
    const nameLower = categoryName.toLowerCase();
    
    return drinkKeywords.some(keyword => nameLower.includes(keyword)) ? 'drink' : 'food';
  }

  /**
   * Определение аллергенов из текста
   */
  detectAllergensFromText(text, item) {
    const textLower = text.toLowerCase();
    
    const allergenMap = {
      'gluten': ['weizen', 'dinkel', 'roggen', 'gerste', 'hafer', 'gluten'],
      'dairy': ['milch', 'käse', 'butter', 'sahne', 'joghurt', 'quark'],
      'nuts': ['nuss', 'mandel', 'haselnuss', 'walnuss', 'erdnuss'],
      'fish': ['fisch', 'lachs', 'thunfisch', 'forelle'],
      'crustaceans': ['garnele', 'krebs', 'hummer', 'languste'],
      'eggs': ['ei', 'eigelb', 'eiweiß'],
      'soy': ['soja', 'tofu'],
      'sulfites': ['wein', 'trockenfrüchte']
    };

    for (const [allergen, keywords] of Object.entries(allergenMap)) {
      if (keywords.some(keyword => textLower.includes(keyword))) {
        if (!item.allergens.includes(allergen)) {
          item.allergens.push(allergen);
        }
      }
    }

    // Dietary info detection
    if (textLower.includes('vegan')) item.dietary_info.push('vegan');
    if (textLower.includes('vegetarisch') || textLower.includes('vegetarian')) item.dietary_info.push('vegetarian');
    if (textLower.includes('glutenfrei') || textLower.includes('gluten-free')) item.dietary_info.push('gluten_free');
    if (textLower.includes('bio') || textLower.includes('organic')) item.dietary_info.push('organic');
  }

  /**
   * Конвертация в OOP-POS-MDF формат
   */
  async convertToOOPPOSMDF(parsedData, options) {
    const restaurantName = parsedData.restaurant_info?.name || options.restaurantName || 'Parsed Restaurant';
    const currency = parsedData.restaurant_info?.currency || '€';
    const detectedLanguage = parsedData.restaurant_info?.detected_language || this.defaultLanguage;

    // Create audit trail
    const auditTrail = {
      created_at: new Date().toISOString(),
      created_by: 'menu-parser@eckasse.com',
      last_modified_at: new Date().toISOString(),
      last_modified_by: 'menu-parser@eckasse.com',
      version: 1,
      change_log: [
        {
          timestamp: new Date().toISOString(),
          user: 'menu-parser@eckasse.com',
          action: 'menu_parsed',
          description: 'Automatically parsed from menu image/text'
        }
      ]
    };

    // Convert categories - handle both old and new format
    const categories = parsedData.categories.map((cat, index) => {
      const categoryId = cat.temp_id || cat.id || (index + 1);
      return {
        category_unique_identifier: categoryId,
        category_names: this.createMultilingualObject(cat.name, detectedLanguage),
        category_type: cat.type || this.guesseCategoryType(cat.name),
        parent_category_unique_identifier: null,
        default_linked_main_group_unique_identifier: (cat.type === 'drink' || this.guesseCategoryType(cat.name) === 'drink') ? 1 : 2,
        audit_trail: { ...auditTrail }
      };
    });

    // Create category lookup map for new format
    const categoryLookup = new Map();
    categories.forEach(cat => {
      const categoryName = parsedData.categories.find(c => 
        (c.temp_id || c.id) === cat.category_unique_identifier
      )?.name;
      if (categoryName) {
        categoryLookup.set(categoryName, cat.category_unique_identifier);
      }
    });

    // Convert items to multilingual format - handle both old and new format
    const items = parsedData.items.map((item, index) => {
      const itemId = item.id || (index + 1);
      const shortName = item.short_name || this.generateShortName(item.name);
      
      // Handle category linking for new format
      let categoryId;
      if (item.categoryName) {
        // New format: use categoryName to find category_unique_identifier
        categoryId = categoryLookup.get(item.categoryName) || 1;
      } else {
        // Old format: use category_id directly
        categoryId = item.category_id || 1;
      }

      return {
        item_unique_identifier: itemId,
        menu_item_number: item.menu_number || null,
        display_names: {
          menu: this.createMultilingualObject(item.name, detectedLanguage),
          button: this.createMultilingualObject(shortName, detectedLanguage),
          receipt: this.createMultilingualObject(item.name, detectedLanguage)
        },
        item_price_value: item.price,
        pricing_schedules: item.variants ? item.variants.map(variant => ({
          schedule_id: `variant_${variant.name.toLowerCase()}`,
          price: variant.price,
          valid_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        })) : [],
        availability_schedule: {
          always_available: true,
          schedules: []
        },
        associated_category_unique_identifier: categoryId,
        additional_item_attributes: {
          description: item.description || '',
          allergens: item.allergens || [],
          dietary_info: item.dietary_info || [],
          portion_size: item.portion_size || 'normal',
          menu_parser_generated: true
        },
        item_flags: {
          is_sellable: true,
          has_negative_price: false,
          requires_age_verification: false,
          is_organic: item.dietary_info?.includes('organic') || false
        },
        audit_trail: { ...auditTrail }
      };
    });

    // Create full OOP-POS-MDF configuration
    const config = {
      "$schema": "https://schemas.eckasse.com/oop-pos-mdf/v2.0.0/schema.json",
      company_details: {
        company_unique_identifier: 1,
        company_full_name: restaurantName,
        meta_information: {
          format_version: "2.0.0",
          previous_versions: [],
          date_generated: new Date().toISOString(),
          generated_by: "eckasse-menu-parser-v2.0.0",
          default_currency_symbol: currency,
          default_language: detectedLanguage,
          supported_languages: this.supportedLanguages,
          audit_trail: { ...auditTrail }
        },
        global_configurations: {
          tax_rates_definitions: [
            {
              tax_rate_unique_identifier: 1,
              tax_rate_names: this.createMultilingualObject("Standard (19%)", detectedLanguage),
              rate_percentage: 19.0,
              fiscal_mapping_type: "NORMAL"
            },
            {
              tax_rate_unique_identifier: 2,
              tax_rate_names: this.createMultilingualObject("Ermäßigt (7%)", detectedLanguage),
              rate_percentage: 7.0,
              fiscal_mapping_type: "REDUCED"
            }
          ],
          main_groups_definitions: [
            {
              main_group_unique_identifier: 1,
              main_group_names: this.createMultilingualObject("Getränke", detectedLanguage)
            },
            {
              main_group_unique_identifier: 2,
              main_group_names: this.createMultilingualObject("Speisen", detectedLanguage)
            }
          ],
          payment_methods_definitions: [
            {
              payment_method_unique_identifier: 1,
              payment_method_names: this.createMultilingualObject("Bar", detectedLanguage),
              payment_method_type: "CASH"
            },
            {
              payment_method_unique_identifier: 2,
              payment_method_names: this.createMultilingualObject("Karte", detectedLanguage),
              payment_method_type: "CARD"
            }
          ],
          promotions_definitions: [],
          workflows: [],
          integrations: {},
          security_settings: {
            encryption: { at_rest: true, in_transit: true, algorithm: "AES-256" },
            access_control: { session_timeout: 3600, max_failed_attempts: 3, lockout_duration: 900, require_2fa: false },
            data_privacy: { gdpr_compliance: true, data_retention_days: 2555, anonymization_rules: [] }
          }
        },
        branches: [
          {
            branch_unique_identifier: 1,
            branch_names: this.createMultilingualObject("Hauptfiliale", detectedLanguage),
            branch_address: "Automatisch generiert aus Menü",
            point_of_sale_devices: [
              {
                pos_device_unique_identifier: 1,
                pos_device_names: this.createMultilingualObject("Hauptkasse", detectedLanguage),
                pos_device_type: "DESKTOP",
                pos_device_external_number: 1,
                pos_device_settings: {
                  default_currency_identifier: currency,
                  default_linked_drink_tax_rate_unique_identifier: 1,
                  default_linked_food_tax_rate_unique_identifier: 2
                },
                categories_for_this_pos: categories,
                items_for_this_pos: items
              }
            ]
          }
        ]
      }
    };

    return config;
  }

  /**
   * Создание многоязычного объекта
   */
  createMultilingualObject(text, primaryLanguage) {
    const obj = {};
    obj[primaryLanguage] = text;
    
    // Add fallback to default language if different
    if (primaryLanguage !== this.defaultLanguage) {
      obj[this.defaultLanguage] = text;
    }

    return obj;
  }

  /**
   * CLI интерфейс для парсинга меню
   */
  static async parseMenuFromCLI(args) {
    const parser = new MenuParserLLM({});

    try {
      const inputPath = args[0];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const outputPath = args[1] || `parsed-menu-config_${timestamp}.json`;
      
      if (!inputPath) {
        console.error('Usage: node menu-parser.js <input-image-or-text> [output-file]');
        process.exit(1);
      }

      console.log(`🔍 Parsing menu from: ${inputPath}`);
      const result = await parser.parseMenu(inputPath);

      // Save configuration
      await fs.writeFile(outputPath, JSON.stringify(result.configuration, null, 2));
      
      console.log(`✅ Menu parsed successfully!`);
      console.log(`📊 Found ${result.metadata.itemsFound} items in ${result.metadata.categoriesFound} categories`);
      console.log(`🎯 Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`);
      console.log(`💾 Configuration saved to: ${outputPath}`);

      // Generate Vectron import if requested
      if (args.includes('--vectron')) {
        const vectronConverter = require('./vectron-converter');
        const vectronData = vectronConverter.convert(result.configuration);
        const vectronPath = outputPath.replace('.json', '-vectron.txt');
        await fs.writeFile(vectronPath, vectronData);
        console.log(`🔄 Vectron import file saved to: ${vectronPath}`);
      }

    } catch (error) {
      console.error('❌ Menu parsing failed:', error.message);
      process.exit(1);
    }
  }
}

// Export for use as module
module.exports = MenuParserLLM;

// Run CLI if called directly
if (require.main === module) {
  MenuParserLLM.parseMenuFromCLI(process.argv.slice(2));
}