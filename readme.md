# Скрипт парсинга картинок с Google Maps

На вход подаю название места. Скрипт делает запрос в Google Maps и получает ссылку на место. Потом заходит в описание места и сохраняет картинки.

## Установка

1. Установить Node.js
2. Установить зависимости
3. Запустить скрипт

```
cd ~
git clone https://github.com/MihailSchwarz/parser-google-maps.git
cd parser-google-maps
npm install
npx playwright install
npx playwright install-deps
```

## Использование

```bash
node src/main.js
```

## Пример

http://localhost:39283/gm/?q=Tenerife

## Параметры

- `q` - название места
