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
    return f"{degrees}°{minutes:02d}'{seconds:.1f}\"{direction}"

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

@app.put("/subspecies/{guid}")
def update_subspecies(guid: str, subspecies_data: dict):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    subspecies = db.query(Subspecies).filter(Subspecies.guid == guid).first()
    if not subspecies:
        raise HTTPException(404, "Subspecies not found")
    
    if "subspecies_name" in subspecies_data:
        subspecies.subspecies_name = subspecies_data["subspecies_name"].strip().lower()
        subspecies.display_name = subspecies_data["subspecies_name"]
    
    subspecies.updated_at = now
    db.commit()
    db.close()
    return {"message": "Subspecies updated"}

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
    
    db.query(Link).filter((Link.from_guid == guid) | (Link.to_guid == guid)).delete()
    db.delete(person)
    db.commit()
    db.close()
    return {"message": "Deleted"}

@app.get("/persons/{guid}/points")
def get_person_points(guid: str):
    """Ищет точки в ОБОИХ направлениях (множественные сборщики)"""
    db = SessionLocal()
    links_as_from = db.query(Link).filter(
        Link.from_guid == guid,
        Link.from_type == "person",
        Link.relation_type == "collected_at"
    ).all()
    
    links_as_to = db.query(Link).filter(
        Link.to_guid == guid,
        Link.to_type == "person",
        Link.relation_type == "collected_at"
    ).all()
    
    all_links = links_as_from + links_as_to
    point_ids = set()
    for link in all_links:
        if link.from_guid == guid:
            point_ids.add(link.to_guid)
        else:
            point_ids.add(link.from_guid)
    
    points = []
    for point_id in point_ids:
        point = db.query(Point).filter(Point.guid == point_id).first()
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
def enrich_point_with_relations(point, db):
    """Вспомогательная функция для обогащения точки всеми связями"""
    collectors = []
    collector_links = db.query(Link).filter(
        ((Link.from_guid == point.guid) & (Link.to_type == "person")) |
        ((Link.to_guid == point.guid) & (Link.from_type == "person")),
        Link.relation_type == "collected_at"
    ).all()
    
    for link in collector_links:
        person_guid = link.from_guid if link.from_type == "person" else link.to_guid
        person = db.query(Person).filter(Person.guid == person_guid).first()
        if person:
            collectors.append({"guid": person.guid, "display_name": person.display_name})
    
    taxa = []
    taxon_links = db.query(Link).filter(
        Link.to_guid == point.guid,
        Link.relation_type == "has_taxon"
    ).order_by(Link.sort_order.asc()).all()
    
    for link in taxon_links:
        if link.from_type == "species":
            species = db.query(Species).filter(Species.guid == link.from_guid).first()
            if species:
                taxa.append({
                    "guid": species.guid,
                    "display_name": species.display_name,
                    "type": "species",
                    "sort_order": link.sort_order
                })
        elif link.from_type == "subspecies":
            subspecies = db.query(Subspecies).filter(Subspecies.guid == link.from_guid).first()
            if subspecies:
                parent_species = db.query(Species).filter(Species.guid == subspecies.species_guid).first()
                if parent_species:
                    taxa.append({
                        "guid": subspecies.guid,
                        "display_name": f"{parent_species.genus} {parent_species.species_name} {subspecies.subspecies_name}",
                        "type": "subspecies",
                        "sort_order": link.sort_order
                    })
    
    taxa.sort(key=lambda x: x.get("sort_order", 0))
    
    studies = []
    study_links = db.query(Link).filter(
        Link.from_guid == point.guid,
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
    
    return {
        "collectors": collectors,
        "taxa": taxa,
        "studies": studies,
        "studies_count": len(studies),
        "taxon_ids": [t["guid"] for t in taxa]
    }

@app.get("/points")
def get_points():
    db = SessionLocal()
    points = db.query(Point).all()
    result = []
    for p in points:
        relations = enrich_point_with_relations(p, db)
        result.append({
            "guid": p.guid,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "latitude_dms": p.latitude_dms,
            "longitude_dms": p.longitude_dms,
            "location_original": p.location_original,
            "date_text": p.date_text,
            "display_date": p.date_text,
            "collector_name": relations["collectors"][0]["display_name"] if relations["collectors"] else None,
            "collectors": relations["collectors"],
            "taxa": relations["taxa"],
            "studies": relations["studies"],
            "studies_count": relations["studies_count"],
            "taxon_ids": relations["taxon_ids"]
        })
    db.close()
    return result

@app.get("/points/{guid}")
def get_point(guid: str):
    db = SessionLocal()
    point = db.query(Point).filter(Point.guid == guid).first()
    if not point:
        raise HTTPException(404, "Point not found")
    relations = enrich_point_with_relations(point, db)
    db.close()
    return {
        "guid": point.guid,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "location_original": point.location_original,
        "date_text": point.date_text,
        "collectors": relations["collectors"],
        "taxa": relations["taxa"]
    }

@app.post("/points/create")
def create_point(point_data: dict):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    lat = point_data.get("latitude")
    lon = point_data.get("longitude")
    lat_dms = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
    lon_dms = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
    
    point = Point(
        latitude=lat, longitude=lon, latitude_dms=lat_dms, longitude_dms=lon_dms,
        location_original=point_data.get("location_original"),
        date_text=point_data.get("date_text"),
        created_at=now, updated_at=now
    )
    db.add(point)
    db.flush()
    
    collectors_data = point_data.get("collectors", [])
    if collectors_data:
        for collector_info in collectors_data:
            collector_guid = collector_info.get("guid")
            if collector_guid:
                existing = db.query(Link).filter(
                    ((Link.from_guid == collector_guid) & (Link.to_guid == point.guid)) |
                    ((Link.to_guid == collector_guid) & (Link.from_guid == point.guid)),
                    Link.relation_type == "collected_at"
                ).first()
                if not existing:
                    link = Link(
                        from_guid=collector_guid, to_guid=point.guid,
                        from_type="person", to_type="point", relation_type="collected_at",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    )
                    db.add(link)
    else:
        collector_name = point_data.get("collector_name")
        if collector_name and collector_name.strip():
            person = db.query(Person).filter(Person.display_name == collector_name).first()
            if not person:
                person = Person(display_name=collector_name, created_at=now, updated_at=now)
                db.add(person)
                db.flush()
            
            link = Link(
                from_guid=person.guid, to_guid=point.guid,
                from_type="person", to_type="point", relation_type="collected_at",
                direction="many_to_many", is_directed=1,
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
    point.updated_at = now
    
    collectors_data = point_data.get("collectors", [])
    if collectors_data:
        db.query(Link).filter(
            ((Link.from_guid == guid) | (Link.to_guid == guid)),
            Link.relation_type == "collected_at"
        ).delete()
        
        for collector_info in collectors_data:
            collector_guid = collector_info.get("guid")
            if collector_guid:
                link = Link(
                    from_guid=collector_guid, to_guid=guid,
                    from_type="person", to_type="point", relation_type="collected_at",
                    direction="many_to_many", is_directed=1,
                    created_at=now, updated_at=now
                )
                db.add(link)
    else:
        collector_name = point_data.get("collector_name")
        if collector_name and collector_name.strip():
            db.query(Link).filter(
                ((Link.from_guid == guid) | (Link.to_guid == guid)),
                Link.relation_type == "collected_at"
            ).delete()
            
            person = db.query(Person).filter(Person.display_name == collector_name).first()
            if not person:
                person = Person(display_name=collector_name, created_at=now, updated_at=now)
                db.add(person)
                db.flush()
            
            link = Link(
                from_guid=person.guid, to_guid=guid,
                from_type="person", to_type="point", relation_type="collected_at",
                direction="many_to_many", is_directed=1,
                created_at=now, updated_at=now
            )
            db.add(link)
    
    db.commit()
    db.close()
    return {"message": "Updated"}

@app.delete("/points/{guid}")
def delete_point(guid: str):
    db = SessionLocal()
    db.query(Link).filter((Link.from_guid == guid) | (Link.to_guid == guid)).delete()
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
                    "display_name": taxon.display_name,
                    "sort_order": link.sort_order
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
                    "display_name": taxon.display_name,
                    "sort_order": link.sort_order
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
        
        link.sort_order = sort_order
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

# ========== ИМПОРТ ==========
def parse_taxa_string(taxa_str):
    """Парсит строку с таксонами вида 'род вид подвид, род вид, род'"""
    if not taxa_str or not isinstance(taxa_str, str):
        return []
    
    taxa_list = []
    parts = [p.strip() for p in taxa_str.split(',') if p.strip()]
    
    for part in parts:
        words = part.split()
        if len(words) == 1:
            taxa_list.append({
                "genus": words[0],
                "species": None,
                "subspecies": None,
                "full_name": words[0]
            })
        elif len(words) == 2:
            taxa_list.append({
                "genus": words[0],
                "species": words[1],
                "subspecies": None,
                "full_name": f"{words[0]} {words[1]}"
            })
        else:
            genus = words[0]
            species = words[1]
            subspecies = " ".join(words[2:])
            taxa_list.append({
                "genus": genus,
                "species": species,
                "subspecies": subspecies,
                "full_name": f"{genus} {species} {subspecies}"
            })
    
    return taxa_list

def parse_collectors_string(collector_str):
    if not collector_str or not isinstance(collector_str, str):
        return []
    return [c.strip() for c in collector_str.split(',') if c.strip()]

def parse_sources_string(source_str):
    """Парсит строку с источниками через запятую"""
    if not source_str or not isinstance(source_str, str):
        return []
    return [s.strip() for s in source_str.split(',') if s.strip()]

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
                "latitude_dms": row.get("latitude_dms", ""),
                "longitude_dms": row.get("longitude_dms", ""),
                "location_original": row.get("location_original", ""),
                "date_text": row.get("date_text", ""),
                "collector_name": row.get("collector_name", ""),
                "taxa": row.get("taxa", ""),
                "source": row.get("source", ""),
                "notes": row.get("notes", ""),
                "genus": row.get("genus", ""),
                "species": row.get("species", ""),
                "subspecies": row.get("subspecies", ""),
                "display_name": row.get("display_name", "")
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
        "taxa_links_added": 0,
        "person_links_added": 0,
        "study_links_added": 0,
        "errors": []
    }
    
    for idx, row in enumerate(rows):
        try:
            # 1. Парсим таксоны из поля taxa
            all_taxa = []
            if row.get("taxa"):
                all_taxa = parse_taxa_string(row["taxa"])
            elif row.get("genus") and row.get("species"):
                all_taxa.append({
                    "genus": row.get("genus", "").strip().capitalize(),
                    "species": row.get("species", "").strip().lower(),
                    "subspecies": row.get("subspecies", "").strip().lower() or None,
                    "full_name": row.get("display_name", "")
                })
            
            taxon_objects = []
            for taxon_info in all_taxa:
                genus = taxon_info["genus"].strip().capitalize() if taxon_info["genus"] else None
                species_name = taxon_info["species"].strip().lower() if taxon_info["species"] else None
                subspecies_name = taxon_info["subspecies"].strip().lower() if taxon_info["subspecies"] else None
                
                if not genus:
                    continue
                
                species = None
                if species_name:
                    species = db.query(Species).filter(
                        Species.genus == genus,
                        Species.species_name == species_name
                    ).first()
                    
                    if species:
                        stats["species_existing"] += 1
                    else:
                        species = Species(
                            genus=genus,
                            species_name=species_name,
                            display_name=f"{genus} {species_name}",
                            created_at=now, updated_at=now
                        )
                        db.add(species)
                        db.flush()
                        stats["species_created"] += 1
                
                if subspecies_name and species:
                    subspecies = db.query(Subspecies).filter(
                        Subspecies.species_guid == species.guid,
                        Subspecies.subspecies_name == subspecies_name
                    ).first()
                    
                    if subspecies:
                        stats["subspecies_existing"] += 1
                        taxon_objects.append(("subspecies", subspecies))
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
                        taxon_objects.append(("subspecies", subspecies))
                elif species:
                    taxon_objects.append(("species", species))
                elif not species_name:
                    species = db.query(Species).filter(
                        Species.genus == genus,
                        Species.species_name == "sp."
                    ).first()
                    
                    if not species:
                        species = Species(
                            genus=genus,
                            species_name="sp.",
                            display_name=genus,
                            created_at=now, updated_at=now
                        )
                        db.add(species)
                        db.flush()
                        stats["species_created"] += 1
                    taxon_objects.append(("species", species))
            
            # 2. Парсим сборщиков
            collector_names = parse_collectors_string(row.get("collector_name", ""))
            person_objects = []
            for collector_name in collector_names:
                if collector_name:
                    person = db.query(Person).filter(Person.display_name == collector_name).first()
                    if person:
                        stats["persons_existing"] += 1
                    else:
                        person = Person(display_name=collector_name, created_at=now, updated_at=now)
                        db.add(person)
                        db.flush()
                        stats["persons_created"] += 1
                    person_objects.append(person)
            
            # 3. Парсим источники (МНОЖЕСТВЕННЫЕ через запятую)
            source_titles = parse_sources_string(row.get("source", ""))
            study_objects = []
            for source_title in source_titles:
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
                    study_objects.append(study)
            
            # 4. Координаты
            lat = None
            lon = None
            
            lat_str = row.get("latitude", "")
            lon_str = row.get("longitude", "")
            if lat_str and lon_str:
                try:
                    lat = float(lat_str)
                    lon = float(lon_str)
                except:
                    pass
            
            if lat is None:
                lat_dms = row.get("latitude_dms", "")
                lon_dms = row.get("longitude_dms", "")
                if lat_dms and lon_dms:
                    lat = parse_coordinate_dms(lat_dms)
                    lon = parse_coordinate_dms(lon_dms)
            
            lat_dms_str = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
            lon_dms_str = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
            
            # 5. Ищем существующую точку
            point = None
            if lat is not None and lon is not None:
                point = db.query(Point).filter(
                    Point.latitude == lat,
                    Point.longitude == lon
                ).first()
            
            location = row.get("location_original", "")
            if not point and location:
                point = db.query(Point).filter(
                    Point.location_original == location
                ).first()
            
            if point:
                stats["points_updated"] += 1
                if point.latitude is None and lat is not None:
                    point.latitude = lat
                    point.latitude_dms = lat_dms_str
                if point.longitude is None and lon is not None:
                    point.longitude = lon
                    point.longitude_dms = lon_dms_str
                if not point.location_original and location:
                    point.location_original = location
                if not point.date_text and row.get("date_text"):
                    point.date_text = row.get("date_text")
                point.updated_at = now
            else:
                point = Point(
                    latitude=lat, longitude=lon,
                    latitude_dms=lat_dms_str, longitude_dms=lon_dms_str,
                    location_original=location,
                    date_text=row.get("date_text", ""),
                    created_at=now, updated_at=now
                )
                db.add(point)
                db.flush()
                stats["points_created"] += 1
            
            # 6. Добавляем связи с таксонами (дедупликация)
            for taxon_type, taxon in taxon_objects:
                existing = db.query(Link).filter(
                    Link.from_guid == taxon.guid,
                    Link.to_guid == point.guid,
                    Link.relation_type == "has_taxon"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=taxon.guid, to_guid=point.guid,
                        from_type=taxon_type, to_type="point", relation_type="has_taxon",
                        direction="many_to_many", is_directed=1,
                        sort_order=len(taxon_objects),
                        created_at=now, updated_at=now
                    ))
                    stats["taxa_links_added"] += 1
            
            # 7. Добавляем связи со сборщиками (дедупликация)
            for person in person_objects:
                existing = db.query(Link).filter(
                    ((Link.from_guid == person.guid) & (Link.to_guid == point.guid)) |
                    ((Link.to_guid == person.guid) & (Link.from_guid == point.guid)),
                    Link.relation_type == "collected_at"
                ).first()
                if not existing:
                    db.add(Link(
                        from_guid=person.guid, to_guid=point.guid,
                        from_type="person", to_type="point", relation_type="collected_at",
                        direction="many_to_many", is_directed=1,
                        created_at=now, updated_at=now
                    ))
                    stats["person_links_added"] += 1
            
            # 8. Добавляем связи с исследованиями (дедупликация)
            for study in study_objects:
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
                    stats["study_links_added"] += 1
                
                for taxon_type, taxon in taxon_objects:
                    existing = db.query(Link).filter(
                        Link.from_guid == taxon.guid,
                        Link.to_guid == study.guid,
                        Link.relation_type == "source"
                    ).first()
                    if not existing:
                        db.add(Link(
                            from_guid=taxon.guid, to_guid=study.guid,
                            from_type=taxon_type, to_type="study", relation_type="source",
                            direction="many_to_many", is_directed=1,
                            created_at=now, updated_at=now
                        ))
                        stats["study_links_added"] += 1
            
        except Exception as e:
            stats["errors"].append({"row": idx + 2, "error": str(e)})
            print(f"Error on row {idx + 2}: {e}")
    
    db.commit()
    db.close()
    
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
    if stats["taxa_links_added"] > 0:
        message_parts.append(f"добавлено {stats['taxa_links_added']} связей с таксонами")
    if stats["person_links_added"] > 0:
        message_parts.append(f"добавлено {stats['person_links_added']} связей со сборщиками")
    if stats["study_links_added"] > 0:
        message_parts.append(f"добавлено {stats['study_links_added']} связей с исследованиями")
    
    message = f"✅ Импорт завершен. {', '.join(message_parts)}."
    
    return {
        "message": message,
        "stats": stats,
        "errors": stats["errors"]
    }

