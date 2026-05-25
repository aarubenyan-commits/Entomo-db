import uuid
import re
import csv
import io
import requests
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# ========== ПАРСИНГ КООРДИНАТ ==========
def parse_coordinate_dms(coord_str):
    if coord_str is None:
        return None
    if isinstance(coord_str, (int, float)):
        return float(coord_str)
    coord = str(coord_str).strip().upper()
    coord = coord.replace('"', '').replace('″', '').replace('′', "'")
    try:
        return float(coord)
    except ValueError:
        pass
    patterns = [
        r'(\d{1,3})°(\d{1,2})\'([\d.]+)([NSEW])',
        r'(\d{1,3})°(\d{1,2})\.([\d.]+)([NSEW])',
        r'(\d{1,3})°([\d.]+)([NSEW])',
    ]
    for pattern in patterns:
        match = re.search(pattern, coord)
        if match:
            deg = float(match.group(1))
            if len(match.groups()) == 4:
                minutes = float(match.group(2))
                seconds = float(match.group(3))
                direction = match.group(4)
                decimal = deg + minutes / 60 + seconds / 3600
            elif len(match.groups()) == 3:
                minutes = float(match.group(2))
                direction = match.group(3)
                decimal = deg + minutes / 60
            else:
                continue
            if direction in ['S', 'W']:
                decimal = -decimal
            return decimal
    return None

def parse_coordinate(coord):
    if coord is None:
        return None
    if isinstance(coord, (int, float)):
        return float(coord)
    try:
        return float(str(coord).strip())
    except:
        return None

def decimal_to_dms_advanced(decimal, is_lat=True):
    if decimal is None:
        return None
    degrees = int(abs(decimal))
    minutes_full = (abs(decimal) - degrees) * 60
    minutes = int(minutes_full)
    seconds = (minutes_full - minutes) * 60
    if is_lat:
        direction = 'N' if decimal >= 0 else 'S'
    else:
        direction = 'E' if decimal >= 0 else 'W'
    return f"{degrees}°{minutes:02d}'{seconds:.1f}{direction}"

# ========== БАЗА ДАННЫХ ==========
SQLALCHEMY_DATABASE_URL = "sqlite:///./entomo.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

# ========== МОДЕЛИ ==========
class Person(Base):
    __tablename__ = "persons"
    guid = Column(String, primary_key=True, default=generate_uuid)
    display_name = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Point(Base):
    __tablename__ = "points"
    guid = Column(String, primary_key=True, default=generate_uuid)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    latitude_dms = Column(String, nullable=True)
    longitude_dms = Column(String, nullable=True)
    location_original = Column(Text, nullable=True)
    date_text = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Species(Base):
    __tablename__ = "species"
    guid = Column(String, primary_key=True, default=generate_uuid)
    genus = Column(String, nullable=False)
    species_name = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Subspecies(Base):
    __tablename__ = "subspecies"
    guid = Column(String, primary_key=True, default=generate_uuid)
    species_guid = Column(String, ForeignKey("species.guid"), nullable=False)
    subspecies_name = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Study(Base):
    __tablename__ = "studies"
    guid = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=True)
    url = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    authors = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Link(Base):
    __tablename__ = "links"
    link_guid = Column(String, primary_key=True, default=generate_uuid)
    from_guid = Column(String, nullable=False)
    to_guid = Column(String, nullable=False)
    from_type = Column(String, nullable=False)
    to_type = Column(String, nullable=False)
    relation_type = Column(String, nullable=False)
    direction = Column(String, nullable=False)
    is_directed = Column(Integer, default=1)
    sort_order = Column(Integer, default=0)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ========== DMS ПАРСИНГ ==========
@app.post("/parse/dms")
def parse_dms_endpoint(request_data: dict):
    dms_string = request_data.get("dms", "")
    if not dms_string:
        return {"error": "No DMS string provided"}
    result = parse_coordinate_dms(dms_string)
    if result is None:
        return {"error": "Invalid DMS format", "input": dms_string}
    return {"decimal": result, "original": dms_string}

# ========== ВИДЫ ==========
@app.get("/species")
def get_species():
    db = SessionLocal()
    species = db.query(Species).all()
    db.close()
    return [{"guid": s.guid, "genus": s.genus, "species_name": s.species_name, "display_name": s.display_name} for s in species]

@app.post("/species")
def create_species(genus: str, species_name: str, display_name: Optional[str] = None):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    existing = db.query(Species).filter(
        Species.genus == genus.strip().capitalize(),
        Species.species_name == species_name.strip().lower()
    ).first()
    
    if existing:
        db.close()
        return {"guid": existing.guid, "existing": True}
    
    new_species = Species(
        genus=genus.strip().capitalize(),
        species_name=species_name.strip().lower(),
        display_name=display_name or f"{genus} {species_name}",
        created_at=now, updated_at=now
    )
    db.add(new_species)
    db.commit()
    guid = new_species.guid
    db.close()
    return {"guid": guid, "existing": False}

# ========== ПОДВИДЫ ==========
@app.get("/subspecies")
def get_subspecies(species_guid: Optional[str] = None):
    db = SessionLocal()
    query = db.query(Subspecies)
    if species_guid:
        query = query.filter(Subspecies.species_guid == species_guid)
    subspecies = query.all()
    db.close()
    return [{"guid": s.guid, "species_guid": s.species_guid, "subspecies_name": s.subspecies_name, "display_name": s.display_name} for s in subspecies]

