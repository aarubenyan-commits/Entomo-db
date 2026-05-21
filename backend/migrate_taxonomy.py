import sqlite3
import uuid

conn = sqlite3.connect("entomo.db")
cursor = conn.cursor()

print("1. Создаем новую таблицу taxa (виды)...")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS taxa_new (
        guid TEXT PRIMARY KEY,
        genus TEXT NOT NULL,
        species TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(genus, species)
    )
""")

print("2. Создаем таблицу subspecies...")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS subspecies (
        guid TEXT PRIMARY KEY,
        taxon_guid TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (taxon_guid) REFERENCES taxa_new(guid),
        UNIQUE(taxon_guid, name)
    )
""")

print("3. Переносим существующие таксоны (уникальные genus + species)...")
cursor.execute("""
    INSERT OR IGNORE INTO taxa_new (guid, genus, species, display_name, created_at, updated_at)
    SELECT 
        guid,
        genus,
        species,
        display_name,
        created_at,
        updated_at
    FROM taxa
    WHERE subspecies IS NULL OR subspecies = ''
""")

# Для таксонов с подвидами - создаем вид и подвид отдельно
print("4. Обрабатываем таксоны с подвидами...")
cursor.execute("SELECT guid, genus, species, subspecies, display_name, created_at, updated_at FROM taxa WHERE subspecies IS NOT NULL AND subspecies != ''")
subspecies_taxa = cursor.fetchall()

for old_guid, genus, species, subsp, display_name, created_at, updated_at in subspecies_taxa:
    # Находим или создаем вид
    cursor.execute("SELECT guid FROM taxa_new WHERE genus = ? AND species = ?", (genus, species))
    taxon = cursor.fetchone()
    
    if not taxon:
        taxon_guid = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO taxa_new (guid, genus, species, display_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (taxon_guid, genus, species, f"{genus} {species}", created_at, updated_at))
    else:
        taxon_guid = taxon[0]
    
    # Создаем подвид
    cursor.execute("""
        INSERT OR IGNORE INTO subspecies (guid, taxon_guid, name, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (old_guid, taxon_guid, subsp, display_name, created_at, updated_at))

print("5. Обновляем связи point_taxa...")
# Создаем временную таблицу для перенаправления связей
cursor.execute("ALTER TABLE links ADD COLUMN target_subtype TEXT DEFAULT 'taxon'")

# Обновляем связи для подвидов
cursor.execute("""
    UPDATE links 
    SET target_subtype = 'subspecies'
    WHERE from_type = 'taxon' 
    AND to_type = 'point'
    AND from_guid IN (SELECT guid FROM subspecies)
""")

print("6. Переименовываем старые таблицы...")
cursor.execute("ALTER TABLE taxa RENAME TO taxa_old")
cursor.execute("ALTER TABLE taxa_new RENAME TO taxa")

print("✅ Миграция завершена!")
conn.commit()
conn.close()
