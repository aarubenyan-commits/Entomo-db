import sqlite3

conn = sqlite3.connect("entomo.db")
cursor = conn.cursor()

# Находим дубликаты по genus + species
cursor.execute("""
    SELECT genus, species, COUNT(*), GROUP_CONCAT(guid) 
    FROM taxa 
    GROUP BY genus, species 
    HAVING COUNT(*) > 1
""")

duplicates = cursor.fetchall()

if not duplicates:
    print("✅ Дубликатов не найдено")
else:
    print(f"Найдено {len(duplicates)} групп дубликатов:")
    for genus, species, count, guids in duplicates:
        guid_list = guids.split(',')
        keep = guid_list[0]
        remove = guid_list[1:]
        print(f"\n  {genus} {species or 'sp.'}: {count} экз. -> оставляем {keep}, удаляем {remove}")
        
        for rem in remove:
            # Обновляем связи
            cursor.execute("UPDATE links SET from_guid = ? WHERE from_guid = ? AND from_type = 'taxon'", (keep, rem))
            # Удаляем таксон
            cursor.execute("DELETE FROM taxa WHERE guid = ?", (rem,))
        print(f"    Обновлено {cursor.rowcount} связей")

conn.commit()
conn.close()
print("\n✅ Дедубликация завершена")