@app.post("/subspecies")
def create_subspecies(species_guid: str, subspecies_name: str, display_name: Optional[str] = None):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    existing = db.query(Subspecies).filter(
        Subspecies.species_guid == species_guid,
        Subspecies.subspecies_name == subspecies_name.strip().lower()
    ).first()
    
    if existing:
        db.close()
        return {"guid": existing.guid, "existing": True}
    
    new_subspecies = Subspecies(
        species_guid=species_guid,
        subspecies_name=subspecies_name.strip().lower(),
        display_name=display_name or subspecies_name,
        created_at=now, updated_at=now
    )
    db.add(new_subspecies)
    db.commit()
    guid = new_subspecies.guid
    db.close()
    return {"guid": guid, "existing": False}

# ========== СБОРЩИКИ ==========
@app.get("/persons")
def get_persons():
    db = SessionLocal()
    persons = db.query(Person).all()
    db.close()
    return [{"guid": p.guid, "display_name": p.display_name} for p in persons]

@app.post("/persons")
def create_person(display_name: str):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    existing = db.query(Person).filter(Person.display_name.ilike(display_name)).first()
    if existing:
        db.close()
        return {"guid": existing.guid, "existing": True}
    
    person = Person(display_name=display_name, created_at=now, updated_at=now)
    db.add(person)
    db.commit()
    guid = person.guid
    db.close()
    return {"guid": guid, "existing": False}

@app.put("/persons/{guid}")
def update_person(guid: str, display_name: str):
    db = SessionLocal()
    person = db.query(Person).filter(Person.guid == guid).first()
    if not person:
        raise HTTPException(404, "Person not found")
    person.display_name = display_name
    person.updated_at = datetime.now().isoformat()
    db.commit()
    db.close()
    return {"message": "Updated"}

@app.delete("/persons/{guid}")
def delete_person(guid: str):
    db = SessionLocal()
    person = db.query(Person).filter(Person.guid == guid).first()
    if not person:
        raise HTTPException(404, "Person not found")
    
    # Удаляем связи
    db.query(Link).filter((Link.from_guid == guid) | (Link.to_guid == guid)).delete()
    db.delete(person)
    db.commit()
    db.close()
    return {"message": "Deleted"}

@app.get("/persons/{guid}/points")
def get_person_points(guid: str):
    db = SessionLocal()
    links = db.query(Link).filter(
        Link.from_guid == guid,
        Link.from_type == "person",
        Link.relation_type == "collected_at"
    ).all()
    points = []
    for link in links:
        point = db.query(Point).filter(Point.guid == link.to_guid).first()
        if point:
            points.append({
                "guid": point.guid,
                "location_original": point.location_original or "—",
                "display_date": point.date_text or "—"
            })
    db.close()
    return points

# ========== ИССЛЕДОВАНИЯ ==========
@app.get("/studies")
def get_studies():
    db = SessionLocal()
    studies = db.query(Study).all()
    db.close()
    return [{"guid": s.guid, "title": s.title, "url": s.url, "description": s.description, "authors": s.authors} for s in studies]

@app.post("/studies")
def create_study(study_data: dict):
    db = SessionLocal()
    now = datetime.now().isoformat()
    study = Study(
        title=study_data.get("title"),
        url=study_data.get("url"),
        description=study_data.get("description"),
        authors=study_data.get("authors"),
        created_at=now, updated_at=now
    )
    db.add(study)
    db.commit()
    guid = study.guid
    db.close()
    return {"guid": guid}

@app.put("/studies/{guid}")
def update_study(guid: str, study_data: dict):
    db = SessionLocal()
    study = db.query(Study).filter(Study.guid == guid).first()
    if not study:
        raise HTTPException(404, "Study not found")
    if "title" in study_data:
        study.title = study_data["title"]
    if "url" in study_data:
        study.url = study_data["url"]
    if "description" in study_data:
        study.description = study_data["description"]
    if "authors" in study_data:
        study.authors = study_data["authors"]
    study.updated_at = datetime.now().isoformat()
    db.commit()
    db.close()
    return {"message": "Updated"}

@app.delete("/studies/{guid}")
def delete_study(guid: str):
    db = SessionLocal()
    study = db.query(Study).filter(Study.guid == guid).first()
    if not study:
        raise HTTPException(404, "Study not found")
    db.delete(study)
    db.commit()
    db.close()
    return {"message": "Deleted"}

# ========== ТОЧКИ ==========
@app.get("/points")
def get_points():
    db = SessionLocal()
    points = db.query(Point).all()
    result = []
    for p in points:
        # Получаем ВСЕХ сборщиков (не одного)
        collectors = []
        collector_links = db.query(Link).filter(
            Link.to_guid == p.guid,
            Link.from_type == "person",
            Link.relation_type == "collected_at"
        ).all()
        for link in collector_links:
            person = db.query(Person).filter(Person.guid == link.from_guid).first()
            if person:
                collectors.append({"guid": person.guid, "display_name": person.display_name})
        
        # Получаем ВСЕ таксоны (виды и подвиды) с display_name
        taxa = []
        taxon_links = db.query(Link).filter(
            Link.to_guid == p.guid,
            Link.relation_type == "has_taxon"
        ).all()
        for link in taxon_links:
            if link.from_type == "species":
                species = db.query(Species).filter(Species.guid == link.from_guid).first()
                if species:
                    taxa.append({
                        "guid": species.guid,
                        "display_name": species.display_name,
                        "type": "species"
                    })
            elif link.from_type == "subspecies":
                subspecies = db.query(Subspecies).filter(Subspecies.guid == link.from_guid).first()
                if subspecies:
                    parent_species = db.query(Species).filter(Species.guid == subspecies.species_guid).first()
                    if parent_species:
                        taxa.append({
                            "guid": subspecies.guid,
                            "display_name": f"{parent_species.genus} {parent_species.species_name} {subspecies.subspecies_name}",
                            "type": "subspecies"
                        })
        
        # Получаем ВСЕ исследования
        studies = []
        study_links = db.query(Link).filter(
            Link.from_guid == p.guid,
            Link.relation_type == "source"
        ).all()
        for link in study_links:
            study = db.query(Study).filter(Study.guid == link.to_guid).first()
            if study:
                studies.append({
                    "guid": study.guid,
                    "title": study.title or study.url,
                    "url": study.url
                })
        
        # Сохраняем taxon_ids для обратной совместимости (фильтры)
        taxon_ids = [t["guid"] for t in taxa]
        
        result.append({
            "guid": p.guid,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "latitude_dms": p.latitude_dms,
            "longitude_dms": p.longitude_dms,
            "location_original": p.location_original,
            "date_text": p.date_text,
            "display_date": p.date_text,
            # Новые поля для карточек
            "collectors": collectors,           # список сборщиков
            "taxa": taxa,                       # список таксонов с display_name
            "studies": studies,                 # список исследований
            "studies_count": len(studies),      # количество исследований
            # Старое поле для обратной совместимости
            "collector_name": collectors[0]["display_name"] if collectors else None,
            "taxon_ids": taxon_ids
        })
    db.close()
    return result

