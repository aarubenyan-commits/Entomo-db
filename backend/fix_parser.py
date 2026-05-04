# Заменяем функцию parse_collector
import re

def parse_collector_fixed(text):
    # Ищем leg. D. Fominykh или leg. Fominykh
    match = re.search(r'leg\.\s+([A-Z]\.?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', text)
    if match:
        return match.group(1).strip()
    return "Рубенян А."

def parse_coordinates_fixed(text):
    # Поддерживаем как точку, так и запятую в секундах
    # N38°42'20,53" → N38°42'20.53"
    text = re.sub(r"(\d+),(\d+)", r"\1.\2", text)
    pattern = r'N(\d{1,2})°(\d{1,2})\'([\d.]+)"\s+E(\d{1,2})°(\d{1,2})\'([\d.]+)"'
    match = re.search(pattern, text)
    if match:
        lat = float(match.group(1)) + float(match.group(2))/60 + float(match.group(3))/3600
        lon = float(match.group(4)) + float(match.group(5))/60 + float(match.group(6))/3600
        return lat, lon
    return None, None

print("Функции готовы")
