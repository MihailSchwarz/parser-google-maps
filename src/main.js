const { chromium } = require("playwright");
const path = require("path");
const searchQuery = "Тенерифе";

async function runGoogleMaps() {
  // Добавляем время начала выполнения
  const startTime = new Date();
  console.log("Скрипт запущен:", startTime.toLocaleTimeString());

  // Настраиваем путь к папке с кешем
  const userDataDir = path.join(__dirname, "browser-cache");

  // Список доменов, с которых не нужно загружать файлы
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
    //"www.google.com/maps/vt/",
    "*.googleusercontent.com",
  ];

  // Объявляем context в более широкой области видимости
  let context;

  try {
    // Запускаем браузер с постоянным контекстом для сохранения кеша
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      viewport: { width: 1200, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      acceptDownloads: true,
      serviceWorkers: "allow",
    });

    const page = await context.newPage();

    // Обработчик маршрутизации для блокировки нежелательных запросов
    await page.route("**/*", (route) => {
      const url = route.request().url();

      // Список дополнительных типов ресурсов для блокировки
      const blockedResourceTypes = ["image", "media", "font"];

      // Если URL содержит одно из значений из blockedDomains или является типом ресурса для блокировки
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

    // Шаг 1. Открываем Google Maps
    await page.goto("https://www.google.com/maps/?hl=ru");

    // Добавляем стили для отключения анимаций и переходов на странице
    await page.addStyleTag({
      content: `
        * {
          transition: none !important;
          animation: none !important;
        }
      `,
    });

    // Проверяем наличие окна с куки и нажимаем кнопку "Принять все", если нужно
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

    // Ждем появления поля ввода карты
    await page.waitForSelector("#searchboxinput", { timeout: 10000 });

    // Шаг 2. Поиск Тенерифе
    try {
      const searchInput = await page.locator("#searchboxinput");
      await searchInput.click();
      await searchInput.fill(searchQuery);
      await searchInput.press("Enter");
      console.log(`Поиск "${searchQuery}" выполнен!`);
    } catch (error) {
      console.error("Ошибка при поиске:", error);
    }

    // Шаг 3. Переход в раздел фотографий
    try {
      await page.waitForSelector('text="Посмотреть фото"', { timeout: 10000 });
      await page.click('text="Посмотреть фото"');
      console.log("Успешно перешли в раздел фотографий!");
    } catch (error) {
      console.error("Ошибка при переходе к фотографиям:", error);
    }

    // Шаг 4. Переключение фотографий и сбор URL
    try {
      await page.waitForSelector('button[aria-label="Далее"]', {
        timeout: 10000,
      });
      const photoUrls = new Set();

      // Функция для сбора URL изображений на странице с оптимизированным проходом по DOM
      async function collectImageUrls() {
        const urls = await page.evaluate(() => {
          const images = document.querySelectorAll("img");
          return Array.from(images).reduce((acc, img) => {
            const src = img.src;
            // Проверяем, что src существует и соответствует нужному паттерну
            if (src && src.includes("googleusercontent.com/p/")) {
              // Форматируем URL для получения изображения в высоком качестве
              acc.push(src.split("=")[0] + "=w2000");
            }
            return acc;
          }, []);
        });

        urls.forEach((url) => photoUrls.add(url));
      }

      // Собираем URL с первой фотографии
      await collectImageUrls();

      // Переключаем фотографии 5 раз, собираем URL после каждого переключения
      for (let i = 0; i < 10; i++) {
        await page.click('button[aria-label="Далее"]');
        await collectImageUrls();
      }

      console.log("\nВсего найдено уникальных фотографий:", photoUrls.size);
      console.log("Список всех URL:");
      [...photoUrls].forEach((url, index) => {
        console.log(`${index + 1}. ${url}`);
      });
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
    const executionTime = (endTime - startTime) / 1000;
    console.log("Скрипт завершен:", endTime.toLocaleTimeString());
    console.log(`Время выполнения: ${executionTime.toFixed(2)} секунд`);

    // Завершаем работу скрипта
    process.exit(0);
  }
}

// Запускаем скрипт
runGoogleMaps().catch((error) => {
  console.error("Критическая ошибка:", error);
  process.exit(1);
});