@app.get("/points/{guid}")
def get_point(guid: str):
    db = SessionLocal()
    point = db.query(Point).filter(Point.guid == guid).first()
    if not point:
        raise HTTPException(404, "Point not found")
    db.close()
    return {
        "guid": point.guid,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "location_original": point.location_original,
        "date_text": point.date_text
    }

@app.post("/points/create")
def create_point(point_data: dict):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    lat = point_data.get("latitude")
    lon = point_data.get("longitude")
    lat_dms = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
    lon_dms = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
    
    collector_name = point_data.get("collector_name", "")
    person = None
    if collector_name:
        person = db.query(Person).filter(Person.display_name == collector_name).first()
        if not person:
            person = Person(display_name=collector_name, created_at=now, updated_at=now)
            db.add(person)
            db.flush()
    
    point = Point(
        latitude=lat, longitude=lon, latitude_dms=lat_dms, longitude_dms=lon_dms,
        location_original=point_data.get("location_original"),
        date_text=point_data.get("date_text"),
        created_at=now, updated_at=now
    )
    db.add(point)
    db.flush()
    
    if person:
        link = Link(
            from_guid=person.guid, to_guid=point.guid,
            from_type="person", to_type="point", relation_type="collected_at",
            direction="one_to_many", is_directed=1,
            created_at=now, updated_at=now
        )
        db.add(link)
    
    db.commit()
    point_guid = point.guid
    db.close()
    return {"guid": point_guid}

    db = SessionLocal()
    now = datetime.now().isoformat()
    
    point = db.query(Point).filter(Point.guid == guid).first()
    if not point:
        raise HTTPException(404, "Point not found")
    
    lat = point_data.get("latitude")
    lon = point_data.get("longitude")
    if lat is not None:
        point.latitude = lat
        point.latitude_dms = decimal_to_dms_advanced(lat, is_lat=True)
    if lon is not None:
        point.longitude = lon
        point.longitude_dms = decimal_to_dms_advanced(lon, is_lat=False)
    
    point.location_original = point_data.get("location_original", point.location_original)
    point.date_text = point_data.get("date_text", point.date_text)
    
    collector_name = point_data.get("collector_name")
    if collector_name and collector_name.strip():
        person = db.query(Person).filter(Person.display_name == collector_name).first()
        if not person:
            person = Person(display_name=collector_name, created_at=now, updated_at=now)
            db.add(person)
            db.flush()
        
        db.query(Link).filter(
            Link.to_guid == guid,
            Link.from_type == "person",
            Link.relation_type == "collected_at"
        ).delete()
        
        db.add(Link(
            from_guid=person.guid, to_guid=guid,
            from_type="person", to_type="point", relation_type="collected_at",
            direction="one_to_many", is_directed=1,
            created_at=now, updated_at=now
        ))
    
    point.updated_at = now
    db.commit()
    
    result = {
        "guid": point.guid,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "location_original": point.location_original,
        "date_text": point.date_text,
        "collector_name": collector_name
    }
    db.close()
    return result


@app.delete("/points/{guid}")
def delete_point(guid: str):
    db = SessionLocal()
    db.query(Link).filter(Link.to_guid == guid).delete()
    db.query(Point).filter(Point.guid == guid).delete()
    db.commit()
    db.close()
    return {"message": "Deleted"}

# ========== ТАКСОНЫ (обратная совместимость) ==========
@app.get("/taxa")
def get_taxa_legacy():
    db = SessionLocal()
    species_list = db.query(Species).all()
    subspecies_list = db.query(Subspecies).all()
    
    result = []
    for s in species_list:
        result.append({
            "guid": s.guid,
            "genus": s.genus,
            "species": s.species_name,
            "subspecies": None,
            "display_name": s.display_name
        })
    
    for ss in subspecies_list:
        species = db.query(Species).filter(Species.guid == ss.species_guid).first()
        result.append({
            "guid": ss.guid,
            "genus": species.genus if species else "",
            "species": species.species_name if species else "",
            "subspecies": ss.subspecies_name,
            "display_name": ss.display_name
        })
    
    db.close()
    return result

@app.get("/taxa/search")
def search_taxa(q: str = ""):
    db = SessionLocal()
    results = []
    species = db.query(Species).filter(
        (Species.genus.contains(q)) | (Species.species_name.contains(q))
    ).limit(20).all()
    for s in species:
        results.append({"guid": s.guid, "genus": s.genus, "species": s.species_name, "display_name": s.display_name})
    db.close()
    return results

@app.post("/taxa")
def create_taxon_legacy(genus: str, species: str, display_name: Optional[str] = None):
    return create_species(genus, species, display_name)

