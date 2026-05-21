#!/usr/bin/env python3
"""
Скрипт для дедубликации таксонов в базе данных.
Удаляет дубликаты, оставляя один экземпляр на genus + species (без учета подвида).
"""

import sqlite3
import sys

DB_PATH = "entomo.db"

def deduplicate_taxa():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Находим дубликаты по genus + species (без учета подвида)
    cursor.execute("""
        SELECT genus, species, COUNT(*) as cnt, GROUP_CONCAT(guid) as guids
        FROM taxa
        GROUP BY genus, species
        HAVING cnt > 1
    """)
    
    duplicates = cursor.fetchall()
    
    if not duplicates:
        print("✅ Дубликатов не найдено")
        conn.close()
        return
    
    print(f"Найдено {len(duplicates)} групп дубликатов:")
    
    for genus, species, cnt, guids in duplicates:
        guid_list = guids.split(',')
        keep_guid = guid_list[0]  # Оставляем первый
        remove_guids = guid_list[1:]
        
        print(f"\n  {genus} {species or 'sp.'}: {cnt} экземпляров")
        print(f"    Оставляем: {keep_guid}")
        print(f"    Удаляем: {remove_guids}")
        
        # Обновляем связи point_taxa
        for remove_guid in remove_guids:
            cursor.execute("""
                UPDATE links 
                SET from_guid = ? 
                WHERE from_guid = ? AND from_type = 'taxon' AND relation_type = 'has_taxon'
            """, (keep_guid, remove_guid))
            
            # Удаляем старый таксон
            cursor.execute("DELETE FROM taxa WHERE guid = ?", (remove_guid,))
        
        print(f"    Обновлено {cursor.rowcount} связей")
    
    conn.commit()
    conn.close()
    print("\n✅ Дедубликация завершена")

if __name__ == "__main__":
    deduplicate_taxa()
