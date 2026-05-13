# Добавляем поиск точек в эндпоинт /search
# Выполните этот скрипт, затем перезапустите бэкенд

import re

SEARCH_PATCH = '''
@app.get("/search")
def search_objects(q: str = "", type: Optional[str] = None, limit: int = 20):
    db = SessionLocal()
    results = []
    if not type or type == "person":
        persons = db.query(Person).filter(Person.display_name.contains(q)).limit(limit).all()
        for p in persons:
            results.append({"type": "person", "guid": p.guid, "name": p.display_name})
    if not type or type == "taxon":
        taxa = db.query(Taxon).filter((Taxon.genus.contains(q)) | (Taxon.species.contains(q)) | (Taxon.display_name.contains(q))).limit(limit).all()
        for t in taxa:
            results.append({"type": "taxon", "guid": t.guid, "name": t.display_name})
    if not type or type == "point":
        points = db.query(Point).filter(
            (Point.location_original.contains(q)) | 
            (Point.date_text.contains(q))
        ).limit(limit).all()
        for p in points:
            location = (p.location_original or "")[:80]
            results.append({
                "type": "point", 
                "guid": p.guid, 
                "name": location or "Точка",
                "location": location,
                "latitude": p.latitude,
                "longitude": p.longitude
            })
    db.close()
    return results
'''

print("Скопируйте следующий код и замените существующий эндпоинт /search в файле main.py:")
print(SEARCH_PATCH)
print("\nПосле замены перезапустите бэкенд: cd /path/to/backend && python main.py")
