import sqlite3
import uuid
from datetime import datetime

conn = sqlite3.connect("entomo.db")
cursor = conn.cursor()

now = datetime.now().isoformat()

# 1. Таблица видов (уникальность genus + species_name)
cursor.execute("""
    CREATE TABLE species (
        guid TEXT PRIMARY KEY,
        genus TEXT NOT NULL,
        species_name TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(genus, species_name)
    )
""")

# 2. Таблица подвидов
cursor.execute("""
    CREATE TABLE subspecies (
        guid TEXT PRIMARY KEY,
        species_guid TEXT NOT NULL,
        subspecies_name TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (species_guid) REFERENCES species(guid),
        UNIQUE(species_guid, subspecies_name)
    )
""")

# 3. Таблица точек
cursor.execute("""
    CREATE TABLE points (
        guid TEXT PRIMARY KEY,
        latitude REAL,
        longitude REAL,
        latitude_dms TEXT,
        longitude_dms TEXT,
        location_original TEXT,
        date_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
""")

# 4. Таблица сборщиков
cursor.execute("""
    CREATE TABLE persons (
        guid TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
""")

# 5. Таблица исследований
cursor.execute("""
    CREATE TABLE studies (
        guid TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        description TEXT,
        authors TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
""")

# 6. Таблица связей (универсальная)
cursor.execute("""
    CREATE TABLE links (
        link_guid TEXT PRIMARY KEY,
        from_guid TEXT NOT NULL,
        to_guid TEXT NOT NULL,
        from_type TEXT NOT NULL,
        to_type TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        direction TEXT NOT NULL,
        is_directed INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
""")

print("✅ Новая структура БД создана")
print("  - species (виды)")
print("  - subspecies (подвиды)")
print("  - points (точки)")
print("  - persons (сборщики)")
print("  - studies (исследования)")
print("  - links (связи)")

conn.commit()
conn.close()
