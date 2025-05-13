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

    // Ожидаем появления поля поиска и выполняем поиск по запросу
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

    // Проверка на страницу результатов поиска и клик по первому результату
    try {
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Проверяем, есть ли заголовок "Результаты"
      const hasResultsHeader = await page.evaluate(() => {
        const h1Elements = document.querySelectorAll("h1");
        for (const h1 of h1Elements) {
          if (h1.textContent.includes("Результаты")) {
            return true;
          }
        }
        return false;
      });

      console.log(`Обнаружен заголовок "Результаты": ${hasResultsHeader}`);

      // Если обнаружен заголовок "Результаты", кликаем по первому элементу списка
      if (hasResultsHeader) {
        console.log(
          "Находимся на странице результатов, выбираем первый элемент списка"
        );

        // Попытка найти и кликнуть по первому результату в списке
        try {
          const firstResultSelectors = [
            // Селекторы для первого результата
            'div[role="feed"] > div:first-child',
            'a[href^="https://www.google.com/maps/place/"]:first-child',
            "div.Nv2PK:first-child",
            "div.THOPZb:first-child",
          ];

          let resultClicked = false;

          // Пробуем использовать селекторы
          for (const selector of firstResultSelectors) {
            try {
              if (await page.isVisible(selector)) {
                await page.click(selector);
                console.log(
                  `Успешно кликнули по первому результату с селектором: ${selector}`
                );
                resultClicked = true;
                break;
              }
            } catch (e) {
              console.log(
                `Не удалось использовать селектор ${selector}: ${e.message}`
              );
            }
          }

          // Если селекторы не сработали, используем координаты
          if (!resultClicked) {
            console.log(
              "Селекторы не сработали, используем клик по координатам для первого результата"
            );

            // Получаем размеры экрана
            const dimensions = await page.evaluate(() => {
              return {
                width: window.innerWidth,
                height: window.innerHeight,
              };
            });

            // Координаты первого результата (обычно находится в верхней части списка)
            // Примерно 1/5 ширины экрана и 1/4 высоты от верха
            const x = Math.floor(dimensions.width * 0.2);
            const y = Math.floor(dimensions.height * 0.25);

            console.log(
              `Клик по координатам первого результата: x=${x}, y=${y}`
            );
            await page.mouse.click(x, y);
            resultClicked = true;
          }

          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(1000);
        } catch (e) {
          console.log(`Ошибка при обработке первого результата: ${e.message}`);
        }
      } else {
        // Стандартные селекторы для результатов поиска (существующий код)
        const resultSelectors = [
          'a[href^="https://www.google.com/maps/place/"]',
          'div[role="feed"] > div > div',
          'a:has(div[aria-label*="звезд"])',
          'div[role="main"] > div > div > div:first-child',
          'a[jsaction*="click"]',
        ];

        let resultClicked = false;

        // Пробуем клик через селекторы
        for (const selector of resultSelectors) {
          try {
            const elements = await page.$$(selector);
            if (elements && elements.length > 0) {
              console.log(`Найден результат по селектору: ${selector}`);
              await elements[0].click();
              resultClicked = true;
              console.log("Успешно перешли к деталям места");
              await page.waitForLoadState("networkidle");
              await page.waitForTimeout(1000);
              break;
            }
          } catch (e) {
            console.log(
              `Не удалось использовать селектор ${selector}: ${e.message}`
            );
            continue;
          }
        }

        // Если селекторы не сработали, пробуем клик по координатам
        if (!resultClicked) {
          console.log(
            "Не удалось кликнуть по селекторам, пробуем клик по координатам..."
          );
          try {
            // Ждем загрузки результатов
            await page.waitForTimeout(1000);

            // Получаем размеры страницы
            const dimensions = await page.evaluate(() => {
              return {
                width: window.innerWidth,
                height: window.innerHeight,
              };
            });

            // Позиция для клика по первой карточке
            // Примерные координаты: 25% ширины, 30% высоты от верха
            const x = Math.floor(dimensions.width * 0.25);
            const y = Math.floor(dimensions.height * 0.3);

            console.log(`Клик по координатам: x=${x}, y=${y}`);

            // Выполняем клик по координатам
            await page.mouse.click(x, y);

            // Даем время для загрузки
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(2000);

            resultClicked = true;
          } catch (e) {
            console.log(`Ошибка при клике по координатам: ${e.message}`);
          }
        }

        // Если и координаты не помогли - пробуем клик по фиксированным координатам для первого элемента
        if (!resultClicked) {
          console.log("Пробуем клик по фиксированным координатам...");
          try {
            // Фиксированные координаты первой карточки на основе скриншота
            await page.mouse.click(250, 180);
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(2000);
            resultClicked = true;
          } catch (e) {
            console.log(
              `Ошибка при клике по фиксированным координатам: ${e.message}`
            );
          }
        }

        if (!resultClicked) {
          throw new Error("Не удалось перейти к деталям места");
        }
      }

      // Проверяем, открылась ли карточка места в модальном окне
      const hasModalCard = await page.evaluate(() => {
        // Проверка наличия заголовка места в модальном окне
        const modalTitle = document.querySelector(".fontHeadlineLarge");
        return (
          modalTitle !== null &&
          (document.querySelector(".m6QErb.tLjsW.eKbjU") !== null || // Типичный контейнер модального окна
            document.querySelector(".m6QErb.DxyBCb.kA9KIf.dS8AEf") !== null) // Альтернативный контейнер
        );
      });

      if (hasModalCard) {
        console.log(
          "Обнаружена карточка места в модальном окне, кликаем по фотографии"
        );

        try {
          // Пробуем сначала использовать селекторы для главной фотографии в модальном окне
          const modalPhotoSelectors = [
            'button[aria-label*="Фото"]',
            'button[jsaction*="hero"]',
            'img[src*="googleusercontent.com"]',
            ".tEVN5b", // Основной контейнер фото в карточке
            ".RZ66Rb", // Изображение в верхней части карточки
          ];

          let photoClicked = false;

          // Пробуем использовать селекторы
          for (const selector of modalPhotoSelectors) {
            if (await page.isVisible(selector)) {
              console.log(`Найдена фотография по селектору: ${selector}`);
              await page.click(selector);
              photoClicked = true;
              break;
            }
          }

          // Если селекторы не сработали, кликаем по координатам в области красного круга
          if (!photoClicked) {
            console.log(
              "Селекторы фотографии не сработали, кликаем по координатам в области фото"
            );

            // Получаем размеры окна
            const dimensions = await page.evaluate(() => {
              return {
                width: window.innerWidth,
                height: window.innerHeight,
              };
            });

            // Координаты для клика по фото в верхней части модального окна
            // Примерно по центру верхней части окна, где обычно расположено главное фото
            const x = Math.floor(dimensions.width * 0.7); // Примерно 70% ширины (правая часть экрана)
            const y = Math.floor(dimensions.height * 0.25); // Примерно 25% высоты (верхняя часть модального окна)

            console.log(`Клик по координатам фотографии: x=${x}, y=${y}`);
            await page.mouse.click(x, y);

            // Дополнительный клик по центру модального окна, если первый не сработал
            await page.waitForTimeout(1000);
            const centerX = Math.floor(dimensions.width * 0.7);
            const centerY = Math.floor(dimensions.height * 0.4);
            console.log(
              `Дополнительный клик по центру модального окна: x=${centerX}, y=${centerY}`
            );
            await page.mouse.click(centerX, centerY);

            photoClicked = true;
          }

          // Ждем загрузки галереи
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(2000);
        } catch (e) {
          console.log(
            `Ошибка при взаимодействии с фотографией в модальном окне: ${e.message}`
          );
        }
      }
    } catch (error) {
      console.error("Ошибка при обработке результатов поиска:", error);
      throw error;
    }

    // Переход к разделу фотографий
    try {
      await page.waitForTimeout(2000);
      console.log("Ищем изображение для входа в галерею...");

      // Сперва проверим, находимся ли мы уже в галерее
      const inGallery = await page.evaluate(() => {
        return (
          document.querySelector('img[src*="googleusercontent.com/p/"]') !==
          null
        );
      });

      if (!inGallery) {
        console.log("Мы не в галерее, ищем способ открыть фотографии...");

        // Расширенный список селекторов для доступа к фотографиям
        const photoEntrySelectors = [
          // Главное изображение в карточке объекта
          'button[data-index="0"]',
          'button[jsaction*="pane.heroHeaderImage.click"]',
          'img[src*="googleusercontent.com"]',
          'div[style*="background-image"]',
          'div[data-index="0"]',
          // Контейнеры изображений
          'div[role="img"]',
          // Табы с фотографиями
          'button[aria-label*="фотография"]',
          // Обычно миниатюры внизу карточки
          "a[data-photo-index]",
          // Блок с основной фотографией вверху
          'div[jsaction*="scale"]',
          // Дополнительные селекторы для карточек мест
          ".bJzME.Hu9e2e.tTVLSc", // Контейнер с фото
          ".RZ66Rb", // Фото в новом дизайне
          ".tEVN5b", // Контейнер с изображением
          // Изображение по атрибутам
          'img[alt*="фото"]',
          'img[alt*="Фото"]',
          // По классам
          ".aoRNLd",
          // Дополнительные селекторы кнопок
          'button[jsaction*="openPhotos"]',
          'button[jsaction*="preview"]',
        ];

        let imageClicked = false;

        // Пробуем найти и нажать на элемент из списка селекторов
        for (const selector of photoEntrySelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              console.log(`Найден элемент фотографии: ${selector}`);
              await element.click();
              console.log(`Кликнули по элементу: ${selector}`);
              imageClicked = true;
              await page.waitForTimeout(2000);
              break;
            }
          } catch (e) {
            // Продолжаем перебор селекторов
          }
        }

        // Если селекторы не сработали, используем координаты
        if (!imageClicked) {
          console.log("Селекторы не сработали, пробуем клик по координатам");

          const dimensions = await page.evaluate(() => {
            return {
              width: window.innerWidth,
              height: window.innerHeight,
            };
          });

          // Координаты для различных мест на странице, которые могут быть фотографиями
          const clickCoordinates = [
            // Верхняя часть экрана - обычно главное фото
            {
              x: Math.floor(dimensions.width * 0.7),
              y: Math.floor(dimensions.height * 0.2),
            },
            // Центр модального окна
            {
              x: Math.floor(dimensions.width * 0.7),
              y: Math.floor(dimensions.height * 0.4),
            },
            // Верхняя левая часть модального окна
            {
              x: Math.floor(dimensions.width * 0.6),
              y: Math.floor(dimensions.height * 0.2),
            },
            // Фиксированные координаты на основе скриншота
            { x: 700, y: 180 },
            { x: 750, y: 200 },
          ];

          for (const coords of clickCoordinates) {
            try {
              console.log(`Клик по координатам: x=${coords.x}, y=${coords.y}`);
              await page.mouse.click(coords.x, coords.y);
              await page.waitForTimeout(2000);

              // Проверяем, открылась ли галерея
              const galleryOpened = await page.evaluate(() => {
                return (
                  document.querySelector(
                    'img[src*="googleusercontent.com/p/"]'
                  ) !== null
                );
              });

              if (galleryOpened) {
                console.log("Галерея открылась после клика по координатам");
                imageClicked = true;
                break;
              }
            } catch (e) {
              console.log(`Ошибка при клике по координатам: ${e.message}`);
            }
          }
        }

        console.log(
          imageClicked
            ? "Успешно перешли в галерею изображений"
            : "Не удалось перейти в галерею"
        );
      } else {
        console.log("Мы уже находимся в галерее изображений");
      }

      // Сбор URL фотографий
      try {
        // Проверяем, есть ли кнопка "Далее"
        const hasNextButton = await page.evaluate(() => {
          // Различные варианты текста кнопки следующего фото
          const nextTexts = ["Далее", "Next", "Следующая", "Следующее", "→"];
          const buttons = Array.from(document.querySelectorAll("button"));

          return buttons.some((btn) => {
            const text = btn.textContent || btn.innerText || "";
            const ariaLabel = btn.getAttribute("aria-label") || "";
            return nextTexts.some(
              (nextText) =>
                text.includes(nextText) || ariaLabel.includes(nextText)
            );
          });
        });

        if (hasNextButton) {
          console.log("Кнопка 'Далее' найдена в галерее");
        } else {
          console.log("Кнопка 'Далее' не найдена, ищем по селекторам");
        }

        // Расширенный список селекторов для кнопки "Далее"
        const nextButtonSelectors = [
          'button[aria-label="Далее"]',
          'button[aria-label="Next"]',
          'button[aria-label="Следующая фотография"]',
          'button[jsaction*="rightNavigationButtonPress"]',
          "button.gTozgf",
          "button.VfPpkd-Bz112c-LgbsSe",
          "button.eU5Rrb.waIsr.AnCkCf",
          // Дополнительные селекторы по стилям и атрибутам
          'button[data-navigation-direction="forward"]',
          'button:has(svg[xmlns="http://www.w3.org/2000/svg"])',
        ];

        // Функция для сбора URL изображений на странице
        async function collectImageUrls() {
          const urls = await page.evaluate(() => {
            const images = document.querySelectorAll("img");
            return Array.from(images).reduce((acc, img) => {
              const src = img.src || "";
              if (src && src.includes("googleusercontent.com/p/")) {
                // Форматируем URL для получения изображения в высоком качестве
                acc.push(src.split("=")[0] + "=w2000");
              }
              return acc;
            }, []);
          });

          if (urls.length > 0) {
            console.log(
              `Найдено ${urls.length} фотографий на текущей странице`
            );
            return urls;
          } else {
            console.log("Не удалось найти фотографии на текущей странице");
            return [];
          }
        }

        // Собираем URL с текущей фотографии
        const initialUrls = await collectImageUrls();
        initialUrls.forEach((url) => photoUrls.add(url));

        console.log("Всего найдено уникальных фотографий:", photoUrls.size);
      } catch (error) {
        console.error("Ошибка при переключении фотографий:", error);
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
