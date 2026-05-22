# Design

## Theme

Light. Сотрудники работают днём за ПК в обычном офисном освещении. Светлая тема читается без напряжения в любых условиях и воспринимается как официальная, а не как «тёмный инструмент для разработчиков».

## Color Strategy

Restrained: тинтованные нейтрали со слабым синим оттенком + один акцент до ~10% поверхности. Синий акцент — нейтральный, institutional, без агрессии.

## Colors

Все значения — CSS-переменные из `app/globals.css`:

```css
--bg:            oklch(96.2% 0.007 255);   /* страничный фон */
--surface:       oklch(99.0% 0.004 255);   /* карточки, панели, инпуты */
--border:        oklch(87.5% 0.010 255);   /* стандартные границы */
--border-focus:  oklch(54.0% 0.190 264);   /* фокус-ring */
--border-error:  oklch(78.0% 0.090 27);    /* ошибка */

--text-primary:   oklch(17.0% 0.012 260);  /* основной текст */
--text-secondary: oklch(44.0% 0.012 260);  /* подписи, лейблы */
--text-muted:     oklch(62.0% 0.010 260);  /* плейсхолдеры, хинты */
--text-on-accent: oklch(99.0% 0.004 264);  /* текст поверх акцента */

--accent:       oklch(54.0% 0.190 264);    /* синий акцент: кнопки, ссылки */
--accent-hover: oklch(48.0% 0.190 264);

--error:        oklch(56.0% 0.200 27);     /* ошибки */
--error-bg:     oklch(96.5% 0.018 27);     /* фон ошибки */
```

Дополнительные семантические цвета (использовать там, где нужны, через inline style или локальные переменные):

```
success:        oklch(52% 0.155 155)       /* зелёный: активен, подтверждено */
success-bg:     oklch(96% 0.020 155)
warning:        oklch(68% 0.160 75)        /* жёлтый: предупреждение */
warning-bg:     oklch(97% 0.018 75)
badge-role-bg:  oklch(93% 0.014 264)       /* бледно-синий для бейджей ролей */
badge-role-fg:  oklch(40% 0.140 264)
```

## Typography

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
font-size: 14px (base);
line-height: 1.5;
-webkit-font-smoothing: antialiased;
```

Иерархия:
- Page title: 18px / weight 600 / letter-spacing -0.02em
- Section heading: 15px / weight 600 / letter-spacing -0.01em
- Body: 14px / weight 400
- Label / meta: 13px / weight 500 / color text-secondary
- Caption / hint: 12px / weight 400 / color text-muted

## Spacing & Radius

```css
--radius-sm: 6px;   /* инпуты, мелкие элементы */
--radius-md: 8px;   /* панели, модалки */
```

Базовый шаг: 4px. Типичные значения: 4, 8, 12, 16, 20, 24, 32, 48.

## Elevation

```css
--shadow-form: 0 1px 3px oklch(0% 0 0 / 0.06), 0 1px 2px oklch(0% 0 0 / 0.04);
```

Один уровень тени — для форм и поверхностей. Избегать многоуровневых теней.

## Components

### Buttons

Основная кнопка:
- height: 36px, padding: 0 14px
- background: `var(--accent)`, color: `var(--text-on-accent)`
- border-radius: `var(--radius-sm)`
- font-size: 14px, font-weight: 500
- hover: `var(--accent-hover)`
- disabled: opacity 0.6

Вторичная / Ghost:
- background: transparent, border: 1px solid `var(--border)`
- color: `var(--text-primary)`
- hover: background `var(--bg)`

Опасная (delete):
- background: transparent, border: 1px solid `var(--border-error)`
- color: `var(--error)`
- hover: background `var(--error-bg)`

Иконка-кнопка (actions в таблицах):
- width/height: 28px, border-radius: `var(--radius-sm)`
- background: transparent, color: `var(--text-muted)`
- hover: background `var(--bg)`, color: `var(--text-secondary)`

### Inputs

- height: 36px, padding: 0 10px
- border: 1px solid `var(--border)`, border-radius: `var(--radius-sm)`
- focus: border `var(--border-focus)` + box-shadow `0 0 0 3px oklch(54% 0.19 264 / 0.12)`
- error: border `var(--border-error)`

### Badges / Chips

Используются для ролей, статусов, прав.

Активный статус:
- background: `oklch(96% 0.020 155)`, color: `oklch(52% 0.155 155)`
- border: 1px solid `oklch(88% 0.040 155)`

Неактивный статус:
- background: `oklch(93% 0.008 260)`, color: `var(--text-muted)`
- border: 1px solid `var(--border)`

Роль (синий):
- background: `oklch(93% 0.014 264)`, color: `oklch(40% 0.140 264)`
- border: 1px solid `oklch(86% 0.025 264)`

Право (нейтральный):
- background: `var(--bg)`, color: `var(--text-secondary)`
- border: 1px solid `var(--border)`
- font-size: 12px

Размер badge: height 20px, padding 0 7px, border-radius 10px, font-size 12px, font-weight 500.

### Tables

- Шапка: font-size 12px, font-weight 500, color `var(--text-muted)`, text-transform uppercase, letter-spacing 0.05em
- Строка: border-bottom 1px solid `var(--border)`, height 44px
- Hover строки: background `oklch(97.5% 0.005 255)`
- Чередование не используется — hover достаточно

### Dialogs / Panels

- background: `var(--surface)`
- border: 1px solid `var(--border)`
- border-radius: `var(--radius-md)`
- box-shadow: `var(--shadow-form)` + `0 4px 16px oklch(0% 0 0 / 0.08)`
- Overlay: `oklch(0% 0 0 / 0.35)`

### Spinner

```css
width: 14px; height: 14px;
border: 2px solid oklch(99% 0.004 264 / 0.35);
border-top-color: var(--text-on-accent);
border-radius: 50%;
animation: spin 0.65s linear infinite;
```

## Layout Patterns

- Страницы дашборда: padding 32px 40px (desktop), заголовок + действия в одну строку
- Таблицы занимают всю ширину контента, без карточной обёртки
- Фильтры над таблицей: строка с gap 8px, инпут поиска шире остальных
- Модальные окна: max-width 480px (форма), 400px (подтверждение)
- Пустые состояния: центрированный текст + опциональная кнопка, без иллюстраций

## Interactions & Motion

```css
transition: 0.15s ease — цвет, бордер, фон
transition: 0.1s ease — иконки, мелкие элементы
```

Никаких анимаций layout-свойств. Fade для модальных окон: opacity 0→1 за 0.15s ease-out.

## CSS Approach

CSS Modules (`.module.css`) + глобальные CSS-переменные из `globals.css`. Tailwind не используется. Inline styles допустимы для динамических значений.
