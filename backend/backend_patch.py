# Добавьте следующие эндпоинты в конец файла main.py (перед if __name__ == "__main__")

"""
# ========== ПОЛУЧЕНИЕ ОБЪЕКТОВ, СВЯЗАННЫХ С ИССЛЕДОВАНИЕМ ==========
@app.get("/study_objects/{study_guid}")
def get_study_objects(study_guid: str):
    \"\"\"Получить все объекты (точки и таксоны), связанные с исследованием\"\"\"
    db = SessionLocal()
    try:
        # Ищем все связи, где target = study (исследование является целью)
        links = db.query(Link).filter(
            Link.to_guid == study_guid,
            Link.to_type == "study",
            Link.relation_type == "source"
        ).all()
        
        objects = []
        for link in links:
            obj_type = link.from_type
            obj_guid = link.from_guid
            
            if obj_type == "point":
                obj = db.query(Point).filter(Point.guid == obj_guid).first()
                if obj:
                    objects.append({
                        "link_guid": link.link_guid,
                        "guid": obj.guid,
                        "type": "point",
                        "typeLabel": "📍 Точка",
                        "name": (obj.location_original or "")[:100] or "Точка без названия",
                        "location": obj.location_original,
                        "date": obj.date_text
                    })
            elif obj_type == "taxon":
                obj = db.query(Taxon).filter(Taxon.guid == obj_guid).first()
                if obj:
                    objects.append({
                        "link_guid": link.link_guid,
                        "guid": obj.guid,
                        "type": "taxon",
                        "typeLabel": "🔬 Таксон",
                        "name": obj.display_name or f"{obj.genus} {obj.species or ''}",
                        "genus": obj.genus,
                        "species": obj.species
                    })
        
        return objects
    finally:
        db.close()

@app.get("/search_points")
def search_points(q: str = "", limit: int = 20):
    \"\"\"Поиск точек по location_original или координатам\"\"\"
    db = SessionLocal()
    try:
        # Ищем по location_original
        points = db.query(Point).filter(
            Point.location_original.contains(q)
        ).limit(limit).all()
        
        # Если ничего не найдено, пробуем парсить координаты из строки
        if not points and q:
            # Пробуем распарсить как координаты
            import re
            coord_pattern = r'(\d{1,3}°\d{1,2}\'[\d.]*"[NS])\s*(\d{1,3}°\d{1,2}\'[\d.]*"[EW])'
            match = re.search(coord_pattern, q)
            if match:
                # Если нашли DMS координаты, ищем точки рядом (упрощённо - просто возвращаем все)
                points = db.query(Point).filter(
                    (Point.latitude.isnot(None)) & (Point.longitude.isnot(None))
                ).limit(limit).all()
        
        result = []
        for p in points:
            result.append({
                "type": "point",
                "guid": p.guid,
                "name": (p.location_original or "")[:80] or "Точка",
                "location": p.location_original,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "date": p.date_text
            })
        return result
    finally:
        db.close()

@app.get("/search_taxa_extended")
def search_taxa_extended(q: str = "", limit: int = 20):
    \"\"\"Расширенный поиск таксонов\"\"\"
    db = SessionLocal()
    try:
        taxa = db.query(Taxon).filter(
            (Taxon.genus.contains(q)) | 
            (Taxon.species.contains(q)) | 
            (Taxon.display_name.contains(q))
        ).limit(limit).all()
        
        result = []
        for t in taxa:
            result.append({
                "type": "taxon",
                "guid": t.guid,
                "name": t.display_name or f"{t.genus} {t.species or ''}",
                "genus": t.genus,
                "species": t.species
            })
        return result
    finally:
        db.close()
"""
