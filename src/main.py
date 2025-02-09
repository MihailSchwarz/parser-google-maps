from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
import fnmatch
import time
import os

def scrape_google_maps(search_query: str):
    start_time = time.time()  # Начало отсчета времени
    
    # Создаем директорию для кеша если её нет
    cache_dir = os.path.join(os.getcwd(), 'browser_cache')
    os.makedirs(cache_dir, exist_ok=True)
    
    # Список заблокированных доменов
    blocked_domains = [
        "*.googlevideo.com",
        "*.doubleclick.net",
        "*.google-analytics.com",
        "*.analytics.google.com",
        "*.googletagmanager.com",
        "*.googleadservices.com",
        "*.googleusercontent.com",
        "*.googlesyndication.com",
        "maps.gstatic.com",
        "ssl.gstatic.com",
        "lh3.googleusercontent.com",
        "lh4.googleusercontent.com",
        "lh5.googleusercontent.com",
        "www.google.com/maps/vt/",
        "fonts.gstatic.com"
    ]

    def should_block(url):
        try:
            domain = urlparse(url).netloc
            return any(fnmatch.fnmatch(domain, pattern) for pattern in blocked_domains)
        except:
            return False

    with sync_playwright() as p:
        # Настройка браузера с включенным кешированием
        browser = p.chromium.launch(
            headless=False,  # Включаем headless режим
            args=[
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                f"--disk-cache-dir={cache_dir}",
                "--disk-cache-size=104857600",
                "--media-cache-size=104857600",
                "--enable-aggressive-domstorage-flushing",
                "--disable-dev-shm-usage",  # Важно для headless режима
                "--no-sandbox",  # Важно для headless режима
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-software-rasterizer"
            ]
        )
        
        # Настройка контекста страницы с сохранением состояния
        context = browser.new_context(
            viewport={'width': 1200, 'height': 900},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            storage_state=os.path.join(cache_dir, 'storage_state.json') if os.path.exists(os.path.join(cache_dir, 'storage_state.json')) else None,
            java_script_enabled=True,  # Явно включаем JavaScript
            ignore_https_errors=True  # Игнорируем ошибки HTTPS
        )
        
        # Создаем страницу
        page = context.new_page()
        
        # Включаем кеширование для страницы
        page.route("**/*", lambda route: route.continue_() if not should_block(route.request.url) else route.abort(), times=None)
        
        # Устанавливаем более длительные таймауты для headless режима
        page.set_default_timeout(10000)
        page.set_default_navigation_timeout(10000)
        
        # Загружаем страницу с ожиданием загрузки сети
        page.goto("https://www.google.com/maps?hl=en", wait_until="networkidle")
        
        # Обработка окна с cookie
        try:
            # Быстрая проверка наличия cookie окна
            has_cookie_dialog = page.evaluate("""() => {
                return document.querySelector('form[action="https://consent.google.com/save"]') !== null ||
                       document.querySelector('.baseButtonGm3.filledButtonGm3[value="Accept all"]') !== null;
            }""")
            
            if has_cookie_dialog:
                # Пробуем найти и кликнуть кнопку через JavaScript
                page.evaluate("""() => {
                    const button = document.querySelector('form[action="https://consent.google.com/save"] input[type="submit"][value="Accept all"]') ||
                                document.querySelector('.baseButtonGm3.filledButtonGm3[value="Accept all"]');
                    if (button) button.click();
                }""")
                page.wait_for_load_state("networkidle")
        except Exception as e:
            print(f"Cookie окно не найдено или уже обработано")
        
        # Поиск локации через JavaScript
        page.evaluate(f"""(query) => {{
            const input = document.querySelector('#searchboxinput');
            if (input) {{
                input.value = query;
                input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                input.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }}));
            }}
        }}""", search_query)
        
        page.wait_for_load_state("networkidle")
        
        # Ожидание загрузки результатов и клик по фото
        try:
            # Ждем и кликаем по первой фотографии через JavaScript
            page.wait_for_selector('.aoRNLd.kn2E5e[aria-label*="Photo of"], button.aoRNLd[jsaction*="heroHeaderImage"]', timeout=10000)
            page.evaluate("""() => {
                const button = document.querySelector('.aoRNLd.kn2E5e[aria-label*="Photo of"]') || 
                             document.querySelector('button.aoRNLd[jsaction*="heroHeaderImage"]');
                if (button) button.click();
            }""")
            
            # Собираем URL всех фотографий
            photo_urls = set()
            
            # Функция для обработки изображений через JavaScript
            def process_images():
                urls = page.evaluate("""() => {
                    const images = document.querySelectorAll('img[src*="googleusercontent.com/p/"]');
                    return Array.from(images).map(img => {
                        const url = img.getAttribute('src');
                        return url ? url.split('=')[0] + '=w2000' : null;
                    }).filter(url => url);
                }""")
                for url in urls:
                    if url not in photo_urls:
                        photo_urls.add(url)
                        print(f"Найдено новое фото: {url}")
            
            # Сначала собираем фотографии с текущей страницы
            process_images()
            
            # Переключаем фотографии и собираем URL
            for i in range(6):
                try:
                    # Ищем и кликаем кнопку через JavaScript
                    has_next = page.evaluate("""() => {
                        const button = document.querySelector('button.eU5Rrb.waIsr.AnCkCf[jsaction*="play.onRightClick"]');
                        if (button) {
                            button.scrollIntoView();
                            button.click();
                            return true;
                        }
                        return false;
                    }""")
                    
                    if has_next:
                        print(f"Переключение на следующую фотографию {i+1}/6")
                        page.wait_for_load_state("networkidle", timeout=5000)
                        process_images()
                    else:
                        break
                except Exception as e:
                    print(f"Ошибка при переключении фото: {str(e)}")
                    break
            
            # Преобразуем set обратно в список для вывода
            photo_urls = sorted(list(photo_urls))
            
            print(f"\nВсего найдено уникальных фотографий: {len(photo_urls)}")
            for idx, url in enumerate(photo_urls, 1):
                print(f"{idx}. {url}")
            
        except Exception as e:
            print(f"Ошибка при работе с фотографиями: {str(e)}")
        
        # Сохраняем состояние перед закрытием
        context.storage_state(path=os.path.join(cache_dir, 'storage_state.json'))
        browser.close()
    
    # Вычисляем и выводим время выполнения
    execution_time = time.time() - start_time
    print(f"\nВремя выполнения скрипта: {execution_time:.2f} секунд")

# Использование
scrape_google_maps("Южный аэропорт Тенерифе")
