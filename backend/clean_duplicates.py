import sqlite3

conn = sqlite3.connect("entomo.db")
cursor = conn.cursor()

# Находим дубликаты
cursor.execute("""
    SELECT LOWER(genus), LOWER(COALESCE(species, '')), COUNT(*), GROUP_CONCAT(guid)
    FROM taxa 
    GROUP BY LOWER(genus), LOWER(COALESCE(species, ''))
    HAVING COUNT(*) > 1
""")

duplicates = cursor.fetchall()

if not duplicates:
    print("✅ Дубликатов не найдено")
else:
    for genus, species, count, guids in duplicates:
        guid_list = guids.split(',')
        keep = guid_list[0]
        remove = guid_list[1:]
        print(f"\n{genus} {species if species else 'sp.'}: {count} экз. -> оставляем {keep}")
        
        for rem in remove:
            # Перенаправляем связи
            cursor.execute("UPDATE links SET from_guid = ? WHERE from_guid = ? AND from_type = 'taxon'", (keep, rem))
            cursor.execute("UPDATE links SET to_guid = ? WHERE to_guid = ? AND to_type = 'taxon'", (keep, rem))
            # Удаляем дубликат
            cursor.execute("DELETE FROM taxa WHERE guid = ?", (rem,))
            print(f"    Удален {rem}")
        
        conn.commit()

# Выводим итоговый список таксонов
print("\n📋 Текущий список таксонов:")
cursor.execute("SELECT genus, species, subspecies FROM taxa ORDER BY genus, species")
for row in cursor.fetchall():
    print(f"  {row[0]} {row[1] or ''} {row[2] or ''}".strip())

conn.close()
