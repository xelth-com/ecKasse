// lib/converters/vectron.js
const iconv = require('iconv-lite');

// --- Внутренняя "База Данных" Известных Vectron Команд и Маппингов ---
const VECTRON_COMMANDS = {
  HEADER_LINE_TYPE: 100,
  WARENGRUPPE_LINE_TYPE: 102,
  PLU_LINE_TYPE: 101,
  AUSWAHLFENSTER_LINE_TYPE: 152,

  // Общие поля
  FIELD_ID_NAME1: 101, // Name 1 (PLU, WG, Auswahlfenster)
  FIELD_ID_NAME2: 102, // Name 2 (PLU Kurzname / button_display_name)
  FIELD_ID_PRICE1: 201, // Preis 1
  FIELD_ID_WARENGRUPPE_LINK: 301, // Verknüpfвание с товарной группой
  FIELD_ID_HAUPTGRUPPE_LINK: 311, // Verknüpfвание с основной группой 1
  FIELD_ID_STEUER_LINK: 401, // Verknüpfвание с налогом
  FIELD_ID_INAKTIV_FLAG: 9001, // "Inaktiv"-Flag (0=aktiv, 1=inaktiv)
  FIELD_ID_KEIN_VERKAUF_FLAG: 1003, // "Kein Verkauf"-Flag (1=kein Verkauf)
  FIELD_ID_NEGATIV_FLAG: 901, // "Negativ"-Flag (0=не отрицательный, 1=отрицательный)

  // Header-специфичные поля
  HEADER_FIELD_ID_INTERFACE_VERSION: 1, // Версия интерфейса данных (всегда 1)
  HEADER_FIELD_ID_KASSEN_NUMMER: 10, // Номер кассы
  HEADER_FIELD_ID_IMPORT_MODUS: 24, // Режим импорта (A=Add/Update)
  HEADER_FIELD_ID_CHAR_ENCODING: 51, // Кодировка символов (1=ANSI/Windows-1252)

  // Значения по умолчанию для Vectron-полей
  DEFAULT_IMPORT_MODE: 'A', // Add/Update
  DEFAULT_CHAR_ENCODING: 1, // ANSI (Windows-1252)
  DEFAULT_PLU_ACTIVE: 0, // 0 = активен
  DEFAULT_PLU_INACTIVE: 1, // 1 = неактивен
  DEFAULT_PLU_NOT_NEGATIVE: 0, // 0 = не отрицательный
  DEFAULT_PLU_IS_NEGATIVE: 1, // 1 = отрицательный
  DEFAULT_PLU_CAN_BE_SOLD: 0, // 0 = продается
  DEFAULT_PLU_CANNOT_BE_SOLD: 1, // 1 = не продается
};

