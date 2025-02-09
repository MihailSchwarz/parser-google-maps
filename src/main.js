const express = require("express");
const { chromium } = require("playwright");
const path = require("path");

// Функция для выполнения поиска на Google Maps и сбора URL фотографий
async function runGoogleMaps(searchQuery) {
  const startTime = new Date();
  console.log("Скрипт запущен:", startTime.toLocaleTimeString());

  // Путь для хранения кеша браузера
  const userDataDir = path.join(__dirname, "browser-cache");

  // Список доменов для блокировки ненужных ресурсов
  const blockedDomains = [
    "*.googlevideo.com",
    "*.doubleclick.net",
    "*.google-analytics.com",
    "*.analytics.google.com",
    "*.googletagmanager.com",
    "*.googleadservices.com",
    "*.googlesyndication.com",
    "maps.gstatic.com",
    "ssl.gstatic.com",
    "fonts.gstatic.com",
    "*.googleusercontent.com",
  ];

  let context;
  let photoUrls = new Set();
  let elapsedTime = 0; // Переменная для хранения времени выполнения

  try {
    // Запускаем браузер в headless режиме
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1200, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      acceptDownloads: true,
      serviceWorkers: "allow",
    });

    const page = await context.newPage();

    // Блокируем запросы к лишним ресурсам для ускорения работы
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const blockedResourceTypes = ["image", "media", "font"];

      const shouldBlock =
        blockedDomains.some((pattern) => {
          const check = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
          return url.includes(check);
        }) ||
        blockedResourceTypes.some((resourceType) =>
          route.request().resourceType().includes(resourceType)
        );

      if (shouldBlock) {
        return route.abort();
      }
      return route.continue();
    });

    // Открываем Google Maps
    await page.goto("https://www.google.com/maps/?hl=ru");

    // Отключаем анимации и переходы, чтобы ускорить отрисовку страницы
    await page.addStyleTag({
      content: `
        * {
          transition: none !important;
          animation: none !important;
        }
      `,
    });

    // Обработка окна с куки (если оно появляется)
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

    // Ожидаем появления поля поиска и выполняем поиск по запросу
    await page.waitForSelector("#searchboxinput", { timeout: 10000 });
    try {
      const searchInput = await page.locator("#searchboxinput");
      await searchInput.click();
      await searchInput.fill(searchQuery);
      await searchInput.press("Enter");
      console.log(`Поиск "${searchQuery}" выполнен!`);
    } catch (error) {
      console.error("Ошибка при поиске:", error);
    }

    // Переход к разделу фотографий
    try {
      // Ждем загрузки контента и пробуем найти кнопку с фотографиями разными способами
      await page.waitForTimeout(2000); // Даем время для загрузки контента

      const photoButtonSelectors = [
        'div.fontBodyMedium:has-text("Посмотреть фото")',
        'text="Посмотреть фото"',
        'span.fontBodyMedium:has-text("Фото")',
        'span:text("Фото")',
      ];

      let buttonFound = false;
      for (const selector of photoButtonSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            buttonFound = true;
            console.log(
              `Успешно перешли в раздел фотографий используя селектор: ${selector}`
            );
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!buttonFound) {
        throw new Error("Не удалось найти кнопку для перехода к фотографиям");
      }
    } catch (error) {
      console.error("Ошибка при переходе к фотографиям:", error);
    }

    // Сбор URL фотографий
    try {
      await page.waitForSelector('button[aria-label="Далее"]', {
        timeout: 10000,
      });

      // Функция для сбора URL изображений на странице
      async function collectImageUrls() {
        const urls = await page.evaluate(() => {
          const images = document.querySelectorAll("img");
          return Array.from(images).reduce((acc, img) => {
            const src = img.src;
            if (src && src.includes("googleusercontent.com/p/")) {
              // Форматируем URL для получения изображения в высоком качестве
              acc.push(src.split("=")[0] + "=w2000");
            }
            return acc;
          }, []);
        });
        urls.forEach((url) => photoUrls.add(url));
      }

      // Собираем URL с текущей фотографии
      await collectImageUrls();

      // Переключаем фотографии несколько раз для сбора всех URL
      for (let i = 0; i < 15; i++) {
        await page.click('button[aria-label="Далее"]');
        await collectImageUrls();
      }

      console.log("Всего найдено уникальных фотографий:", photoUrls.size);
    } catch (error) {
      console.error("Ошибка при переключении фотографий:", error);
    }
  } catch (error) {
    console.error("Произошла ошибка:", error);
  } finally {
    if (context) {
      await context.close();
    }
    const endTime = new Date();
    console.log("Скрипт завершен:", endTime.toLocaleTimeString());
    elapsedTime = endTime - startTime; // Вычисляем время выполнения (в миллисекундах)
  }

  // Возвращаем объект с найденными URL и временем выполнения
  return { urls: Array.from(photoUrls), executionTime: elapsedTime };
}

// Создаем веб-сервер
const app = express();

// Маршрут /gm с параметром запроса q
app.get("/gm", async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({ error: "Параметр 'q' обязателен" });
    }
    console.log(`Получен запрос для поиска: ${searchQuery}`);

    // Выполняем поиск на Google Maps
    const result = await runGoogleMaps(searchQuery);
    res.json({
      query: searchQuery,
      executionTime: result.executionTime / 1000,
      urls: result.urls,
    });
  } catch (error) {
    console.error("Ошибка при выполнении поиска:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// Запускаем сервер на порту 3000 или используем порт, указанный в переменных окружения
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
