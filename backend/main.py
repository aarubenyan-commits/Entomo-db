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
        link = db.query(Link).filter(
            Link.to_guid == p.guid,
            Link.from_type == "person",
            Link.relation_type == "collected_at"
        ).first()
        collector_name = None
        if link:
            person = db.query(Person).filter(Person.guid == link.from_guid).first()
            if person:
                collector_name = person.display_name
        
        taxon_links = db.query(Link).filter(
            Link.to_guid == p.guid,
            Link.relation_type == "has_taxon"
        ).all()
        taxon_ids = [tl.from_guid for tl in taxon_links]
        
        result.append({
            "guid": p.guid,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "latitude_dms": p.latitude_dms,
            "longitude_dms": p.longitude_dms,
            "location_original": p.location_original,
            "date_text": p.date_text,
            "display_date": p.date_text,
            "collector_name": collector_name,
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

@app.put("/points/{guid}")
def update_point(guid: str, point_data: dict):
    db = SessionLocal()
    point = db.query(Point).filter(Point.guid == guid).first()
    if not point:
        raise HTTPException(404, "Point not found")
    
    point.latitude = point_data.get("latitude", point.latitude)
    point.longitude = point_data.get("longitude", point.longitude)
    point.location_original = point_data.get("location_original", point.location_original)
    point.date_text = point_data.get("date_text", point.date_text)
    point.updated_at = datetime.now().isoformat()
    
    db.commit()
    db.close()
    return {"message": "Updated"}

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

# ========== СВЯЗИ ТОЧКА-ТАКСОН ==========
@app.get("/point_taxa/{point_guid}")
def get_point_taxa(point_guid: str):
    db = SessionLocal()
    links = db.query(Link).filter(
        Link.to_guid == point_guid,
        Link.relation_type == "has_taxon"
    ).all()
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
def add_taxon_to_point(point_guid: str, taxon_guid: str):
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
        db.close()
        return {"message": "Already linked"}
    
    link = Link(
        from_guid=taxon_guid, to_guid=point_guid,
        from_type=taxon_type, to_type="point", relation_type="has_taxon",
        direction="many_to_many", is_directed=1,
        created_at=now, updated_at=now
    )
    db.add(link)
    db.commit()
    db.close()
    return {"message": "Linked"}

@app.delete("/point_taxa/{point_guid}/{taxon_guid}")
def remove_taxon_from_point(point_guid: str, taxon_guid: str):
    db = SessionLocal()
    link = db.query(Link).filter(
        Link.from_guid == taxon_guid,
        Link.to_guid == point_guid,
        Link.relation_type == "has_taxon"
    ).first()
    if link:
        db.delete(link)
        db.commit()
    db.close()
    return {"message": "Unlinked"}

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

@app.post("/import/confirm")
async def confirm_import(data: dict):
    rows = data.get("rows", [])
    db = SessionLocal()
    now = datetime.now().isoformat()
    imported_count = 0
    
    for row in rows:
        genus = row.get("genus", "").strip().capitalize()
        species_name = row.get("species", "").strip().lower()
        subspecies_name = row.get("subspecies", "").strip().lower()
        
        # Находим или создаем вид
        species = None
        if genus and species_name:
            species = db.query(Species).filter(
                Species.genus == genus,
                Species.species_name == species_name
            ).first()
            
            if not species:
                species = Species(
                    genus=genus, species_name=species_name,
                    display_name=f"{genus} {species_name}",
                    created_at=now, updated_at=now
                )
                db.add(species)
                db.flush()
        
        # Находим или создаем подвид
        subspecies = None
        if subspecies_name and species:
            subspecies = db.query(Subspecies).filter(
                Subspecies.species_guid == species.guid,
                Subspecies.subspecies_name == subspecies_name
            ).first()
            
            if not subspecies:
                subspecies = Subspecies(
                    species_guid=species.guid,
                    subspecies_name=subspecies_name,
                    display_name=f"{genus} {species_name} {subspecies_name}",
                    created_at=now, updated_at=now
                )
                db.add(subspecies)
                db.flush()
        
        # Находим или создаем сборщика
        collector_name = row.get("collector_name", "").strip()
        person = None
        if collector_name:
            person = db.query(Person).filter(Person.display_name == collector_name).first()
            if not person:
                person = Person(display_name=collector_name, created_at=now, updated_at=now)
                db.add(person)
                db.flush()
        
        # Парсим координаты
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
        
        # Создаем точку
        point = Point(
            latitude=lat, longitude=lon,
            latitude_dms=lat_dms, longitude_dms=lon_dms,
            location_original=row.get("location_original", ""),
            date_text=row.get("date_text", ""),
            created_at=now, updated_at=now
        )
        db.add(point)
        db.flush()
        
        # Связь со сборщиком
        if person:
            db.add(Link(
                from_guid=person.guid, to_guid=point.guid,
                from_type="person", to_type="point", relation_type="collected_at",
                direction="one_to_many", is_directed=1,
                created_at=now, updated_at=now
            ))
        
        # Связь с таксоном
        taxon_guid = subspecies.guid if subspecies else (species.guid if species else None)
        taxon_type = "subspecies" if subspecies else ("species" if species else None)
        
        if taxon_guid and taxon_type:
            db.add(Link(
                from_guid=taxon_guid, to_guid=point.guid,
                from_type=taxon_type, to_type="point", relation_type="has_taxon",
                direction="many_to_many", is_directed=1,
                created_at=now, updated_at=now
            ))
        
        imported_count += 1
    
    db.commit()
    db.close()
    return {"message": f"Импортировано {imported_count} записей"}

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
        result.append({
            "link_guid": link.link_guid,
            "relation_type": link.relation_type,
            "target_type": link.to_type,
            "target_guid": link.to_guid,
            "direction": "outgoing"
        })
    for link in incoming:
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