class VectronConverter {
  /**
   * Конвертирует конфигурацию OOP-POS-MDF v2.0.0 в формат импорта Vectron.
   * @param {object} oopPosMdfJson - Конфигурация в формате OOP-POS-MDF v2.0.0.
   * @returns {Buffer} Буфер с данными для импорта Vectron в кодировке Windows-1252.
   */
  convert(oopPosMdfJson) {
    const vectronLines = [];

    const companyDetails = oopPosMdfJson.company_details;
    if (!companyDetails || !companyDetails.branches || companyDetails.branches.length === 0) {
      throw new Error("Invalid OOP-POS-MDF structure: No company or branches found.");
    }
    const branch = companyDetails.branches[0];
    if (!branch.point_of_sale_devices || branch.point_of_sale_devices.length === 0) {
      throw new Error("Invalid OOP-POS-MDF structure: No POS devices found in the first branch.");
    }
    const posDevice = branch.point_of_sale_devices[0];
    const defaultLanguage = companyDetails.meta_information.default_language || 'de';

    // --- 1. Header-Zeile (LineType 100) ---
    const kassenNummer = posDevice.pos_device_external_number;
    const header = `${VECTRON_COMMANDS.HEADER_LINE_TYPE},0,` +
                   `${VECTRON_COMMANDS.HEADER_FIELD_ID_INTERFACE_VERSION},1;` +
                   `${VECTRON_COMMANDS.HEADER_FIELD_ID_KASSEN_NUMMER},${kassenNummer};` +
                   `${VECTRON_COMMANDS.HEADER_FIELD_ID_IMPORT_MODUS},${VECTRON_COMMANDS.DEFAULT_IMPORT_MODE};` +
                   `${VECTRON_COMMANDS.HEADER_FIELD_ID_CHAR_ENCODING},${VECTRON_COMMANDS.DEFAULT_CHAR_ENCODING};`;
    vectronLines.push(header);

    // --- 2. Warengruppen (LineType 102) ---
    for (const category of posDevice.categories_for_this_pos) {
      const categoryName = category.category_names?.[defaultLanguage] || category.category_names?.[Object.keys(category.category_names)[0]] || 'Unknown Category';
      const wgLine = `${VECTRON_COMMANDS.WARENGRUPPE_LINE_TYPE},${category.category_unique_identifier},` +
                     `${VECTRON_COMMANDS.FIELD_ID_NAME1},TX:"${categoryName}";`;
      vectronLines.push(wgLine);
    }

    // --- 3. Items (PLUs) (LineType 101) ---
    for (const item of posDevice.items_for_this_pos) {
      const category = posDevice.categories_for_this_pos.find(
        cat => cat.category_unique_identifier === item.associated_category_unique_identifier
      );
      if (!category) {
        console.warn(`WARN: Item ${item.item_unique_identifier} has no matching category. Skipping PLU import for this item.`);
        continue;
      }

      const menuDisplayName = item.display_names?.menu?.[defaultLanguage] || 'Unknown Menu Item';
      const buttonDisplayName = item.display_names?.button?.[defaultLanguage] || 'Unknown Button Name';

      const mainGroup = category.default_linked_main_group_unique_identifier;
      let taxRate = '';
      if (category.category_type === 'drink') {
        taxRate = posDevice.pos_device_settings.default_linked_drink_tax_rate_unique_identifier;
      } else if (category.category_type === 'food') {
        taxRate = posDevice.pos_device_settings.default_linked_food_tax_rate_unique_identifier;
      } else {
        taxRate = posDevice.pos_device_settings.default_linked_food_tax_rate_unique_identifier;
      }

      let itemLine = `${VECTRON_COMMANDS.PLU_LINE_TYPE},${item.item_unique_identifier},` +
                     `${VECTRON_COMMANDS.FIELD_ID_NAME1},TX:"${menuDisplayName}";` +
                     `${VECTRON_COMMANDS.FIELD_ID_NAME2},TX:"${buttonDisplayName}";` +
                     `${VECTRON_COMMANDS.FIELD_ID_PRICE1},VA:${item.item_price_value.toFixed(2)};` +
                     `${VECTRON_COMMANDS.FIELD_ID_WARENGRUPPE_LINK},NR:${category.category_unique_identifier};` +
                     `${VECTRON_COMMANDS.FIELD_ID_HAUPTGRUPPE_LINK},NR:${mainGroup};` +
                     `${VECTRON_COMMANDS.FIELD_ID_STEUER_LINK},NR:${taxRate};`;
      
      // Flags
      if (item.item_flags && !item.item_flags.is_sellable) {
        itemLine += `${VECTRON_COMMANDS.FIELD_ID_KEIN_VERKAUF_FLAG},NR:${VECTRON_COMMANDS.DEFAULT_PLU_CANNOT_BE_SOLD};`;
      } else {
        itemLine += `${VECTRON_COMMANDS.FIELD_ID_KEIN_VERKAUF_FLAG},NR:${VECTRON_COMMANDS.DEFAULT_PLU_CAN_BE_SOLD};`;
      }
      itemLine += `${VECTRON_COMMANDS.FIELD_ID_INAKTIV_FLAG},NR:${VECTRON_COMMANDS.DEFAULT_PLU_ACTIVE}`; 

      if (item.item_flags && item.item_flags.has_negative_price) {
          itemLine += `;${VECTRON_COMMANDS.FIELD_ID_NEGATIV_FLAG},NR:${VECTRON_COMMANDS.DEFAULT_PLU_IS_NEGATIVE}`;
      } else {
          itemLine += `;${VECTRON_COMMANDS.FIELD_ID_NEGATIV_FLAG},NR:${VECTRON_COMMANDS.DEFAULT_PLU_NOT_NEGATIVE}`;
      }
      
      vectronLines.push(itemLine);
    }

    // --- 4. Display Layouts (Auswahlfenster) (LineType 152) ---
    // Для кнопок категорий, как было в вашем первоначальном проекте.
    // Обратите внимание, что это очень упрощенная конвертация UI-элементов.
    // Полная настройка UI в Vectron Commander требует сложной логики маппинга.
    const mainLayout = posDevice.built_in_displays?.[0]?.display_activities?.[0]?.user_interface_elements?.find(
        elem => elem.element_type === 'CATEGORY_NAVIGATION_PANEL'
    );

    if (mainLayout && mainLayout.button_configurations) {
        for (const buttonConfig of mainLayout.button_configurations) {
            // Пропускаем разделители, если они есть
            if (buttonConfig.element_type === 'SEPARATOR_BUTTON') {
                const separatorText = buttonConfig.button_texts?.[defaultLanguage] || '---SEPARATOR---';
                // LineType 152 для текстовых кнопок или разделителей, если нет linked_category
                // ID может быть условным или генерироваться. Для простоты, используем ID кнопки.
                // Хотя 152 LineType обычно для выборки, а не для самих кнопок.
                // В Vectron Data Interface DE Assembled.json нет явного маппинга для separator_button.
                // Это, вероятно, потребует кастомной обработки или ручной настройки в VC.
                // Для импорта текстовых кнопок можно использовать LineType 156 (Administrative masks)
                // или LineType 151 (Infotexts), но это зависит от конкретных требований.
                // Для простоты, оставим как в оригинальном коде, зная, что это может быть не идеально.
                const separatorLine = `${VECTRON_COMMANDS.AUSWAHLFENSTER_LINE_TYPE},${buttonConfig.button_unique_identifier},` +
                                      `${VECTRON_COMMANDS.FIELD_ID_NAME1},TX:"${separatorText}";`;
                vectronLines.push(separatorLine);
                continue;
            }

            const buttonText = buttonConfig.button_texts?.[defaultLanguage] || 'Unknown Button Text';
            // Используем button_unique_identifier как RecordId для LineType 152
            // linked_category_unique_identifier можно использовать в качестве FieldData для поля, которое
            // указывает на связанную категорию, но для LineType 152 в Data Interface DE Assembled.json
            // нет такого прямого маппинга в примерах.
            // Это поле в Vectron обычно настраивается через Field path / access path, а не через логические номера.
            // Поэтому, для простоты, мы экспортируем только название кнопки и ID.
            const buttonLine = `${VECTRON_COMMANDS.AUSWAHLFENSTER_LINE_TYPE},${buttonConfig.button_unique_identifier},` +
                               `${VECTRON_COMMANDS.FIELD_ID_NAME1},TX:"${buttonText}";`;
            vectronLines.push(buttonLine);
        }
    }


    // --- Завершаем файл и кодируем ---
    const outputContent = vectronLines.join('\r\n') + '\r\n';
    return iconv.encode(outputContent, 'windows-1252');
  }
}

module.exports = VectronConverter;