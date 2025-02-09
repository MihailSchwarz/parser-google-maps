const { chromium } = require("playwright");
const path = require("path");
const searchQuery = "Тенерифе";

async function runGoogleMaps() {
  // Добавляем время начала выполнения
  const startTime = new Date();
  console.log("Скрипт запущен:", startTime.toLocaleTimeString());

  // Настраиваем путь к папке с кешем
  const userDataDir = path.join(__dirname, "browser-cache");

  // Объявляем context в более широкой области видимости
  let context;

  try {
    // Запускаем браузер с постоянным контекстом
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      acceptDownloads: true,
      serviceWorkers: "allow",
    });

    const page = await context.newPage();

    // Открываем Google Maps – Шаг 1
    await page.goto("https://www.google.com/maps/?hl=ru");

    // Проверяем наличие окна с куки по тексту и нажимаем кнопку, если оно есть
    try {
      const cookieText = await page.textContent("body");
      if (cookieText.includes("Прежде чем перейти к Google")) {
        await page.click('button[aria-label="Принять все"]');
        console.log("Куки приняты успешно!");
      } else {
        console.log("Окно с куки не обнаружено, продолжаем работу");
      }
    } catch (error) {
      console.log("Ошибка при обработке окна с куки:", error);
    }

    // Ждем загрузки карты (ждем появления элемента карты)
    await page.waitForSelector("#searchboxinput", {
      timeout: 10000,
    });

    // Шаг 2: Поиск Тенерифе
    try {
      // Находим и очищаем поле ввода
      const searchInput = await page.locator("#searchboxinput");
      await searchInput.click();
      await searchInput.fill(searchQuery);

      // Нажимаем Enter для поиска
      await searchInput.press("Enter");

      console.log(`Поиск ${searchQuery} выполнен!`);

      // Ждем некоторое время, чтобы увидеть результаты поиска
      //await page.waitForTimeout(5000);

      // Шаг 3: Переход в раздел фотографий
      try {
        // Ждем появления кнопки "Посмотреть фото"
        await page.waitForSelector('text="Посмотреть фото"', {
          timeout: 10000,
        });

        // Кликаем по кнопке
        await page.click('text="Посмотреть фото"');

        console.log("Успешно перешли в раздел фотографий!");

        // Ждем загрузки фотографий
        //await page.waitForTimeout(1000);

        // Шаг 4: Переключение фотографий и сбор URL
        try {
          await page.waitForSelector('button[aria-label="Далее"]', {
            timeout: 10000,
          });

          // Создаем Set для хранения уникальных URL
          const photoUrls = new Set();

          // Функция для сбора URL изображений на текущей странице
          async function collectImageUrls() {
            const urls = await page.evaluate(() => {
              const images = document.querySelectorAll("img");
              return Array.from(images)
                .map((img) => img.src)
                .filter(
                  (src) => src && src.includes("googleusercontent.com/p/")
                )
                .map((src) => src.split("=")[0] + "=w2000"); // Получаем URL в высоком качестве
            });

            urls.forEach((url) => {
              if (!photoUrls.has(url)) {
                photoUrls.add(url);
                console.log("Найдено новое фото:", url);
              }
            });
          }

          // Собираем URL с первой фотографии
          await collectImageUrls();

          // Переключаем фотографии 5 раз и собираем URL
          for (let i = 0; i < 5; i++) {
            await page.click('button[aria-label="Далее"]');
            console.log(`Переключение фотографии ${i + 1} из 5`);
            //await page.waitForTimeout(2000);
            await collectImageUrls();
          }

          // Выводим итоговую статистику
          console.log("\nВсего найдено уникальных фотографий:", photoUrls.size);
          console.log("Список всех URL:");
          [...photoUrls].forEach((url, index) => {
            console.log(`${index + 1}. ${url}`);
          });
        } catch (error) {
          console.error("Ошибка при переключении фотографий:", error);
        }
      } catch (error) {
        console.error("Ошибка при переходе к фотографиям:", error);
      }
    } catch (error) {
      console.error("Ошибка при поиске:", error);
    }

    console.log("Google Maps успешно загружена!");

    // Здесь можно добавить дополнительные действия с картой

    // Пауза для просмотра результата
    //await page.waitForTimeout(5000);
  } catch (error) {
    console.error("Произошла ошибка:", error);
  } finally {
    // Проверяем существование context перед закрытием
    if (context) {
      await context.close();
    }

    const endTime = new Date();
    const executionTime = (endTime - startTime) / 1000;
    console.log("Скрипт завершен:", endTime.toLocaleTimeString());
    console.log(`Время выполнения: ${executionTime.toFixed(2)} секунд`);

    // Завершаем процесс Node.js
    process.exit(0);
  }
}

// Запускаем скрипт
runGoogleMaps().catch((error) => {
  console.error("Критическая ошибка:", error);
  process.exit(1);
});
