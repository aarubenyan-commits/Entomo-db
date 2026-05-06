import uuid
import re
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

SQLALCHEMY_DATABASE_URL = "sqlite:///./entomo.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class Person(Base):
    __tablename__ = "persons"
    guid = Column(String, primary_key=True, default=generate_uuid)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Point(Base):
    __tablename__ = "points"
    guid = Column(String, primary_key=True, default=generate_uuid)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
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
    description = Column(String, nullable=True)
    context = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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

def convert_roman_date(roman_date):
    if not roman_date:
        return None
    roman_map = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10,'XI':11,'XII':12}
    match = re.search(r'(\d{1,2})\.([IVX]+)\.(\d{4})', roman_date)
    if match:
        day = match[1].zfill(2)
        month = roman_map.get(match[2], 1)
        year = match[3]
        return f"{day}.{str(month).zfill(2)}.{year}"
    return roman_date

# ========== ЭНДПОИНТЫ ==========
@app.get("/points")
def get_points():
    db = SessionLocal()
    points = db.query(Point).all()
    result = []
    for p in points:
        lat_dms, lon_dms = format_coordinates(p.latitude, p.longitude)
        # Получаем сборщика через связь
        link = db.query(Link).filter(
            Link.to_guid == p.guid,
            Link.from_type == "person",
            Link.relation_type == "collected_at"
        ).first()
        collector_name = None
        if link:
            person = db.query(Person).filter(Person.guid == link.from_guid).first()
            if person:
                collector_name = person.full_name
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

