# ========== МАССОВОЕ РЕДАКТИРОВАНИЕ ==========
class BulkEditRequest(BaseModel):
    point_guids: List[str]
    updates: dict

@app.post("/points/bulk-update")
def bulk_update_points(request: BulkEditRequest):
    """
    Массовое обновление точек.
    """
    db = SessionLocal()
    now = datetime.now().isoformat()
    updated_count = 0
    errors = []
    
    try:
        points = db.query(Point).filter(Point.guid.in_(request.point_guids)).all()
        
        new_person = None
        if "collector_name" in request.updates and request.updates["collector_name"]:
            collector_name = request.updates["collector_name"]
            new_person = db.query(Person).filter(Person.display_name == collector_name).first()
            if not new_person:
                new_person = Person(display_name=collector_name, created_at=now, updated_at=now)
                db.add(new_person)
                db.flush()
        
        study = None
        if "study_guid" in request.updates and request.updates["study_guid"]:
            study_guid = request.updates["study_guid"]
            study = db.query(Study).filter(Study.guid == study_guid).first()
            if not study:
                errors.append(f"Исследование с GUID {study_guid} не найдено")
        
        new_taxa = []
        if "taxa_guids" in request.updates and request.updates["taxa_guids"]:
            taxa_guids = request.updates["taxa_guids"]
            new_taxa = db.query(Taxon).filter(Taxon.guid.in_(taxa_guids)).all()
            if len(new_taxa) != len(taxa_guids):
                errors.append("Некоторые таксоны не найдены")
        
        for point in points:
            if new_person:
                db.query(Link).filter(
                    Link.to_guid == point.guid,
                    Link.from_type == "person",
                    Link.relation_type == "collected_at"
                ).delete()
                link = Link(
                    from_guid=new_person.guid, to_guid=point.guid,
                    from_type="person", to_type="point", relation_type="collected_at",
                    direction="one_to_many", is_directed=1,
                    created_at=now, updated_at=now
                )
                db.add(link)
                point.updated_at = now
            
            if study:
                existing_link = db.query(Link).filter(
                    Link.from_guid == point.guid,
                    Link.to_guid == study.guid,
                    Link.from_type == "point",
                    Link.to_type == "study",
                    Link.relation_type == "source"
                ).first()
                if not existing_link:
                    link = Link(
                        from_guid=point.guid, to_guid=study.guid,
                        from_type="point", to_type="study", relation_type="source",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    )
                    db.add(link)
                point.updated_at = now
            
            if new_taxa:
                db.query(Link).filter(
                    Link.to_guid == point.guid,
                    Link.from_type == "taxon",
                    Link.relation_type == "has_taxon"
                ).delete()
                for taxon in new_taxa:
                    link = Link(
                        from_guid=taxon.guid, to_guid=point.guid,
                        from_type="taxon", to_type="point", relation_type="has_taxon",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    )
                    db.add(link)
                point.updated_at = now
            
            updated_count += 1
        
        db.commit()
        
        return {
            "message": f"Обновлено точек: {updated_count}",
            "updated_count": updated_count,
            "errors": errors
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Ошибка при массовом обновлении: {str(e)}")
    finally:
        db.close()

@app.post("/points/bulk-info")
def get_bulk_info(point_guids: List[str]):
    """
    Получает информацию о выбранных точках.
    """
    db = SessionLocal()
    try:
        points = db.query(Point).filter(Point.guid.in_(point_guids)).all()
        
        collectors = set()
        study_guids = set()
        taxa_guids = set()
        
        for point in points:
            collector_link = db.query(Link).filter(
                Link.to_guid == point.guid,
                Link.from_type == "person",
                Link.relation_type == "collected_at"
            ).first()
            if collector_link:
                person = db.query(Person).filter(Person.guid == collector_link.from_guid).first()
                if person:
                    collectors.add(person.display_name)
            
            source_links = db.query(Link).filter(
                Link.from_guid == point.guid,
                Link.from_type == "point",
                Link.relation_type == "source"
            ).all()
            for link in source_links:
                study_guids.add(link.to_guid)
            
            taxon_links = db.query(Link).filter(
                Link.to_guid == point.guid,
                Link.from_type == "taxon",
                Link.relation_type == "has_taxon"
            ).all()
            for link in taxon_links:
                taxa_guids.add(link.from_guid)
        
        return {
            "points_count": len(points),
            "unique_collectors": list(collectors),
            "unique_studies": list(study_guids),
            "unique_taxa": list(taxa_guids)
        }
    finally:
        db.close()
