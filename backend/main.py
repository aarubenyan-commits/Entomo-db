import uuid
import re
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

def parse_coordinate_dms(coord_str):
    """Парсит координаты из строки в десятичные градусы."""
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

SQLALCHEMY_DATABASE_URL = "sqlite:///./entomo.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

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
    geocoding_status = Column(String, default="pending")
    date_text = Column(String, nullable=True)
    date_start = Column(String, nullable=True)
    date_end = Column(String, nullable=True)
    location_original = Column(Text, nullable=True)
    location_structured = Column(Text, nullable=True)
    google_maps_url = Column(String, nullable=True)
    elevation = Column(Integer, nullable=True)
    location_author_guid = Column(String, ForeignKey("persons.guid"), nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Taxon(Base):
    __tablename__ = "taxa"
    guid = Column(String, primary_key=True, default=generate_uuid)
    genus = Column(String, nullable=False)
    species = Column(String, nullable=True)
    subspecies = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
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
    description = Column(String, nullable=True)
    context = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)



class Study(Base):
    __tablename__ = "studies"
    guid = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=True)  # название исследования
    url = Column(String, nullable=True)    # ссылка на сайт
    description = Column(Text, nullable=True)  # краткое описание
    authors = Column(String, nullable=True)    # автор(ы)
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

def decimal_to_dms(decimal):
    if decimal is None:
        return None
    degrees = int(abs(decimal))
    minutes_full = (abs(decimal) - degrees) * 60
    minutes = int(minutes_full)
    seconds = (minutes_full - minutes) * 60
    return f"{degrees}°{minutes:02d}'{seconds:.1f}\""

def format_coordinates(lat, lon):
    if lat is None or lon is None:
        return None, None
    lat_dir = "N" if lat >= 0 else "S"
    lon_dir = "E" if lon >= 0 else "W"
    return f"{decimal_to_dms(lat)}{lat_dir}", f"{decimal_to_dms(lon)}{lon_dir}"

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