@app.post("/points/create")
def create_point(point: PointCreate):
    db = SessionLocal()
    now = datetime.now().isoformat()
    
    # Найти или создать сборщика
    person = db.query(Person).filter(Person.full_name == point.collector_name).first()
    if not person:
        person = Person(full_name=point.collector_name, role="collector", created_at=now, updated_at=now)
        db.add(person)
        db.flush()
    
    db_point = Point(
        latitude=point.latitude,
        longitude=point.longitude,
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
    
    # Обновляем поля точки
    db_point.latitude = point.latitude
    db_point.longitude = point.longitude
    db_point.location_original = point.location_original
    db_point.location_structured = point.location_structured
    db_point.google_maps_url = point.google_maps_url
    db_point.date_start = point.date_start
    db_point.date_end = point.date_end
    db_point.date_text = point.date_text
    db_point.updated_at = now
    
    # Обновляем связь со сборщиком
    old_link = db.query(Link).filter(
        Link.to_guid == guid,
        Link.from_type == "person",
        Link.relation_type == "collected_at"
    ).first()
    
    new_person = db.query(Person).filter(Person.full_name == point.collector_name).first()
    if not new_person:
        new_person = Person(full_name=point.collector_name, role="collector", created_at=now, updated_at=now)
        db.add(new_person)
        db.flush()
    
    if old_link:
        if old_link.from_guid != new_person.guid:
            old_link.from_guid = new_person.guid
            old_link.updated_at = now
    else:
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

@app.get("/persons")
def get_persons():
    db = SessionLocal()
    persons = db.query(Person).all()
    db.close()
    return [{"guid": p.guid, "full_name": p.full_name, "role": p.role} for p in persons]

@app.post("/persons")
def create_person(full_name: str, role: str = "collector"):
    db = SessionLocal()
    now = datetime.now().isoformat()
    person = Person(full_name=full_name, role=role, created_at=now, updated_at=now)
    db.add(person)
    db.commit()
    person_guid = person.guid
    db.close()
    return {"guid": person_guid}

@app.put("/persons/{guid}")
def update_person(guid: str, full_name: str):
    db = SessionLocal()
    person = db.query(Person).filter(Person.guid == guid).first()
    if not person:
        raise HTTPException(404, "Person not found")
    person.full_name = full_name
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
    
    # Найти точки, связанные с этим сборщиком
    links = db.query(Link).filter(
        Link.from_guid == guid,
        Link.from_type == "person",
        Link.relation_type == "collected_at"
    ).all()
    point_guids = [link.to_guid for link in links]
    
    if replace_with:
        # Найти нового сборщика
        new_person = db.query(Person).filter(Person.full_name == replace_with).first()
        if not new_person:
            new_person = Person(full_name=replace_with, role="collector", created_at=datetime.now().isoformat(), updated_at=datetime.now().isoformat())
            db.add(new_person)
            db.flush()
        # Обновить связи
        for link in links:
            link.from_guid = new_person.guid
            link.updated_at = datetime.now().isoformat()
    else:
        # Удалить связи
        for link in links:
            db.delete(link)
    
    # Удалить все другие связи (person -> что-то ещё)
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
    return [{"guid": t.guid, "genus": t.genus, "species": t.species} for t in taxa]

@app.post("/taxa")
def create_taxon(genus: str, species: Optional[str] = None):
    db = SessionLocal()
    now = datetime.now().isoformat()
    taxon = Taxon(genus=genus, species=species, created_at=now, updated_at=now)
    db.add(taxon)
    db.commit()
    taxon_guid = taxon.guid
    db.close()
    return {"guid": taxon_guid}

# ========== УНИВЕРСАЛЬНЫЕ ЭНДПОИНТЫ ==========
@app.get("/search")
def search_objects(q: str = "", type: Optional[str] = None, limit: int = 20):
    db = SessionLocal()
    results = []
    if not type or type == "person":
        persons = db.query(Person).filter(Person.full_name.contains(q)).limit(limit).all()
        for p in persons:
            results.append({"type": "person", "guid": p.guid, "name": p.full_name})
    if not type or type == "taxon":
        taxa = db.query(Taxon).filter((Taxon.genus.contains(q)) | (Taxon.species.contains(q))).limit(limit).all()
        for t in taxa:
            results.append({"type": "taxon", "guid": t.guid, "name": f"{t.genus} {t.species or ''}".strip()})
    db.close()
    return results

@app.get("/objects/{type}/{guid}/links")
def get_object_links(type: str, guid: str):
    db = SessionLocal()
    outgoing = db.query(Link).filter(Link.from_guid == guid, Link.from_type == type).all()
    incoming = db.query(Link).filter(Link.to_guid == guid, Link.to_type == type).all()
    def serialize(link, is_outgoing):
        target_type = link.to_type if is_outgoing else link.from_type
        target_guid = link.to_guid if is_outgoing else link.from_guid
        name = None
        if target_type == "person":
            obj = db.query(Person).filter(Person.guid == target_guid).first()
            name = obj.full_name if obj else None
        elif target_type == "taxon":
            obj = db.query(Taxon).filter(Taxon.guid == target_guid).first()
            name = f"{obj.genus} {obj.species or ''}" if obj else None
        return {
            "link_guid": link.link_guid,
            "relation_type": link.relation_type,
            "target_type": target_type,
            "target_guid": target_guid,
            "target_name": name,
            "is_outgoing": is_outgoing
        }
    result = [serialize(link, True) for link in outgoing] + [serialize(link, False) for link in incoming]
    db.close()
    return result

class LinkCreate(BaseModel):
    from_guid: str
    to_guid: str
    from_type: str
    to_type: str
    relation_type: str

@app.post("/links")
def create_link(link: LinkCreate):
    db = SessionLocal()
    now = datetime.now().isoformat()
    new_link = Link(
        link_guid=generate_uuid(),
        from_guid=link.from_guid,
        to_guid=link.to_guid,
        from_type=link.from_type,
        to_type=link.to_type,
        relation_type=link.relation_type,
        direction="many_to_many",
        is_directed=1,
        created_at=now,
        updated_at=now
    )
    db.add(new_link)
    db.commit()
    link_guid = new_link.link_guid
    db.close()
    return {"link_guid": link_guid}

@app.delete("/links/{link_guid}")
def delete_link(link_guid: str):
    db = SessionLocal()
    db.query(Link).filter(Link.link_guid == link_guid).delete()
    db.commit()
    db.close()
    return {"message": "Deleted"}

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

def parse_coordinates(text):
    pattern = r'N(\d{1,2})°(\d{1,2})\'([\d.]+)"\s+E(\d{1,2})°(\d{1,2})\'([\d.]+)"'
    match = re.search(pattern, text)
    if match:
        lat = float(match.group(1)) + float(match.group(2))/60 + float(match.group(3))/3600
        lon = float(match.group(4)) + float(match.group(5))/60 + float(match.group(6))/3600
        return lat, lon
    return None, None

def parse_location(text):
    cleaned = re.sub(r'N\d{1,2}°\d{1,2}\'.*?"\s+E\d{1,2}°\d{1,2}\'.*?"', '', text)
    cleaned = re.sub(r'\d{1,2}\.\w{1,3}\.?\d{4}', '', cleaned)
    cleaned = re.sub(r'leg\..*$', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned[:200] if cleaned else "Unknown"

def parse_line(line):
    lat, lon = parse_coordinates(line)
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
        person = db.query(Person).filter(Person.full_name == collector).first()
        if not person:
            person = Person(full_name=collector, role="collector", created_at=now, updated_at=now)
            db.add(person)
            db.flush()
        
        point = Point(
            location_original=parsed['location_original'],
            date_text=parsed['date'],
            latitude=parsed['latitude'],
            longitude=parsed['longitude'],
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
