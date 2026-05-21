import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconLibrary';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const FilterDrawer = ({ 
  filterYear, setFilterYear, 
  filterMonth, setFilterMonth, 
  filterDay, setFilterDay, 
  filterCollector, setFilterCollector,
  persons,
  filterTaxonIds, setFilterTaxonIds,
  points
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTaxa, setSelectedTaxa] = useState([]);
  const [allSpecies, setAllSpecies] = useState([]);
  const [allSubspecies, setAllSubspecies] = useState([]);
  const [expandedGenera, setExpandedGenera] = useState({});
  const [expandedSpecies, setExpandedSpecies] = useState({});
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  useEffect(() => {
    loadAllTaxa();
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 5,
        left: rect.left
      });
    }
  }, [isOpen]);

  const loadAllTaxa = async () => {
    try {
      const [speciesRes, subspeciesRes] = await Promise.all([
        axios.get(`${API_URL}/species`),
        axios.get(`${API_URL}/subspecies`)
      ]);
      setAllSpecies(speciesRes.data);
      setAllSubspecies(subspeciesRes.data);
    } catch (error) {
      console.error('Ошибка загрузки таксонов:', error);
    }
  };

  const handleTaxonChange = (taxonGuid, isChecked) => {
    let newSelected;
    if (isChecked) {
      newSelected = [...selectedTaxa, taxonGuid];
    } else {
      newSelected = selectedTaxa.filter(id => id !== taxonGuid);
    }
    setSelectedTaxa(newSelected);
    if (setFilterTaxonIds) setFilterTaxonIds(newSelected);
  };

  const clearAllFilters = () => {
    setFilterYear('');
    setFilterMonth('');
    setFilterDay('');
    setFilterCollector('');
    setSelectedTaxa([]);
    if (setFilterTaxonIds) setFilterTaxonIds([]);
  };

  const toggleGenus = (genus) => {
    setExpandedGenera(prev => ({ ...prev, [genus]: !prev[genus] }));
  };

  const toggleSpecies = (speciesGuid) => {
    setExpandedSpecies(prev => ({ ...prev, [speciesGuid]: !prev[speciesGuid] }));
  };

  const hasActiveFilters = filterYear || filterMonth || filterDay || filterCollector || selectedTaxa.length > 0;

  // Группировка видов по родам
  const speciesByGenus = {};
  for (const s of allSpecies) {
    if (!speciesByGenus[s.genus]) speciesByGenus[s.genus] = [];
    speciesByGenus[s.genus].push(s);
  }

  const isSelected = (guid) => selectedTaxa.includes(guid);

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
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✖️</button>
          </div>

          {/* Фильтры по дате */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>📅 Дата сбора:</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Год" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ padding: '5px 8px', width: '60px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }} />
              <input type="text" placeholder="Месяц" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ padding: '5px 8px', width: '60px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }} />
              <input type="text" placeholder="День" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={{ padding: '5px 8px', width: '60px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }} />
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
          
          {/* Фильтр по таксонам - дерево */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>🔬 Таксоны:</div>
            <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #eee', borderRadius: '4px', padding: '8px' }}>
              {Object.keys(speciesByGenus).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Загрузка...</div>
              ) : (
                Object.keys(speciesByGenus).sort().map(genus => (
                  <div key={genus} style={{ marginBottom: '4px' }}>
                    <div 
                      style={{ padding: '6px 4px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: '#f5f5f5', borderRadius: '4px' }}
                      onClick={() => toggleGenus(genus)}
                    >
                      <span style={{ fontSize: '12px', marginRight: '8px', userSelect: 'none' }}>
                        {expandedGenera[genus] ? '▼' : '▶'}
                      </span>
                      <span style={{ fontWeight: 'bold' }}>{genus}</span>
                    </div>
                    {expandedGenera[genus] && (
                      <div style={{ paddingLeft: '20px', marginTop: '4px' }}>
                        {speciesByGenus[genus].map(species => {
                          const subspeciesList = allSubspecies.filter(ss => ss.species_guid === species.guid);
                          const hasSubspecies = subspeciesList.length > 0;
                          const isSelectedSpecies = isSelected(species.guid);
                          return (
                            <div key={species.guid} style={{ marginBottom: '2px' }}>
                              <div 
                                style={{ padding: '4px 4px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderLeft: '2px solid #ddd' }}
                                onClick={() => hasSubspecies && toggleSpecies(species.guid)}
                              >
                                {hasSubspecies && (
                                  <span style={{ fontSize: '11px', marginRight: '6px', userSelect: 'none' }}>
                                    {expandedSpecies[species.guid] ? '▼' : '▶'}
                                  </span>
                                )}
                                <span style={{ fontStyle: 'italic', flex: 1 }}>{species.species_name}</span>
                                <input
                                  type="checkbox"
                                  checked={isSelectedSpecies}
                                  onChange={(e) => handleTaxonChange(species.guid, e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ marginLeft: '8px' }}
                                />
                              </div>
                              {expandedSpecies[species.guid] && hasSubspecies && (
                                <div style={{ paddingLeft: '20px', borderLeft: '2px solid #ddd', marginLeft: '10px' }}>
                                  {subspeciesList.map(ss => (
                                    <div key={ss.guid} style={{ padding: '4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                      <span style={{ color: '#666' }}>└─ <em>{ss.subspecies_name}</em></span>
                                      <input
                                        type="checkbox"
                                        checked={isSelected(ss.guid)}
                                        onChange={(e) => handleTaxonChange(ss.guid, e.target.checked)}
                                        style={{ marginLeft: '8px' }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Кнопки управления */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
            <button onClick={clearAllFilters} style={{ padding: '6px 12px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
              🔄 Сбросить все
            </button>
            <button onClick={() => setIsOpen(false)} style={{ padding: '6px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
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