# ========== СВЯЗИ С ИСТОЧНИКАМИ ==========
@app.post("/source/{from_type}/{from_guid}/{study_guid}")
def add_source(from_type: str, from_guid: str, study_guid: str):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    existing = db.query(Link).filter(
        Link.from_guid == from_guid, Link.to_guid == study_guid,
        Link.relation_type == "source"
    ).first()
    
    if existing:
        db.close()
        return {"message": "Already linked", "link_guid": existing.link_guid}
    
    link = Link(
        from_guid=from_guid, to_guid=study_guid,
        from_type=from_type, to_type="study", relation_type="source",
        direction="many_to_many", is_directed=1,
        created_at=now, updated_at=now
    )
    db.add(link)
    db.commit()
    link_guid = link.link_guid
    db.close()
    return {"link_guid": link_guid, "message": "Linked"}

@app.delete("/source/{link_guid}")
def remove_source(link_guid: str):
    db = SessionLocal()
    link = db.query(Link).filter(Link.link_guid == link_guid).first()
    if not link:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
    db.close()
    return {"message": "Removed"}

@app.get("/sources/{from_type}/{from_guid}")
def get_sources(from_type: str, from_guid: str):
    db = SessionLocal()
    links = db.query(Link).filter(
        Link.from_guid == from_guid,
        Link.from_type == from_type,
        Link.relation_type == "source"
    ).all()
    sources = []
    for link in links:
        study = db.query(Study).filter(Study.guid == link.to_guid).first()
        if study:
            sources.append({
                "link_guid": link.link_guid,
                "study_guid": study.guid,
                "title": study.title,
                "url": study.url,
                "description": study.description,
                "authors": study.authors
            })
    db.close()
    return sources

# ========== ИМПОРТ ==========
@app.post("/import/parse-file")
async def parse_import_file(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode('utf-8')
    filename = file.filename.lower()
    rows = []
    
    if filename.endswith('.csv'):
        csv_reader = csv.DictReader(io.StringIO(text))
        for row in csv_reader:
            rows.append({
                "latitude": row.get("latitude", ""),
                "longitude": row.get("longitude", ""),
                "location_original": row.get("location_original", ""),
                "date_text": row.get("date_text", ""),
                "collector_name": row.get("collector_name", ""),
                "genus": row.get("genus", ""),
                "species": row.get("species", ""),
                "subspecies": row.get("subspecies", ""),
                "display_name": row.get("display_name", ""),
                "notes": row.get("notes", ""),
                "source": row.get("source", "")
            })
    
    return {"rows": rows, "total": len(rows), "errors": []}

@app.post("/import/validate")
async def validate_import(data: dict):
    rows = data.get("rows", [])
    results = []
    for idx, row in enumerate(rows):
        results.append({
            "row": idx + 2,
            "valid": True,
            "errors": [],
            "warnings": []
        })
    return {"results": results}

# ========== ЭКСПОРТ ==========
@app.get("/export/points")
async def export_points():
    db = SessionLocal()
    points = db.query(Point).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["latitude", "longitude", "location_original", "date_text"])
    for p in points:
        writer.writerow([p.latitude, p.longitude, p.location_original, p.date_text])
    db.close()
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=export.csv"})

@app.get("/export/taxa")
async def export_taxa():
    db = SessionLocal()
    species = db.query(Species).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["genus", "species"])
    for s in species:
        writer.writerow([s.genus, s.species_name])
    db.close()
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=taxa.csv"})

@app.get("/export/studies")
async def export_studies():
    db = SessionLocal()
    studies = db.query(Study).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["title", "url", "description", "authors"])
    for s in studies:
        writer.writerow([s.title, s.url, s.description, s.authors])
    db.close()
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=studies.csv"})

# ========== ГРАФ ==========
@app.get("/objects/{obj_type}/{guid}/links")
def get_object_links(obj_type: str, guid: str):
    db = SessionLocal()
    outgoing = db.query(Link).filter(
        Link.from_guid == guid,
        Link.from_type == obj_type
    ).all()
    incoming = db.query(Link).filter(
        Link.to_guid == guid,
        Link.to_type == obj_type
    ).all()
    result = []
    for link in outgoing:
        # Пропускаем связи с подвидами
        if link.to_type == "subspecies":
            continue
        result.append({
            "link_guid": link.link_guid,
            "relation_type": link.relation_type,
            "target_type": link.to_type,
            "target_guid": link.to_guid,
            "direction": "outgoing"
        })
    for link in incoming:
        # Пропускаем связи с подвидами
        if link.from_type == "subspecies":
            continue
        result.append({
            "link_guid": link.link_guid,
            "relation_type": link.relation_type,
            "target_type": link.from_type,
            "target_guid": link.from_guid,
            "direction": "incoming"
        })
    db.close()
    return result

@app.get("/search")
def search_objects(q: str = "", obj_type: Optional[str] = None, limit: int = 20):
    db = SessionLocal()
    results = []
    
    if not obj_type or obj_type == "species":
        species = db.query(Species).filter(
            (Species.genus.contains(q)) | (Species.species_name.contains(q))
        ).limit(limit).all()
        for s in species:
            results.append({"type": "species", "guid": s.guid, "name": s.display_name})
    
    if not obj_type or obj_type == "person":
        persons = db.query(Person).filter(Person.display_name.contains(q)).limit(limit).all()
        for p in persons:
            results.append({"type": "person", "guid": p.guid, "name": p.display_name})
    
    if not obj_type or obj_type == "point":
        points = db.query(Point).filter(Point.location_original.contains(q)).limit(limit).all()
        for p in points:
            results.append({"type": "point", "guid": p.guid, "name": p.location_original or "Точка"})
    
    db.close()
    return results

# ========== МАССОВОЕ РЕДАКТИРОВАНИЕ ==========
from pydantic import BaseModel
from typing import List

