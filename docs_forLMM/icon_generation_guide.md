# Руководство по генерации иконок для ecKasse UI

## 1. Цель
Данное руководство описывает подход к созданию минималистичных 2D векторных иконок для пользовательского интерфейса ecKasse. Основная цель — обеспечить единообразный стиль, который хорошо сочетается с темной темой UI, интуитивно понятен и эффективен при малых размерах (128x96 пикселей).

## 2. Общие принципы стиля
* **Формат:** 2D векторные иконки (хотя текущие генераторы могут возвращать растровые, промты ориентированы на векторную эстетику).
* **Перспектива:** Слегка сверху-вниз (top-down angle) с легким 3D-эффектом (slight 3D effect / viewed from a 45-degree azimuth, one corner facing us) для объектов, но без чрезмерной детализации.
* **Детализация:** Минималистичная, без мелких деталей, сложных текстур, отражений, бликов. Линии должны быть толстыми и чистыми.
* **Цветовая палитра:** Приглушенные, соответствующие объекту тона, адаптированные для темной темы UI. Избегать ярких и насыщенных цветов.
* **Нежелательные элементы:** Категорически исключать любые посторонние объекты (руки, устройства чтения, фон, столовые приборы, лишние ингредиенты/гарниры, пузырьки, чрезмерные тени).

## 3. Примеры промтов для различных иконок

### 3.1. Кнопки оплаты и системные иконки

#### **Иконка "Стол" (Table)**
* **Описание:** Простой 3D-стол, вид под углом 45 градусов, без распорок, под цвет дерева.
* **Промт:** "A 3D icon of a table, viewed from a 45-degree azimuth, with one corner facing us. The design should be very simple, without fine details. The lines should be thick. The icon will be very small, 128x96 pixels. Color it in a dark wood tone without crossbars on three legs."

#### **Иконка "Наличные" (Cash)**
* **Описание:** Стопка банкнот, вид под углом 45 градусов, без лишних деталей.
* **Промт:** "A 3D icon of a stack of banknotes, viewed from a 45-degree azimuth, with one corner facing us. The design should be very simple, without fine details. The lines should be thick. The icon will be very small, 128x96 pixels. Color it in a light green reminiscent of currency." (Цвет может быть скорректирован на более приглушенный для темной темы после генерации).

#### **Иконка "Карта" (Card)**
* **Описание:** Простое 2D-изображение кредитной карты, без устройств чтения, в серо-синих тонах.
* **Промт:** "A minimalist 2D vector icon of a credit card. No perspective, flat design. Emphasize clean lines and geometric shapes. Avoid any additional elements like card readers, hands, or transaction symbols. Color palette: shades of grey and muted blue for the chip/stripe. Icon size is 128x96 pixels."

### 3.2. Иконки категорий блюд

#### **Иконка "Горячий напиток" (Hot Beverage - Coffee)**
* **Описание:** Кружка горячего напитка с паром, простые формы, теплые приглушенные тона.
* **Промт:** "A minimalist 2D vector icon of a steaming hot beverage in a mug. The mug is a simple, rounded cylinder, viewed from a slight top-down angle, showing the rim and a hint of the interior. Two or three subtle, curved lines ascend from the rim to indicate steam. The color palette should consist of warm, muted tones: dark brown for the mug, a lighter beige/cream for the interior, and very light, almost transparent white/grey for the steam. No handles, spoons, or complex textures. Flat design, clean lines, suitable for a dark UI. Icon size is 128x96 pixels."

#### **Иконка "Безалкогольный напиток" (Non-Alcoholic Drink)**
* **Описание:** Освежающий безалкогольный напиток в стакане с трубочкой, прохладные приглушенные тона.
* **Промт:** "A minimalist 2D vector icon of a refreshing non-alcoholic beverage in a glass. The glass is a simple, slightly tapered cylinder, viewed from a slight top-down angle. A single, straight straw extends from the liquid. The color palette should consist of cool, muted tones: a translucent light blue/green for the drink, a subtle grey outline for the glass, and a very light grey for the straw. No ice cubes, fruit slices, bubbles, or complex textures. Flat design, clean lines, suitable for a dark UI. Icon size is 128x96 pixels."

#### **Иконка "Алкогольный напиток" (Alcoholic Drink)**
* **Описание:** Алкогольный напиток в бокале на ножке, глубокие приглушенные тона.
* **Промт:** "A minimalist 2D vector icon of an alcoholic beverage in a stemmed glass. The glass has a simple, elegant bowl and a thin stem with a small base, viewed from a slight top-down angle. The liquid inside is a solid, rich color. The color palette should consist of deep, muted tones: a dark, translucent red/amber for the drink, a subtle dark grey outline for the glass, and a very light grey for the stem and base. No reflections, bubbles, garnishes (like olives or lemon slices), or complex textures. Flat design, clean lines, suitable for a dark UI. Icon size is 128x96 pixels."

#### **Иконка "Суп" (Soup)**
* **Описание:** Миска супа с ложкой и паром, теплые, землистые приглушенные тона.
* **Промт:** "A minimalist 2D vector icon of a bowl of soup. The bowl is a simple, wide, and shallow ceramic bowl, viewed from a slight top-down angle. A single, simple spoon rests inside the bowl, partially submerged in the liquid. Two or three subtle, curved lines ascend from the liquid to indicate steam. The color palette should consist of warm, earthy, muted tones: a deep, muted orange/red for the soup, a light beige/off-white for the bowl, and a subtle dark grey for the spoon. No complex textures, garnishes (like herbs or croutons), or reflections. Flat design, clean lines, suitable for a dark UI. Icon size is 128x96 pixels."

#### **Иконка "Второе блюдо" (Main Course)**
* **Описание:** Основное блюдо на тарелке (кусок белка + гарнир), теплые, приглушенные землистые тона.
* **Промт:** "A minimalist 2D vector icon of a main course on a plate. The plate is a simple, round, flat ceramic plate, viewed from a slight top-down angle. On the plate, there is a distinct, rounded shape representing a piece of protein (like meat or fish) and a smaller, abstract shape next to it for a side dish (like a vegetable or starch). The color palette should consist of warm, muted, and slightly desaturated earthy tones: a dark, rich brown/red for the protein, a muted green for the side, and a light grey/off-white for the plate. No complex textures, intricate details, cutlery, or reflections. Flat design, clean lines, suitable for a dark UI. Icon size is 128x96 pixels."