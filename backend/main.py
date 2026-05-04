import uuid
import re
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker

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
    date_text = Column(String, nullable=True)          # человеческий формат "DD.MM.YYYY" или "DD.MM.YYYY – DD.MM.YYYY"
    date_start = Column(String, nullable=True)         # ISO для сортировки
    date_end = Column(String, nullable=True)           # ISO для сортировки
    location_original = Column(Text, nullable=True)
    location_structured = Column(Text, nullable=True)
    google_maps_url = Column(String, nullable=True)
    elevation = Column(Integer, nullable=True)
    location_author_guid = Column(String, ForeignKey("persons.guid"), nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    collector_name = Column(String, nullable=True)

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
    lat_dms = decimal_to_dms(lat)
    lon_dms = decimal_to_dms(lon)
    if lat_dms is None or lon_dms is None:
        return None, None
    return f"{lat_dms}{lat_dir}", f"{lon_dms}{lon_dir}"

def parse_collector(text):
    match = re.search(r'leg\.\s+([A-Z]\.?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', text)
    if match:
        return match.group(1).strip()
    return "Рубенян А."

def parse_date(text):
    match = re.search(r'(\d{1,2}\.\w{1,3}\.?\d{4})', text)
    if match:
        return match.group(1)
    match_range = re.search(r'(\d{1,2}\.\w{1,3})\s*[-–]\s*(\d{1,2}\.\w{1,3}\.?\d{4})', text)
    if match_range:
        return f"{match_range.group(1)} – {match_range.group(2)}"
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
    cleaned = re.sub(r',$', '', cleaned)
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
        collector = db.query(Person).filter(Person.full_name == parsed['collector']).first()
        if not collector:
            collector = Person(full_name=parsed['collector'], role='collector', created_at=now, updated_at=now)
            db.add(collector)
            db.flush()
        point = Point(
            location_original=parsed['location_original'],
            date_text=parsed['date'],
            date_start=None,
            date_end=None,
            latitude=parsed['latitude'],
            longitude=parsed['longitude'],
            collector_name=parsed['collector'],
            geocoding_status='geocoded_from_coordinates' if parsed['latitude'] else 'pending',
            created_at=now,
            updated_at=now
        )
        db.add(point)
        db.flush()
        link = Link(
            from_guid=collector.guid,
            to_guid=point.guid,
            from_type='person',
            to_type='point',
            relation_type='collected_at',
            direction='one_to_many',
            is_directed=1,
            created_at=now,
            updated_at=now
        )
        db.add(link)
        imported.append({
            'location': parsed['location_original'],
            'date': parsed['date'],
            'collector': parsed['collector'],
            'latitude': parsed['latitude'],
            'longitude': parsed['longitude']
        })
    db.commit()
    db.close()
    return {"message": f"Импортировано {len(imported)} записей", "imported": imported}

@app.get("/points")
def get_points():
    db = SessionLocal()
    points = db.query(Point).all()
    result = []
    for p in points:
        lat_dms, lon_dms = format_coordinates(p.latitude, p.longitude)
        result.append({
            "guid": p.guid,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "latitude_dms": lat_dms,
            "longitude_dms": lon_dms,
            "location_original": p.location_original,
            "date_text": p.date_text,
            "display_date": p.date_text,   # теперь просто берём из date_text
            "collector_name": p.collector_name,
            "date_start": p.date_start,
            "date_end": p.date_end,
        })
    db.close()
    return result

@app.get("/persons")
def get_persons():
    db = SessionLocal()
    persons = db.query(Person).all()
    db.close()
    return [{"guid": p.guid, "full_name": p.full_name} for p in persons]

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
    
    collector = db.query(Person).filter(Person.full_name == point.collector_name).first()
    if not collector:
        collector = Person(full_name=point.collector_name, role="collector", created_at=now, updated_at=now)
        db.add(collector)
        db.flush()
    
    # Формируем человеческую дату для date_text, если она не передана явно
    date_text = point.date_text
    if not date_text:
        if point.date_start and point.date_end:
            # Диапазон
            start = datetime.fromisoformat(point.date_start).strftime("%d.%m.%Y")
            end = datetime.fromisoformat(point.date_end).strftime("%d.%m.%Y")
            date_text = f"{start} – {end}"
        elif point.date_start:
            date_text = datetime.fromisoformat(point.date_start).strftime("%d.%m.%Y")
    
    db_point = Point(
        latitude=point.latitude,
        longitude=point.longitude,
        location_original=point.location_original,
        location_structured=point.location_structured,
        google_maps_url=point.google_maps_url,
        date_start=point.date_start,
        date_end=point.date_end,
        date_text=date_text,
        collector_name=point.collector_name,
        created_at=now,
        updated_at=now
    )
    db.add(db_point)
    db.flush()
    
    link = Link(
        from_guid=collector.guid,
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
    db_point = db.query(Point).filter(Point.guid == guid).first()
    if not db_point:
        raise HTTPException(404, "Point not found")
    
    # Формируем человеческую дату, если нужно
    date_text = point.date_text
    if not date_text:
        if point.date_start and point.date_end:
            start = datetime.fromisoformat(point.date_start).strftime("%d.%m.%Y")
            end = datetime.fromisoformat(point.date_end).strftime("%d.%m.%Y")
            date_text = f"{start} – {end}"
        elif point.date_start:
            date_text = datetime.fromisoformat(point.date_start).strftime("%d.%m.%Y")
    
    db_point.latitude = point.latitude
    db_point.longitude = point.longitude
    db_point.location_original = point.location_original
    db_point.location_structured = point.location_structured
    db_point.google_maps_url = point.google_maps_url
    db_point.date_start = point.date_start
    db_point.date_end = point.date_end
    db_point.date_text = date_text
    db_point.collector_name = point.collector_name
    db_point.updated_at = datetime.now().isoformat()
    db.commit()
    db.close()
    return {"message": "Updated"}

@app.delete("/points/{guid}")
def delete_point(guid: str):
    db = SessionLocal()
    db_point = db.query(Point).filter(Point.guid == guid).first()
    if not db_point:
        raise HTTPException(404, "Point not found")
    db.query(Link).filter(Link.to_guid == guid).delete()
    db.delete(db_point)
    db.commit()
    db.close()
    return {"message": "Deleted"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
