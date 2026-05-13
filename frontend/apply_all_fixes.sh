#!/bin/bash

echo "=== ENTOMO-DB: Применение исправлений ==="
echo ""

# ПУТИ - ИЗМЕНИТЕ ПОД ВАШУ СИСТЕМУ!
FRONTEND_SRC="/Users/aarubenyan/Projects/Entomo-db/frontend/src/components"
BACKEND_DIR="/Users/aarubenyan/Projects/Entomo-db/backend"

echo "Используемые пути:"
echo "  Frontend components: $FRONTEND_SRC"
echo "  Backend directory: $BACKEND_DIR"
echo ""

# Проверка существования путей
if [ ! -d "$FRONTEND_SRC" ]; then
    echo "❌ Ошибка: Папка $FRONTEND_SRC не существует"
    echo "   Пожалуйста, укажите правильный путь к frontend/src/components"
    exit 1
fi

if [ ! -f "$BACKEND_DIR/main.py" ]; then
    echo "❌ Ошибка: Файл $BACKEND_DIR/main.py не найден"
    echo "   Пожалуйста, укажите правильный путь к backend"
    exit 1
fi

# 1. Копируем StudyManager.jsx
if [ -f "StudyManager.jsx" ]; then
    cp StudyManager.jsx "$FRONTEND_SRC/StudyManager.jsx"
    echo "✅ StudyManager.jsx обновлён"
else
    echo "❌ StudyManager.jsx не найден в текущей директории"
    echo "   Сначала создайте файл StudyManager.jsx"
    exit 1
fi

# 2. Добавляем эндпоинты в бэкенд
echo ""
echo "⚠️  Для бэкенда необходимо добавить новые эндпоинты:"
echo ""
echo "Добавьте следующий код в конец файла $BACKEND_DIR/main.py (перед if __name__ == '__main__'):"
echo ""
cat backend_patch.py
echo ""
echo "После добавления перезапустите бэкенд:"
echo "  cd $BACKEND_DIR && pkill -f uvicorn && python main.py &"
echo ""
echo "3. Пересоберите фронтенд:"
echo "  cd $(dirname $FRONTEND_SRC) && npm run build"
echo ""
echo "4. Перезагрузите страницу в браузере (Ctrl+Shift+R)"
