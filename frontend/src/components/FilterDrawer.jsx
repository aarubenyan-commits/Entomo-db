import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconLibrary';

const FilterDrawer = ({ 
  filterYear, setFilterYear, 
  filterMonth, setFilterMonth, 
  filterDay, setFilterDay, 
  filterCollector, setFilterCollector,
  persons,
  filterTaxonIds, setFilterTaxonIds,
  taxa,
  points  // добавляем points для фильтрации
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedGenera, setSelectedGenera] = useState([]);
  const [selectedSpecies, setSelectedSpecies] = useState([]);
  const [selectedTaxa, setSelectedTaxa] = useState(filterTaxonIds || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  // Группировка таксонов по родам
  const taxaByGenus = taxa.reduce((acc, taxon) => {
    const genus = taxon.genus;
    if (!acc[genus]) acc[genus] = [];
    acc[genus].push(taxon);
    return acc;
  }, {});

  const uniqueGenera = Object.keys(taxaByGenus).sort();

  // Фильтрация таксонов по поиску
  const filteredTaxa = taxa.filter(taxon => 
    taxon.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    taxon.genus?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    taxon.species?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 5,
        left: rect.left
      });
    }
  }, [isOpen]);

  const handleGenusChange = (genus) => {
    const newSelected = selectedGenera.includes(genus)
      ? selectedGenera.filter(g => g !== genus)
      : [...selectedGenera, genus];
    setSelectedGenera(newSelected);
    
    // Автоматически выбираем все таксоны выбранных родов
    const taxaToAdd = [];
    const taxaToRemove = [];
    
    newSelected.forEach(g => {
      taxaByGenus[g].forEach(t => {
        if (!selectedTaxa.includes(t.guid)) taxaToAdd.push(t.guid);
      });
    });
    
    selectedGenera.forEach(g => {
      if (!newSelected.includes(g)) {
        taxaByGenus[g].forEach(t => {
          if (selectedTaxa.includes(t.guid)) taxaToRemove.push(t.guid);
        });
      }
    });
    
    let newTaxa = [...selectedTaxa];
    taxaToAdd.forEach(id => { if (!newTaxa.includes(id)) newTaxa.push(id); });
    taxaToRemove.forEach(id => { newTaxa = newTaxa.filter(t => t !== id); });
    
    setSelectedTaxa(newTaxa);
    if (setFilterTaxonIds) setFilterTaxonIds(newTaxa);
  };

  const handleSpeciesChange = (speciesName) => {
    const speciesTaxa = taxa.filter(t => t.species === speciesName);
    const allSpeciesGuids = speciesTaxa.map(t => t.guid);
    const isAllSelected = allSpeciesGuids.every(g => selectedTaxa.includes(g));
    
    let newTaxa;
    if (isAllSelected) {
      newTaxa = selectedTaxa.filter(t => !allSpeciesGuids.includes(t));
    } else {
      newTaxa = [...selectedTaxa];
      allSpeciesGuids.forEach(g => {
        if (!newTaxa.includes(g)) newTaxa.push(g);
      });
    }
    
    setSelectedTaxa(newTaxa);
    if (setFilterTaxonIds) setFilterTaxonIds(newTaxa);
  };

  const handleTaxonChange = (taxonGuid) => {
    const newSelected = selectedTaxa.includes(taxonGuid)
      ? selectedTaxa.filter(t => t !== taxonGuid)
      : [...selectedTaxa, taxonGuid];
    setSelectedTaxa(newSelected);
    if (setFilterTaxonIds) setFilterTaxonIds(newSelected);
  };

  const clearAllFilters = () => {
    setFilterYear('');
    setFilterMonth('');
    setFilterDay('');
    setFilterCollector('');
    setSelectedGenera([]);
    setSelectedSpecies([]);
    setSelectedTaxa([]);
    setSearchTerm('');
    if (setFilterTaxonIds) setFilterTaxonIds([]);
  };

  const applyFilters = () => {
    setIsOpen(false);
  };

  const hasActiveFilters = filterYear || filterMonth || filterDay || filterCollector || selectedTaxa.length > 0;

  // Получаем уникальные виды для отображения
  const uniqueSpecies = [...new Set(taxa.map(t => t.species).filter(Boolean))].sort();

  return (
    <>
      <div ref={buttonRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: hasActiveFilters ? '#2ecc71' : '#777b79',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          ⚙️ Фильтры
        </button>
        {hasActiveFilters && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: '#e74c3c',
            color: 'white',
            borderRadius: '50%',
            width: '16px',
            height: '16px',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}>
            !
          </span>
        )}
      </div>

      {isOpen && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '15px',
            width: '400px',
            maxWidth: '90vw',
            zIndex: 10000,
            maxHeight: '80vh',
            overflow: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>🔍 Фильтры</h4>
            <button 
              onClick={() => setIsOpen(false)} 
              style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
            >
              ✖️
            </button>
          </div>

          {/* Фильтры по дате */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>📅 Дата сбора:</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="Год" 
                value={filterYear} 
                onChange={(e) => setFilterYear(e.target.value)}
                style={{ padding: '5px 8px', width: '60px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
              />
              <input 
                type="text" 
                placeholder="Месяц" 
                value={filterMonth} 
                onChange={(e) => setFilterMonth(e.target.value)}
                style={{ padding: '5px 8px', width: '60px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
              />
              <input 
                type="text" 
                placeholder="День" 
                value={filterDay} 
                onChange={(e) => setFilterDay(e.target.value)}
                style={{ padding: '5px 8px', width: '60px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
              />
            </div>
          </div>
          
          {/* Фильтр по сборщику */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>👤 Сборщик:</div>
            <select 
              value={filterCollector} 
              onChange={(e) => setFilterCollector(e.target.value)}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
            >
              <option value="">Все сборщики</option>
              {persons.map(p => (
                <option key={p.guid} value={p.display_name}>{p.display_name}</option>
              ))}
            </select>
          </div>
          
          {/* Фильтр по таксонам с поиском */}
          {taxa && taxa.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>🔬 Таксоны:</div>
              
              {/* Поле поиска */}
              <input
                type="text"
                placeholder="🔍 Поиск таксона..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '6px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
              />
              
              <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #eee', borderRadius: '4px', padding: '8px' }}>
                {searchTerm ? (
                  // Режим поиска - плоский список
                  filteredTaxa.map(taxon => (
                    <label key={taxon.guid} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedTaxa.includes(taxon.guid)}
                        onChange={() => handleTaxonChange(taxon.guid)}
                      />
                      {taxon.display_name || `${taxon.genus} ${taxon.species || ''}`}
                    </label>
                  ))
                ) : (
                  // Режим группировки по родам
                  <>
                    {/* Кнопки для быстрого выбора */}
                    <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          const allTaxaGuids = taxa.map(t => t.guid);
                          setSelectedTaxa(allTaxaGuids);
                          if (setFilterTaxonIds) setFilterTaxonIds(allTaxaGuids);
                          setSelectedGenera(uniqueGenera);
                        }}
                        style={{ fontSize: '10px', padding: '2px 6px', cursor: 'pointer' }}
                      >
                        Выбрать все
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTaxa([]);
                          if (setFilterTaxonIds) setFilterTaxonIds([]);
                          setSelectedGenera([]);
                        }}
                        style={{ fontSize: '10px', padding: '2px 6px', cursor: 'pointer' }}
                      >
                        Снять все
                      </button>
                    </div>
                    
                    {/* Группировка по родам */}
                    {uniqueGenera.map(genus => {
                      const genusTaxa = taxaByGenus[genus];
                      const allGenusSelected = genusTaxa.every(t => selectedTaxa.includes(t.guid));
                      const someGenusSelected = genusTaxa.some(t => selectedTaxa.includes(t.guid));
                      
                      return (
                        <div key={genus} style={{ marginBottom: '10px', borderLeft: '2px solid #ddd', paddingLeft: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '5px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={allGenusSelected}
                              ref={el => {
                                if (el) el.indeterminate = someGenusSelected && !allGenusSelected;
                              }}
                              onChange={() => handleGenusChange(genus)}
                            />
                            <em>{genus}</em>
                          </label>
                          
                          {/* Виды внутри рода */}
                          <div style={{ marginLeft: '20px' }}>
                            {genusTaxa.map(taxon => (
                              <label key={taxon.guid} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '12px', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox" 
                                  checked={selectedTaxa.includes(taxon.guid)}
                                  onChange={() => handleTaxonChange(taxon.guid)}
                                />
                                {taxon.species || taxon.subspecies || taxon.display_name || 'sp.'}
                                {taxon.subspecies && ` subsp. ${taxon.subspecies}`}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Кнопки управления */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
            <button 
              onClick={clearAllFilters}
              style={{ padding: '6px 12px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              🔄 Сбросить все
            </button>
            <button 
              onClick={applyFilters}
              style={{ padding: '6px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              ✓ Применить
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default FilterDrawer;
