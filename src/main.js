const express = require("express");
const { chromium } = require("playwright");
const path = require("path");

// Функция для выполнения поиска на Google Maps и сбора URL фотографий
async function runGoogleMaps(searchQuery) {
  const startTime = new Date();
  console.log("Скрипт запущен:", startTime.toLocaleTimeString());

  // Путь для хранения кеша браузера
  const userDataDir = path.join(__dirname, "browser-cache");

  // Изменяем список блокируемых доменов, убирая googleusercontent.com
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
      headless: true,
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
      const blockedResourceTypes = ["media", "font"]; // Убрали "image" из списка

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

    // ШАГ 1: Ожидаем появления поля поиска и выполняем поиск по запросу
    await page.waitForSelector("#searchboxinput", { timeout: 3000 });
    try {
      const searchInput = await page.locator("#searchboxinput");
      await searchInput.click();
      await searchInput.fill(searchQuery);
      await searchInput.press("Enter");
      console.log(`Поиск "${searchQuery}" выполнен!`);
    } catch (error) {
      console.error("Ошибка при поиске:", error);
      throw new Error("Не удалось выполнить поиск");
    }

    // ШАГ 2: Клик по первому результату поиска по фиксированным координатам
    try {
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      console.log(
        "Кликаем по первому результату с помощью фиксированных координат"
      );

      // Фиксированные координаты первой карточки
      await page.mouse.click(250, 180);
      console.log("Клик по координатам: x=250, y=180");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Проверяем, открылась ли карточка места в модальном окне
      const hasModalCard = await page.evaluate(() => {
        // Проверка наличия div с текстом "Сохранить" в модальном окне
        const divElements = document.querySelectorAll("div");
        return Array.from(divElements).some(
          (div) => div.textContent && div.textContent.includes("Сохранить")
        );
      });

      if (hasModalCard) {
        console.log(
          "Обнаружена карточка места в модальном окне, кликаем по фотографии"
        );

        // Используем фиксированные координаты вместо поиска h1
        console.log("Используем серию кликов по фиксированным координатам");

        // Первый клик - на верхнюю часть карточки, где обычно фото
        await page.mouse.click(700, 150);
        console.log("Клик по координатам: x=700, y=150");
        await page.waitForTimeout(500);

        // Второй клик - немного ниже
        await page.mouse.click(700, 180);
        console.log("Клик по координатам: x=700, y=180");
        await page.waitForTimeout(500);

        // Третий клик - по другой области
        await page.mouse.click(650, 200);
        console.log("Клик по координатам: x=650, y=200");
        await page.waitForTimeout(500);

        // Даем время для загрузки галереи
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.error("Ошибка при обработке результатов поиска:", error);
      throw error;
    }

    // ШАГ 3: Переход к разделу фотографий
    try {
      console.log("Ищем изображение для входа в галерею...");

      // Минимальное время ожидания для загрузки элементов страницы
      await page.waitForTimeout(500);

      // Сперва проверим, находимся ли мы уже в галерее
      const inGallery = await page.evaluate(() => {
        return (
          document.querySelector('a[data-photo-index="1"]') !== null ||
          document.querySelector('[data-photo-index="1"]') !== null
        );
      });

      if (!inGallery) {
        console.log("Мы не в галерее, ищем способ открыть фотографии...");
        console.log("Пробуем клик по фиксированным координатам...");

        // Кликаем в предполагаемое место фотографии без долгих ожиданий
        await page.mouse.click(700, 180);
        await page.waitForTimeout(500);
      } else {
        console.log("Мы уже находимся в галерее изображений");
      }

      // ШАГ 4: Сбор URL фотографий
      try {
        console.log("Собираем URL фотографий из галереи...");

        // Функция для извлечения URL изображений из тегов a с data-photo-index
        // Сразу выполняем функцию без долгих ожиданий
        const foundUrls = await page.evaluate(() => {
          const photoLinks = document.querySelectorAll("a[data-photo-index]");
          return Array.from(photoLinks).reduce((acc, link) => {
            // Берем первый вложенный div вместо поиска по классу
            const imageDiv =
              link.querySelector('div[role="img"]') ||
              link.querySelector("div");
            if (imageDiv && imageDiv.style && imageDiv.style.backgroundImage) {
              // Извлекаем URL из атрибута style background-image
              let bgImage = imageDiv.style.backgroundImage;
              // Удаляем url(" в начале и "); в конце
              let url = bgImage
                .replace(/^url\(['"]?/, "")
                .replace(/['"]?\)$/, "");

              // Удаляем кавычки, если они есть
              url = url.replace(/^"(.*)"$/, "$1");
              url = url.replace(/^'(.*)'$/, "$1");

              // Проверяем, что это действительно URL изображения, а не заглушка "//0"
              if (
                url &&
                url !== "//0" &&
                url.includes("googleusercontent.com")
              ) {
                // Форматируем URL для получения изображения в высоком качестве
                // Берем основную часть URL до параметров
                const baseUrl = url.split("=")[0];
                acc.push(baseUrl + "=w2000");
              }
            }
            return acc;
          }, []);
        });

        if (foundUrls.length > 0) {
          console.log(`Найдено ${foundUrls.length} фотографий в галерее`);
          foundUrls.forEach((url) => photoUrls.add(url));
        } else {
          console.log("Не удалось найти фотографии в галерее");
        }

        console.log("Всего найдено уникальных фотографий:", photoUrls.size);
      } catch (error) {
        console.error("Ошибка при сборе URL фотографий:", error);
      }
    } catch (error) {
      console.error("Ошибка при переходе к фотографиям:", error);
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
  return {
    urls: Array.from(photoUrls),
    executionTime: elapsedTime,
  };
}

// Создаем веб-сервер
const app = express();

// Маршрут /gm с параметром запроса q
app.get("/gm", async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({
        status: "error",
        error: "Параметр 'q' обязателен",
      });
    }
    console.log(`Получен запрос для поиска: ${searchQuery}`);

    // Выполняем поиск на Google Maps
    const result = await runGoogleMaps(searchQuery);

    // Проверяем, есть ли найденные URL
    const isSuccess = result.urls && result.urls.length > 0;

    res.json({
      status: isSuccess ? "success" : "error",
      query: searchQuery,
      executionTime: result.executionTime / 1000,
      urls: result.urls || [],
      error: isSuccess
        ? undefined
        : "Фотографии не найдены для данного запроса",
    });
  } catch (error) {
    console.error("Ошибка при выполнении поиска:", error);
    res.status(200).json({
      status: "error",
      query: searchQuery,
      executionTime: 0,
      urls: [],
      error: "Фотографии не найдены для данного запроса",
    });
  }
});

// Запускаем сервер на порту 39283 или используем порт, указанный в переменных окружения
const PORT = process.env.PORT || 39283;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