# ========== ТОЧКИ ==========
@app.get("/points")
def get_points():
    db = SessionLocal()
    points = db.query(Point).all()
    result = []
    for p in points:
        lat_dms, lon_dms = format_coordinates(p.latitude, p.longitude)
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
        result.append({
            "guid": p.guid,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "latitude_dms": lat_dms,
            "longitude_dms": lon_dms,
            "location_original": p.location_original,
            "date_text": p.date_text,
            "display_date": p.date_text,
            "collector_name": collector_name,
            "date_start": p.date_start,
            "date_end": p.date_end,
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
        "date_text": point.date_text,
        "date_start": point.date_start,
        "date_end": point.date_end,
    }


class StudyCreate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    authors: Optional[str] = None


class PointCreate(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_original: Optional[str] = None
    location_structured: Optional[str] = None
    google_maps_url: Optional[str] = None
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    date_text: Optional[str] = None
    collector_name: str
    coord_string: Optional[str] = None

@app.post("/points/create")
def create_point(point: PointCreate):
    db = SessionLocal()
    now = datetime.now().isoformat()

    lat = parse_coordinate(point.latitude)
    lon = parse_coordinate(point.longitude)
    lat_dms = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
    lon_dms = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
    print(f"DEBUG: lat={lat}, lon={lon}, lat_dms={lat_dms}, lon_dms={lon_dms}")

    person = db.query(Person).filter(Person.display_name == point.collector_name).first()
    if not person:
        person = Person(display_name=point.collector_name, created_at=now, updated_at=now)
        db.add(person)
        db.flush()

    db_point = Point(
        latitude=lat,
        longitude=lon,
        latitude_dms=lat_dms,
        longitude_dms=lon_dms,
        location_original=point.location_original,
        location_structured=point.location_structured,
        google_maps_url=point.google_maps_url,
        date_start=point.date_start,
        date_end=point.date_end,
        date_text=point.date_text,
        created_at=now,
        updated_at=now
    )
    db.add(db_point)
    db.flush()

    link = Link(
        from_guid=person.guid,
        to_guid=db_point.guid,
        from_type="person",
        to_type="point",
        relation_type="collected_at",
        direction="one_to_many",
        is_directed=1,
        created_at=now,
        updated_at=now
    )
    db.add(link)

    point_guid = db_point.guid
    db.commit()
    db.close()
    return {"guid": point_guid}

@app.put("/points/{guid}")
def update_point(guid: str, point: PointCreate):
    db = SessionLocal()
    now = datetime.now().isoformat()
    db_point = db.query(Point).filter(Point.guid == guid).first()
    if not db_point:
        raise HTTPException(404, "Point not found")

    lat = parse_coordinate(point.latitude)
    lon = parse_coordinate(point.longitude)
    lat_dms = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
    lon_dms = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
    print(f"DEBUG: lat={lat}, lon={lon}, lat_dms={lat_dms}, lon_dms={lon_dms}")

    db_point.latitude = lat
    db_point.longitude = lon
    db_point.latitude_dms = lat_dms
    db_point.longitude_dms = lon_dms
    db_point.location_original = point.location_original
    db_point.location_structured = point.location_structured
    db_point.google_maps_url = point.google_maps_url
    db_point.date_start = point.date_start
    db_point.date_end = point.date_end
    db_point.date_text = point.date_text
    db_point.updated_at = now

    new_person = db.query(Person).filter(Person.display_name == point.collector_name).first()
    if not new_person:
        new_person = Person(display_name=point.collector_name, created_at=now, updated_at=now)
        db.add(new_person)
        db.flush()

    db.query(Link).filter(
        Link.to_guid == guid,
        Link.from_type == "person",
        Link.relation_type == "collected_at"
    ).delete()

    link = Link(
        from_guid=new_person.guid,
        to_guid=guid,
        from_type="person",
        to_type="point",
        relation_type="collected_at",
        direction="one_to_many",
        is_directed=1,
        created_at=now,
        updated_at=now
    )
    db.add(link)
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

# ========== СБОРЩИКИ ==========
@app.get("/persons")
def get_persons():
    db = SessionLocal()
    persons = db.query(Person).all()
    db.close()
    return [{"guid": p.guid, "display_name": p.display_name} for p in persons]

@app.get("/persons/{guid}")
def get_person(guid: str):
    db = SessionLocal()
    person = db.query(Person).filter(Person.guid == guid).first()
    if not person:
        raise HTTPException(404, "Person not found")
    db.close()
    return {"guid": person.guid, "display_name": person.display_name, "role": person.role}

@app.post("/persons")
def create_person(display_name: str):
    db = SessionLocal()
    now = datetime.now().isoformat()
    person = Person(display_name=display_name, created_at=now, updated_at=now)
    db.add(person)
    db.commit()
    person_guid = person.guid
    db.close()
    return {"guid": person_guid}

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
def delete_person(guid: str, replace_with: Optional[str] = None):
    db = SessionLocal()
    person = db.query(Person).filter(Person.guid == guid).first()
    if not person:
        raise HTTPException(404, "Person not found")
    links = db.query(Link).filter(
        Link.from_guid == guid,
        Link.from_type == "person",
        Link.relation_type == "collected_at"
    ).all()
    point_guids = [link.to_guid for link in links]
    if replace_with:
        new_person = db.query(Person).filter(Person.display_name == replace_with).first()
        if not new_person:
            new_person = Person(display_name=replace_with, created_at=datetime.now().isoformat(), updated_at=datetime.now().isoformat())
            db.add(new_person)
            db.flush()
        for link in links:
            link.from_guid = new_person.guid
            link.updated_at = datetime.now().isoformat()
    else:
        for link in links:
            db.delete(link)
    db.query(Link).filter((Link.from_guid == guid) | (Link.to_guid == guid)).delete()
    db.delete(person)
    db.commit()
    db.close()
    return {"message": "Deleted", "affected_points": len(point_guids)}

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

# ========== ТАКСОНЫ ==========
@app.get("/taxa")
def get_taxa():
    db = SessionLocal()
    taxa = db.query(Taxon).all()
    db.close()
    return [{"guid": t.guid, "genus": t.genus, "species": t.species, "subspecies": t.subspecies, "display_name": t.display_name} for t in taxa]

@app.post("/taxa")
def create_taxon(genus: str, species: Optional[str] = None, subspecies: Optional[str] = None, display_name: Optional[str] = None):
    db = SessionLocal()
    now = datetime.now().isoformat()
    if not display_name:
        display_name = genus + (f" {species}" if species else "") + (f" {subspecies}" if subspecies else "")
    taxon = Taxon(
        genus=genus.capitalize(),
        species=species.lower() if species else None,
        subspecies=subspecies.lower() if subspecies else None,
        display_name=display_name,
        created_at=now,
        updated_at=now
    )
    db.add(taxon)
    db.commit()
    taxon_guid = taxon.guid
    db.close()
    return {"guid": taxon_guid}

@app.put("/taxa/{guid}")
def update_taxon(guid: str, genus: str, species: Optional[str] = None, subspecies: Optional[str] = None, display_name: Optional[str] = None):
    db = SessionLocal()
    taxon = db.query(Taxon).filter(Taxon.guid == guid).first()
    if not taxon:
        raise HTTPException(404, "Taxon not found")
    taxon.genus = genus.capitalize()
    taxon.species = species.lower() if species else None
    taxon.subspecies = subspecies.lower() if subspecies else None
    taxon.display_name = display_name or genus + (f" {species}" if species else "") + (f" {subspecies}" if subspecies else "")
    taxon.updated_at = datetime.now().isoformat()
    db.commit()
    db.close()
    return {"message": "Updated"}

@app.delete("/taxa/{guid}")
def delete_taxon(guid: str):
    db = SessionLocal()
    db.query(Link).filter((Link.from_guid == guid) | (Link.to_guid == guid)).delete()
    db.query(Taxon).filter(Taxon.guid == guid).delete()
    db.commit()
    db.close()
    return {"message": "Deleted"}

@app.get("/taxa/search")
def search_taxa(q: str = ""):
    db = SessionLocal()
    taxa = db.query(Taxon).filter(
        (Taxon.genus.contains(q)) | (Taxon.species.contains(q)) | (Taxon.display_name.contains(q))
    ).limit(20).all()
    db.close()
    return [{"guid": t.guid, "genus": t.genus, "species": t.species, "display_name": t.display_name} for t in taxa]

# ========== СВЯЗИ ТОЧКА-ТАКСОН ==========
@app.get("/point_taxa/{point_guid}")
def get_point_taxa(point_guid: str):
    db = SessionLocal()
    links = db.query(Link).filter(
        Link.to_guid == point_guid,
        Link.from_type == "taxon"
    ).all()
    taxa = []
    for link in links:
        taxon = db.query(Taxon).filter(Taxon.guid == link.from_guid).first()
        if taxon:
            taxa.append({
                "guid": taxon.guid,
                "genus": taxon.genus,
                "species": taxon.species,
                "display_name": taxon.display_name
            })
    db.close()
    return taxa

@app.post("/point_taxa/{point_guid}/{taxon_guid}")
def add_taxon_to_point(point_guid: str, taxon_guid: str):
    db = SessionLocal()
    now = datetime.now().isoformat()
    existing = db.query(Link).filter(
        Link.from_guid == taxon_guid,
        Link.to_guid == point_guid,
        Link.from_type == "taxon",
        Link.to_type == "point"
    ).first()
    if existing:
        db.close()
        return {"message": "Already linked"}
    link = Link(
        link_guid=generate_uuid(),
        from_guid=taxon_guid,
        to_guid=point_guid,
        from_type="taxon",
        to_type="point",
        relation_type="has_taxon",
        direction="many_to_many",
        is_directed=1,
        created_at=now,
        updated_at=now
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
        Link.from_type == "taxon",
        Link.to_type == "point"
    ).first()
    if link:
        db.delete(link)
        db.commit()
    db.close()
    return {"message": "Unlinked"}

# ========== ГРАФОВЫЕ ЭНДПОИНТЫ ==========
@app.get("/objects/{type}/{guid}/links")
def get_object_links(type: str, guid: str):
    """Получить все связи объекта по GUID для графа"""
    db = SessionLocal()
    try:
        outgoing = db.query(Link).filter(
            Link.from_guid == guid,
            Link.from_type == type
        ).all()

        incoming = db.query(Link).filter(
            Link.to_guid == guid,
            Link.to_type == type
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

        return result
    finally:
        db.close()

@app.get("/search")
def search_objects(q: str = "", type: Optional[str] = None, limit: int = 20):
    db = SessionLocal()
    results = []
    if not type or type == "person":
        persons = db.query(Person).filter(Person.display_name.contains(q)).limit(limit).all()
        for p in persons:
            results.append({"type": "person", "guid": p.guid, "name": p.display_name})
    if not type or type == "taxon":
        taxa = db.query(Taxon).filter((Taxon.genus.contains(q)) | (Taxon.species.contains(q))).limit(limit).all()
        for t in taxa:
            results.append({"type": "taxon", "guid": t.guid, "name": t.display_name})
    db.close()
    return results

# ========== ИМПОРТ ==========
def parse_collector(text):
    match = re.search(r'leg\.\s+([A-Z]\.?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', text)
    if match:
        return match.group(1).strip()
    return "Рубенян А."

def parse_date(text):
    match = re.search(r'(\d{1,2}\.\w{1,3}\.?\d{4})', text)
    if match:
        return match.group(1)
    return None

def parse_location(text):
    cleaned = re.sub(r'N\d{1,2}°\d{1,2}\'.*?"\s+E\d{1,2}°\d{1,2}\'.*?"', '', text)
    cleaned = re.sub(r'\d{1,2}\.\w{1,3}\.?\d{4}', '', cleaned)
    cleaned = re.sub(r'leg\..*$', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned[:200] if cleaned else "Unknown"

def parse_line(line):
    lat, lon = parse_coordinate(line)
    return {
        'location_original': parse_location(line),
        'date': parse_date(line),
        'latitude': lat,
        'longitude': lon,
        'collector': parse_collector(line),
    }

@app.post("/import/text")
async def import_text(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode('utf-8')
    lines = text.strip().split('\n')
    db = SessionLocal()
    imported = []
    now = datetime.now().isoformat()
    for line in lines:
        if not line.strip():
            continue
        parsed = parse_line(line)
        collector = parsed['collector']
        person = db.query(Person).filter(Person.display_name == collector).first()
        if not person:
            person = Person(display_name=collector, created_at=now, updated_at=now)
            db.add(person)
            db.flush()
        # Вычисляем DMS для импортируемой точки
        lat = parsed['latitude']
        lon = parsed['longitude']
        lat_dms = decimal_to_dms_advanced(lat, is_lat=True) if lat is not None else None
        lon_dms = decimal_to_dms_advanced(lon, is_lat=False) if lon is not None else None
        
        point = Point(
            location_original=parsed['location_original'],
            date_text=parsed['date'],
            latitude=lat,
            longitude=lon,
            latitude_dms=lat_dms,
            longitude_dms=lon_dms,
            created_at=now,
            updated_at=now
        )
        db.add(point)
        db.flush()
        link = Link(
            from_guid=person.guid,
            to_guid=point.guid,
            from_type="person",
            to_type="point",
            relation_type="collected_at",
            direction="one_to_many",
            is_directed=1,
            created_at=now,
            updated_at=now
        )
        db.add(link)
        imported.append(parsed)
    db.commit()
    db.close()
    return {"message": f"Импортировано {len(imported)} записей", "imported": imported}


def parse_taxon_name(input_name: str):
    if not input_name:
        return {"genus": None, "species": None, "subspecies": None}
    import re
    name = re.sub(r"([^)]*)", "", input_name).strip()
    parts = name.split()
    return {
        "genus": parts[0].capitalize() if len(parts) > 0 else None,
        "species": parts[1] if len(parts) > 1 else None,
        "subspecies": parts[2] if len(parts) > 2 else None,
        "display_name": input_name
    }



# ========== ИССЛЕДОВАНИЯ (STUDY) ==========
@app.get("/studies")
def get_studies():
    db = SessionLocal()
    studies = db.query(Study).all()
    db.close()
    return [{"guid": s.guid, "title": s.title, "url": s.url, "description": s.description, "authors": s.authors, "created_at": s.created_at, "updated_at": s.updated_at} for s in studies]

@app.get("/studies/{guid}")
def get_study(guid: str):
    db = SessionLocal()
    study = db.query(Study).filter(Study.guid == guid).first()
    if not study:
        raise HTTPException(404, "Study not found")
    db.close()
    return {"guid": study.guid, "title": study.title, "url": study.url, "description": study.description, "authors": study.authors}

@app.post("/studies")
def create_study(study_data: StudyCreate):
    db = SessionLocal()
    now = datetime.now().isoformat()
    if not study_data.title and not study_data.url:
        raise HTTPException(400, "Необходимо указать title или url")
    study = Study(
        title=study_data.title,
        url=study_data.url,
        description=study_data.description,
        authors=study_data.authors,
        created_at=now,
        updated_at=now
    )
    db.add(study)
    db.commit()
    study_guid = study.guid
    db.close()
    return {"guid": study_guid}

@app.put("/studies/{guid}")
def update_study(guid: str, study_data: StudyCreate):
    db = SessionLocal()
    study = db.query(Study).filter(Study.guid == guid).first()
    if not study:
        raise HTTPException(404, "Study not found")
    if study_data.title is not None:
        study.title = study_data.title
    if study_data.url is not None:
        study.url = study_data.url
    if study_data.description is not None:
        study.description = study_data.description
    if study_data.authors is not None:
        study.authors = study_data.authors
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

# ========== СВЯЗИ С ИСТОЧНИКАМИ (SOURCE) ==========
@app.post("/source/{from_type}/{from_guid}/{study_guid}")
def add_source(from_type: str, from_guid: str, study_guid: str):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    if from_type == "person":
        obj = db.query(Person).filter(Person.guid == from_guid).first()
    elif from_type == "point":
        obj = db.query(Point).filter(Point.guid == from_guid).first()
    elif from_type == "taxon":
        obj = db.query(Taxon).filter(Taxon.guid == from_guid).first()
    else:
        db.close()
        raise HTTPException(400, "Invalid from_type")
    
    if not obj:
        db.close()
        raise HTTPException(404, f"{from_type} not found")
    
    study = db.query(Study).filter(Study.guid == study_guid).first()
    if not study:
        db.close()
        raise HTTPException(404, "Study not found")
    
    existing = db.query(Link).filter(
        Link.from_guid == from_guid,
        Link.to_guid == study_guid,
        Link.from_type == from_type,
        Link.to_type == "study",
        Link.relation_type == "source"
    ).first()
    
    if existing:
        link_guid = existing.link_guid
        db.close()
        return {"message": "Source already linked", "link_guid": link_guid}
    
    link = Link(
        link_guid=generate_uuid(),
        from_guid=from_guid,
        to_guid=study_guid,
        from_type=from_type,
        to_type="study",
        relation_type="source",
        direction="many_to_many",
        is_directed=1,
        created_at=now,
        updated_at=now
    )
    db.add(link)
    db.commit()
    
    # Получаем link_guid ДО закрытия сессии
    link_guid = link.link_guid
    
    db.close()
    return {"link_guid": link_guid, "message": "Source linked"}

@app.delete("/source/{link_guid}")
def remove_source(link_guid: str):
    db = SessionLocal()
    link = db.query(Link).filter(Link.link_guid == link_guid).first()
    if not link:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
    db.close()
    return {"message": "Source removed"}

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)