class BulkEditRequest(BaseModel):
    point_guids: List[str]
    updates: dict

@app.post("/points/bulk-update")
def bulk_update_points(request: BulkEditRequest):
    db = SessionLocal()
    now = datetime.now().isoformat()
    updated_count = 0
    errors = []
    
    try:
        points = db.query(Point).filter(Point.guid.in_(request.point_guids)).all()
        
        # Замена сборщика с удалением
        replaced_person = None
        if "replace_person" in request.updates:
            replace_data = request.updates["replace_person"]
            old_person_guid = replace_data.get("old_person_guid")
            new_person_guid = replace_data.get("new_person_guid")
            
            if old_person_guid and new_person_guid:
                old_person = db.query(Person).filter(Person.guid == old_person_guid).first()
                new_person = db.query(Person).filter(Person.guid == new_person_guid).first()
                
                if not old_person:
                    errors.append(f"Старый сборщик не найден")
                elif not new_person:
                    errors.append(f"Новый сборщик не найден")
                else:
                    for point in points:
                        db.query(Link).filter(
                            Link.from_guid == old_person_guid,
                            Link.to_guid == point.guid,
                            Link.from_type == "person"
                        ).delete()
                        db.add(Link(
                            from_guid=new_person_guid, to_guid=point.guid,
                            from_type="person", to_type="point", relation_type="collected_at",
                            direction="one_to_many", is_directed=1,
                            created_at=now, updated_at=now
                        ))
                        point.updated_at = now
                    
                    db.query(Link).filter(Link.from_guid == old_person_guid).delete()
                    db.delete(old_person)
                    replaced_person = old_person.display_name
                    updated_count = len(points)
        
        # Обычная замена сборщика
        new_person = None
        if "collector_name" in request.updates and request.updates["collector_name"] and not replaced_person:
            collector_name = request.updates["collector_name"]
            new_person = db.query(Person).filter(Person.display_name == collector_name).first()
            if not new_person:
                new_person = Person(display_name=collector_name, created_at=now, updated_at=now)
                db.add(new_person)
                db.flush()
        
        # Привязка исследования
        study = None
        if "study_guid" in request.updates and request.updates["study_guid"]:
            study = db.query(Study).filter(Study.guid == request.updates["study_guid"]).first()
            if not study:
                errors.append("Исследование не найдено")
        
        # Замена таксонов
        new_taxa = []
        if "taxa_guids" in request.updates and request.updates["taxa_guids"]:
            taxa_guids = request.updates["taxa_guids"]
            new_taxa = db.query(Species).filter(Species.guid.in_(taxa_guids)).all()
            new_taxa += db.query(Subspecies).filter(Subspecies.guid.in_(taxa_guids)).all()
        
        for point in points:
            if not replaced_person and new_person:
                db.query(Link).filter(
                    Link.to_guid == point.guid,
                    Link.from_type == "person",
                    Link.relation_type == "collected_at"
                ).delete()
                db.add(Link(
                    from_guid=new_person.guid, to_guid=point.guid,
                    from_type="person", to_type="point", relation_type="collected_at",
                    direction="one_to_many", is_directed=1,
                    created_at=now, updated_at=now
                ))
                point.updated_at = now
            
            if study:
                existing = db.query(Link).filter(
                    Link.from_guid == point.guid, Link.to_guid == study.guid,
                    Link.relation_type == "source"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=point.guid, to_guid=study.guid,
                        from_type="point", to_type="study", relation_type="source",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                point.updated_at = now
            
            if new_taxa:
                db.query(Link).filter(
                    Link.to_guid == point.guid,
                    Link.relation_type == "has_taxon"
                ).delete()
                for taxon in new_taxa:
                    taxon_type = "species" if isinstance(taxon, Species) else "subspecies"
                    db.add(Link(
                        from_guid=taxon.guid, to_guid=point.guid,
                        from_type=taxon_type, to_type="point", relation_type="has_taxon",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                point.updated_at = now
            
            if not replaced_person:
                updated_count += 1
        
        db.commit()
        message = f"Обновлено точек: {updated_count}"
        if replaced_person:
            message = f"Сборщик '{replaced_person}' заменен и удален. {message}"
        
        return {"message": message, "updated_count": updated_count, "errors": errors}
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Ошибка: {str(e)}")
    finally:
        db.close()

@app.post("/points/bulk-info")
def get_bulk_info(point_guids: List[str]):
    db = SessionLocal()
    try:
        points = db.query(Point).filter(Point.guid.in_(point_guids)).all()
        collectors = set()
        study_guids = set()
        taxa_guids = set()
        
        for point in points:
            link = db.query(Link).filter(
                Link.to_guid == point.guid, Link.from_type == "person",
                Link.relation_type == "collected_at"
            ).first()
            if link:
                person = db.query(Person).filter(Person.guid == link.from_guid).first()
                if person:
                    collectors.add(person.display_name)
            
            for link in db.query(Link).filter(
                Link.from_guid == point.guid, Link.from_type == "point",
                Link.relation_type == "source"
            ).all():
                study_guids.add(link.to_guid)
            
            for link in db.query(Link).filter(
                Link.to_guid == point.guid, Link.relation_type == "has_taxon"
            ).all():
                taxa_guids.add(link.from_guid)
        
        return {
            "points_count": len(points),
            "unique_collectors": list(collectors),
            "unique_studies": list(study_guids),
            "unique_taxa": list(taxa_guids)
        }
    finally:
        db.close()


# ========== CRUD ДЛЯ ТАКСОНОВ (обратная совместимость) ==========
@app.put("/taxa/{guid}")
def update_taxon_legacy(guid: str, genus: str, species: str, display_name: Optional[str] = None):
    db = SessionLocal()
    taxon = db.query(Species).filter(Species.guid == guid).first()
    if not taxon:
        raise HTTPException(404, "Taxon not found")
    taxon.genus = genus.capitalize()
    taxon.species_name = species.lower()
    taxon.display_name = display_name or f"{genus} {species}"
    taxon.updated_at = datetime.now().isoformat()
    db.commit()
    db.close()
    return {"message": "Updated"}

@app.delete("/taxa/{guid}")
def delete_taxon_legacy(guid: str):
    db = SessionLocal()
    taxon = db.query(Species).filter(Species.guid == guid).first()
    if not taxon:
        raise HTTPException(404, "Taxon not found")
    db.query(Link).filter(
        (Link.from_guid == guid) | (Link.to_guid == guid)
    ).delete()
    db.delete(taxon)
    db.commit()
    db.close()
    return {"message": "Deleted"}


@app.put("/points/{guid}")
def update_point(guid: str, point_data: dict):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    point = db.query(Point).filter(Point.guid == guid).first()
    if not point:
        raise HTTPException(404, "Point not found")
    
    lat = point_data.get("latitude")
    lon = point_data.get("longitude")
    if lat is not None:
        point.latitude = lat
        point.latitude_dms = decimal_to_dms_advanced(lat, is_lat=True)
    if lon is not None:
        point.longitude = lon
        point.longitude_dms = decimal_to_dms_advanced(lon, is_lat=False)
    
    point.location_original = point_data.get("location_original", point.location_original)
    point.date_text = point_data.get("date_text", point.date_text)
    
    collector_name = point_data.get("collector_name")
    if collector_name and collector_name.strip():
        person = db.query(Person).filter(Person.display_name == collector_name).first()
        if not person:
            person = Person(display_name=collector_name, created_at=now, updated_at=now)
            db.add(person)
            db.flush()
        
        db.query(Link).filter(
            Link.to_guid == guid,
            Link.from_type == "person",
            Link.relation_type == "collected_at"
        ).delete()
        
        db.add(Link(
            from_guid=person.guid, to_guid=guid,
            from_type="person", to_type="point", relation_type="collected_at",
            direction="one_to_many", is_directed=1,
            created_at=now, updated_at=now
        ))
    
    point.updated_at = now
    db.commit()
    
    result = {
        "guid": point.guid,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "location_original": point.location_original,
        "date_text": point.date_text,
        "collector_name": collector_name
    }
    db.close()
    return result

# ========== ДЕТАЛЬНЫЕ ЭНДПОИНТЫ ДЛЯ ВИДОВ И ПОДВИДОВ ==========
@app.get("/species/{guid}")
def get_species(guid: str):
    db = SessionLocal()
    species = db.query(Species).filter(Species.guid == guid).first()
    if not species:
        raise HTTPException(404, "Species not found")
    db.close()
    return {
        "guid": species.guid,
        "genus": species.genus,
        "species_name": species.species_name,
        "display_name": species.display_name
    }

@app.get("/subspecies/{guid}")
def get_subspecies(guid: str):
    db = SessionLocal()
    subspecies = db.query(Subspecies).filter(Subspecies.guid == guid).first()
    if not subspecies:
        raise HTTPException(404, "Subspecies not found")
    db.close()
    return {
        "guid": subspecies.guid,
        "species_guid": subspecies.species_guid,
        "subspecies_name": subspecies.subspecies_name,
        "display_name": subspecies.display_name
    }

@app.get("/species/{guid}/subspecies")
def get_species_subspecies(guid: str):
    db = SessionLocal()
    subspecies = db.query(Subspecies).filter(Subspecies.species_guid == guid).all()
    db.close()
    return [{
        "guid": s.guid,
        "subspecies_name": s.subspecies_name,
        "display_name": s.display_name
    } for s in subspecies]

# ========== УДАЛЕНИЕ ВИДОВ И ПОДВИДОВ ==========
@app.delete("/species/{guid}")
def delete_species(guid: str):
    db = SessionLocal()
    species = db.query(Species).filter(Species.guid == guid).first()
    if not species:
        raise HTTPException(404, "Species not found")
    
    # Удаляем все подвиды этого вида
    db.query(Subspecies).filter(Subspecies.species_guid == guid).delete()
    
    # Удаляем все связи
    db.query(Link).filter(
        (Link.from_guid == guid) | (Link.to_guid == guid)
    ).delete()
    
    db.delete(species)
    db.commit()
    db.close()
    return {"message": "Species deleted"}

@app.delete("/subspecies/{guid}")
def delete_subspecies(guid: str):
    db = SessionLocal()
    subspecies = db.query(Subspecies).filter(Subspecies.guid == guid).first()
    if not subspecies:
        raise HTTPException(404, "Subspecies not found")
    
    # Удаляем связи
    db.query(Link).filter(
        (Link.from_guid == guid) | (Link.to_guid == guid)
    ).delete()
    
    db.delete(subspecies)
    db.commit()
    db.close()
    return {"message": "Subspecies deleted"}


@app.post("/import/confirm")
async def confirm_import(data: dict):
    rows = data.get("rows", [])
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    # Статистика
    stats = {
        "points_created": 0,
        "points_updated": 0,
        "species_created": 0,
        "species_existing": 0,
        "subspecies_created": 0,
        "subspecies_existing": 0,
        "persons_created": 0,
        "persons_existing": 0,
        "studies_created": 0,
        "studies_existing": 0,
        "links_added": 0,
        "errors": []
    }
    
    for idx, row in enumerate(rows):
        try:
            genus = row.get("genus", "").strip().capitalize()
            species_name = row.get("species", "").strip().lower()
            subspecies_name = row.get("subspecies", "").strip().lower()
            
            # 1. Вид
            species = None
            if genus and species_name:
                species = db.query(Species).filter(
                    Species.genus == genus,
                    Species.species_name == species_name
                ).first()
                
                if species:
                    stats["species_existing"] += 1
                else:
                    species = Species(
                        genus=genus, species_name=species_name,
                        display_name=f"{genus} {species_name}",
                        created_at=now, updated_at=now
                    )
                    db.add(species)
                    db.flush()
                    stats["species_created"] += 1
            
            # 2. Подвид
            subspecies = None
            if subspecies_name and species:
                subspecies = db.query(Subspecies).filter(
                    Subspecies.species_guid == species.guid,
                    Subspecies.subspecies_name == subspecies_name
                ).first()
                
                if subspecies:
                    stats["subspecies_existing"] += 1
                else:
                    subspecies = Subspecies(
                        species_guid=species.guid,
                        subspecies_name=subspecies_name,
                        display_name=f"{genus} {species_name} {subspecies_name}",
                        created_at=now, updated_at=now
                    )
                    db.add(subspecies)
                    db.flush()
                    stats["subspecies_created"] += 1
            
            # 3. Сборщик
            collector_name = row.get("collector_name", "").strip()
            person = None
            if collector_name:
                person = db.query(Person).filter(Person.display_name == collector_name).first()
                if person:
                    stats["persons_existing"] += 1
                else:
                    person = Person(display_name=collector_name, created_at=now, updated_at=now)
                    db.add(person)
                    db.flush()
                    stats["persons_created"] += 1
            
            # 4. Исследование
            source_title = row.get("source", "").strip()
            study = None
            if source_title:
                study = db.query(Study).filter(Study.title == source_title).first()
                if study:
                    stats["studies_existing"] += 1
                else:
                    study = Study(
                        title=source_title,
                        description=row.get("notes", ""),
                        created_at=now, updated_at=now
                    )
                    db.add(study)
                    db.flush()
                    stats["studies_created"] += 1
            
            # 5. Координаты
            lat_str = row.get("latitude", "")
            lon_str = row.get("longitude", "")
            lat = None
            lon = None
            
            if lat_str:
                if "°" in lat_str:
                    lat = parse_coordinate_dms(lat_str)
                else:
                    try:
                        lat = float(lat_str)
                    except:
                        pass
            
            if lon_str:
                if "°" in lon_str:
                    lon = parse_coordinate_dms(lon_str)
                else:
                    try:
                        lon = float(lon_str)
                    except:
                        pass
            
            lat_dms = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
            lon_dms = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
            
            # 6. Точка - проверяем существование
            point = None
            if lat is not None and lon is not None:
                point = db.query(Point).filter(
                    Point.latitude == lat,
                    Point.longitude == lon
                ).first()
            
            if not point and row.get("location_original"):
                point = db.query(Point).filter(
                    Point.location_original == row.get("location_original")
                ).first()
            
            if point:
                stats["points_updated"] += 1
                point.updated_at = now
            else:
                point = Point(
                    latitude=lat, longitude=lon,
                    latitude_dms=lat_dms, longitude_dms=lon_dms,
                    location_original=row.get("location_original", ""),
                    date_text=row.get("date_text", ""),
                    created_at=now, updated_at=now
                )
                db.add(point)
                db.flush()
                stats["points_created"] += 1
            
            # 7. Связи
            if person:
                existing = db.query(Link).filter(
                    Link.from_guid == person.guid,
                    Link.to_guid == point.guid,
                    Link.relation_type == "collected_at"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=person.guid, to_guid=point.guid,
                        from_type="person", to_type="point", relation_type="collected_at",
                        direction="one_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                    stats["links_added"] += 1
            
            if subspecies:
                existing = db.query(Link).filter(
                    Link.from_guid == subspecies.guid,
                    Link.to_guid == point.guid,
                    Link.relation_type == "has_taxon"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=subspecies.guid, to_guid=point.guid,
                        from_type="subspecies", to_type="point", relation_type="has_taxon",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                    stats["links_added"] += 1
            elif species:
                existing = db.query(Link).filter(
                    Link.from_guid == species.guid,
                    Link.to_guid == point.guid,
                    Link.relation_type == "has_taxon"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=species.guid, to_guid=point.guid,
                        from_type="species", to_type="point", relation_type="has_taxon",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                    stats["links_added"] += 1
            
            if study:
                existing = db.query(Link).filter(
                    Link.from_guid == point.guid,
                    Link.to_guid == study.guid,
                    Link.relation_type == "source"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=point.guid, to_guid=study.guid,
                        from_type="point", to_type="study", relation_type="source",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                    stats["links_added"] += 1
                
                if species:
                    existing = db.query(Link).filter(
                        Link.from_guid == species.guid,
                        Link.to_guid == study.guid,
                        Link.relation_type == "source"
                    ).first()
                    if not existing:
                        db.add(Link(
                            from_guid=species.guid, to_guid=study.guid,
                            from_type="species", to_type="study", relation_type="source",
                            direction="many_to_many", is_directed=1,
                            created_at=now, updated_at=now
                        ))
                        stats["links_added"] += 1
            
        except Exception as e:
            stats["errors"].append({"row": idx + 2, "error": str(e)})
    
    db.commit()
    db.close()
    
    # Формируем сообщение
    message_parts = []
    if stats["points_created"] > 0:
        message_parts.append(f"создано {stats['points_created']} точек")
    if stats["points_updated"] > 0:
        message_parts.append(f"обновлено {stats['points_updated']} точек")
    if stats["species_created"] > 0:
        message_parts.append(f"создано {stats['species_created']} видов")
    if stats["species_existing"] > 0:
        message_parts.append(f"найдено {stats['species_existing']} существующих видов")
    if stats["subspecies_created"] > 0:
        message_parts.append(f"создано {stats['subspecies_created']} подвидов")
    if stats["subspecies_existing"] > 0:
        message_parts.append(f"найдено {stats['subspecies_existing']} существующих подвидов")
    if stats["persons_created"] > 0:
        message_parts.append(f"создано {stats['persons_created']} сборщиков")
    if stats["persons_existing"] > 0:
        message_parts.append(f"найдено {stats['persons_existing']} сборщиков")
    if stats["studies_created"] > 0:
        message_parts.append(f"создано {stats['studies_created']} исследований")
    if stats["studies_existing"] > 0:
        message_parts.append(f"найдено {stats['studies_existing']} исследований")
    if stats["links_added"] > 0:
        message_parts.append(f"добавлено {stats['links_added']} связей")
    
    message = f"✅ Импорт завершен. {', '.join(message_parts)}."
    
    return {
        "message": message,
        "stats": stats,
        "points_created": stats["points_created"],
        "points_updated": stats["points_updated"],
        "species_created": stats["species_created"],
        "species_existing": stats["species_existing"],
        "subspecies_created": stats["subspecies_created"],
        "subspecies_existing": stats["subspecies_existing"],
        "persons_created": stats["persons_created"],
        "persons_existing": stats["persons_existing"],
        "studies_created": stats["studies_created"],
        "studies_existing": stats["studies_existing"],
        "links_added": stats["links_added"],
        "errors": stats["errors"]
    }

# ========== СВЯЗИ ТОЧКА-ТАКСОН ==========
@app.get("/point_taxa/{point_guid}")
def get_point_taxa(point_guid: str):
    db = SessionLocal()
    links = db.query(Link).filter(
        Link.to_guid == point_guid,
        Link.relation_type == "has_taxon"
    ).order_by(Link.sort_order.asc()).all()
    result = []
    for link in links:
        if link.from_type == "species":
            taxon = db.query(Species).filter(Species.guid == link.from_guid).first()
            if taxon:
                result.append({
                    "guid": taxon.guid,
                    "genus": taxon.genus,
                    "species": taxon.species_name,
                    "display_name": taxon.display_name
                })
        elif link.from_type == "subspecies":
            taxon = db.query(Subspecies).filter(Subspecies.guid == link.from_guid).first()
            if taxon:
                species = db.query(Species).filter(Species.guid == taxon.species_guid).first()
                result.append({
                    "guid": taxon.guid,
                    "genus": species.genus if species else "",
                    "species": species.species_name if species else "",
                    "subspecies": taxon.subspecies_name,
                    "display_name": taxon.display_name
                })
    db.close()
    return result

@app.post("/point_taxa/{point_guid}/{taxon_guid}")
def add_taxon_to_point(point_guid: str, taxon_guid: str, sort_order: int = 0):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    taxon_type = None
    if db.query(Species).filter(Species.guid == taxon_guid).first():
        taxon_type = "species"
    elif db.query(Subspecies).filter(Subspecies.guid == taxon_guid).first():
        taxon_type = "subspecies"
    else:
        raise HTTPException(404, "Taxon not found")
    
    existing = db.query(Link).filter(
        Link.from_guid == taxon_guid,
        Link.to_guid == point_guid,
        Link.relation_type == "has_taxon"
    ).first()
    
    if existing:
        existing.sort_order = sort_order
        existing.updated_at = now
        db.commit()
        return {"message": "Order updated", "link_guid": existing.link_guid}
    
    link = Link(
        from_guid=taxon_guid, to_guid=point_guid,
        from_type=taxon_type, to_type="point", relation_type="has_taxon",
        direction="many_to_many", is_directed=1,
        sort_order=sort_order,
        created_at=now, updated_at=now
    )
    db.add(link)
    db.commit()
    link_guid = link.link_guid
    db.close()
    return {"link_guid": link_guid, "message": "Linked"}

@app.put("/point_taxa/{point_guid}/{taxon_guid}")
def update_taxon_order(point_guid: str, taxon_guid: str, sort_order: int = 0):
    db = SessionLocal()
    try:
        link = db.query(Link).filter(
            Link.from_guid == taxon_guid,
            Link.to_guid == point_guid,
            Link.relation_type == "has_taxon"
        ).first()
        
        if not link:
            raise HTTPException(404, "Link not found")
        
        link.updated_at = datetime.now().isoformat()
        db.commit()
        return {"message": "Order updated", "sort_order": sort_order}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Error: {str(e)}")
    finally:
        db.close()

@app.delete("/point_taxa/{point_guid}/{taxon_guid}")
def remove_taxon_from_point(point_guid: str, taxon_guid: str):
    db = SessionLocal()
    try:
        link = db.query(Link).filter(
            Link.from_guid == taxon_guid,
            Link.to_guid == point_guid,
            Link.relation_type == "has_taxon"
        ).first()
        
        if not link:
            raise HTTPException(404, "Link not found")
        
        db.delete(link)
        db.commit()
        return {"message": "Unlinked", "link_guid": link.link_guid}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Error: {str(e)}")
    finally:
        db.close()

# ========== МАССОВОЕ ОБНОВЛЕНИЕ ПОРЯДКА ТАКСОНОВ ==========
@app.post("/point_taxa/{point_guid}/reorder")
def reorder_taxa(point_guid: str, taxon_guids: List[str]):
    """Обновляет порядок всех таксонов в точке"""
    db = SessionLocal()
    try:
        for idx, taxon_guid in enumerate(taxon_guids):
            link = db.query(Link).filter(
                Link.from_guid == taxon_guid,
                Link.to_guid == point_guid,
                Link.relation_type == "has_taxon"
            ).first()
            if link:
                link.sort_order = idx
                link.updated_at = datetime.now().isoformat()
        db.commit()
        return {"message": "Order updated", "count": len(taxon_guids)}
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Error: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