# ========== ЭКСПОРТ ==========
@app.post("/export/points")
async def export_points_with_columns(request: dict):
    db = SessionLocal()
    
    filters = request.get("filters", {})
    columns = request.get("columns", {})
    
    query = db.query(Point)
    
    if filters.get("year"):
        query = query.filter(Point.date_text.contains(filters["year"]))
    if filters.get("collector"):
        points_with_collector = db.query(Link).filter(
            Link.relation_type == "collected_at"
        ).all()
        collector_guids = []
        for link in points_with_collector:
            person = db.query(Person).filter(Person.guid == link.from_guid).first()
            if person and filters["collector"].lower() in person.display_name.lower():
                collector_guids.append(link.to_guid)
        if collector_guids:
            query = query.filter(Point.guid.in_(collector_guids))
    
    points = query.all()
    
    csv_columns = []
    if columns.get("latitude", True):
        csv_columns.append("latitude")
    if columns.get("longitude", True):
        csv_columns.append("longitude")
    if columns.get("latitude_dms", True):
        csv_columns.append("latitude_dms")
    if columns.get("longitude_dms", True):
        csv_columns.append("longitude_dms")
    if columns.get("location_original", True):
        csv_columns.append("location_original")
    if columns.get("date_text", True):
        csv_columns.append("date_text")
    if columns.get("collector_name", True):
        csv_columns.append("collector_name")
    if columns.get("taxa", True):
        csv_columns.append("taxa")
    if columns.get("source", True):
        csv_columns.append("source")
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(csv_columns)
    
    for point in points:
        relations = enrich_point_with_relations(point, db)
        
        collector_names = ", ".join([c["display_name"] for c in relations["collectors"]])
        taxa_names = ", ".join([t["display_name"] for t in relations["taxa"]])
        source_names = ", ".join([s["title"] for s in relations["studies"]])
        
        row = []
        for col in csv_columns:
            if col == "latitude":
                row.append(point.latitude if point.latitude is not None else "")
            elif col == "longitude":
                row.append(point.longitude if point.longitude is not None else "")
            elif col == "latitude_dms":
                row.append(point.latitude_dms if point.latitude_dms else "")
            elif col == "longitude_dms":
                row.append(point.longitude_dms if point.longitude_dms else "")
            elif col == "location_original":
                row.append(point.location_original or "")
            elif col == "date_text":
                row.append(point.date_text or "")
            elif col == "collector_name":
                row.append(collector_names)
            elif col == "taxa":
                row.append(taxa_names)
            elif col == "source":
                row.append(source_names)
            else:
                row.append("")
        
        writer.writerow(row)
    
    db.close()
    
    return StreamingResponse(
        iter([output.getvalue()]), 
        media_type="text/csv", 
        headers={"Content-Disposition": "attachment; filename=entomo_export.csv"}
    )

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
                            ((Link.from_guid == old_person_guid) & (Link.to_guid == point.guid)) |
                            ((Link.to_guid == old_person_guid) & (Link.from_guid == point.guid)),
                            Link.relation_type == "collected_at"
                        ).delete()
                        
                        existing_link = db.query(Link).filter(
                            ((Link.from_guid == new_person_guid) & (Link.to_guid == point.guid)) |
                            ((Link.to_guid == new_person_guid) & (Link.from_guid == point.guid)),
                            Link.relation_type == "collected_at"
                        ).first()
                        if not existing_link:
                            db.add(Link(
                                from_guid=new_person_guid, to_guid=point.guid,
                                from_type="person", to_type="point", relation_type="collected_at",
                                direction="many_to_many", is_directed=1,
                                created_at=now, updated_at=now
                            ))
                        point.updated_at = now
                    
                    db.query(Link).filter(
                        (Link.from_guid == old_person_guid) | (Link.to_guid == old_person_guid)
                    ).delete()
                    db.delete(old_person)
                    replaced_person = old_person.display_name
                    updated_count = len(points)
        
        if "collector_name" in request.updates and request.updates["collector_name"] and not replaced_person:
            collector_name = request.updates["collector_name"]
            new_person = db.query(Person).filter(Person.display_name == collector_name).first()
            if not new_person:
                new_person = Person(display_name=collector_name, created_at=now, updated_at=now)
                db.add(new_person)
                db.flush()
            
            for point in points:
                db.query(Link).filter(
                    (Link.from_guid == point.guid) | (Link.to_guid == point.guid),
                    Link.relation_type == "collected_at"
                ).delete()
                
                db.add(Link(
                    from_guid=new_person.guid, to_guid=point.guid,
                    from_type="person", to_type="point", relation_type="collected_at",
                    direction="many_to_many", is_directed=1,
                    created_at=now, updated_at=now
                ))
                point.updated_at = now
                updated_count += 1
        
        if "study_guid" in request.updates and request.updates["study_guid"]:
            study = db.query(Study).filter(Study.guid == request.updates["study_guid"]).first()
            if not study:
                errors.append("Исследование не найдено")
            else:
                for point in points:
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
                updated_count = len(points)
        
        if "taxa_guids" in request.updates and request.updates["taxa_guids"]:
            taxa_guids = request.updates["taxa_guids"]
            new_taxa = []
            for taxon_guid in taxa_guids:
                species = db.query(Species).filter(Species.guid == taxon_guid).first()
                if species:
                    new_taxa.append(("species", species))
                else:
                    subspecies = db.query(Subspecies).filter(Subspecies.guid == taxon_guid).first()
                    if subspecies:
                        new_taxa.append(("subspecies", subspecies))
            
            for point in points:
                db.query(Link).filter(
                    Link.to_guid == point.guid,
                    Link.relation_type == "has_taxon"
                ).delete()
                
                for idx, (taxon_type, taxon) in enumerate(new_taxa):
                    db.add(Link(
                        from_guid=taxon.guid, to_guid=point.guid,
                        from_type=taxon_type, to_type="point", relation_type="has_taxon",
                        direction="many_to_many", is_directed=1,
                        sort_order=idx,
                        created_at=now, updated_at=now
                    ))
                point.updated_at = now
            updated_count = len(points)
        
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
            links = db.query(Link).filter(
                ((Link.from_guid == point.guid) | (Link.to_guid == point.guid)),
                Link.relation_type == "collected_at"
            ).all()
            
            for link in links:
                person_guid = link.from_guid if link.from_type == "person" else link.to_guid
                person = db.query(Person).filter(Person.guid == person_guid).first()
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

# ========== ДЕТАЛЬНЫЕ ЭНДПОИНТЫ ==========
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

@app.delete("/species/{guid}")
def delete_species(guid: str):
    db = SessionLocal()
    species = db.query(Species).filter(Species.guid == guid).first()
    if not species:
        raise HTTPException(404, "Species not found")
    
    db.query(Subspecies).filter(Subspecies.species_guid == guid).delete()
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
    
    db.query(Link).filter(
        (Link.from_guid == guid) | (Link.to_guid == guid)
    ).delete()
    db.delete(subspecies)
    db.commit()
    db.close()
    return {"message": "Subspecies deleted"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
