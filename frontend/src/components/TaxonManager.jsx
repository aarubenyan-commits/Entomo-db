import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { IconButton } from './IconLibrary';

const API_URL = 'http://127.0.0.1:8000';

const TaxonManager = ({ onClose, onUpdate }) => {
  const [allSpecies, setAllSpecies] = useState([]);
  const [allSubspecies, setAllSubspecies] = useState([]);
  const [expandedGenera, setExpandedGenera] = useState({});
  const [expandedSpecies, setExpandedSpecies] = useState({});
  const [showAddGenus, setShowAddGenus] = useState(false);
  const [showAddSpecies, setShowAddSpecies] = useState(null);
  const [newGenusName, setNewGenusName] = useState('');
  const [newSpeciesName, setNewSpeciesName] = useState('');
  const [showAddSubspecies, setShowAddSubspecies] = useState(null);
  const [newSubspeciesName, setNewSubspeciesName] = useState('');
  const [editingSpecies, setEditingSpecies] = useState(null);
  const [editingSubspecies, setEditingSubspecies] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [speciesRes, subspeciesRes] = await Promise.all([
        axios.get(`${API_URL}/species`),
        axios.get(`${API_URL}/subspecies`)
      ]);
      setAllSpecies(speciesRes.data);
      setAllSubspecies(subspeciesRes.data);
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    }
  };

  const handleAddGenus = async () => {
    if (!newGenusName.trim()) {
      alert('Укажите название рода');
      return;
    }
    try {
      await axios.post(`${API_URL}/species`, null, {
        params: {
          genus: newGenusName,
          species_name: "sp.",
          display_name: newGenusName
        }
      });
      setNewGenusName('');
      setShowAddGenus(false);
      fetchData();
    } catch (error) {
      alert('Ошибка создания рода');
    }
  };

  const handleAddSpecies = async (genus) => {
    if (!newSpeciesName.trim()) {
      alert('Укажите название вида');
      return;
    }
    try {
      await axios.post(`${API_URL}/species`, null, {
        params: {
          genus: genus,
          species_name: newSpeciesName,
          display_name: `${genus} ${newSpeciesName}`
        }
      });
      setNewSpeciesName('');
      setShowAddSpecies(null);
      fetchData();
      setExpandedGenera(prev => ({ ...prev, [genus]: true }));
    } catch (error) {
      alert('Ошибка создания вида');
    }
  };

  const handleAddSubspecies = async (speciesGuid) => {
    if (!newSubspeciesName.trim()) {
      alert('Укажите название подвида');
      return;
    }
    try {
      await axios.post(`${API_URL}/subspecies`, null, {
        params: {
          species_guid: speciesGuid,
          subspecies_name: newSubspeciesName
        }
      });
      setNewSubspeciesName('');
      setShowAddSubspecies(null);
      fetchData();
    } catch (error) {
      alert('Ошибка добавления подвида');
    }
  };

  const handleDelete = async (guid, type) => {
    if (window.confirm(`Удалить ${type === 'species' ? 'вид' : 'подвид'}?`)) {
      try {
        if (type === 'species') {
          await axios.delete(`${API_URL}/species/${guid}`);
        } else {
          await axios.delete(`${API_URL}/subspecies/${guid}`);
        }
        fetchData();
        if (onUpdate) onUpdate();
      } catch (error) {
        alert('Ошибка удаления');
      }
    }
  };

  const handleEditSpecies = (species) => {
    setEditingSpecies(species.guid);
    setEditName(species.species_name);
  };

  const handleEditSubspecies = (subspecies) => {
    setEditingSubspecies(subspecies.guid);
    setEditName(subspecies.subspecies_name);
  };

  const handleSaveEdit = async (guid, type, currentGenus = null) => {
    if (!editName.trim()) {
      alert('Название не может быть пустым');
      return;
    }
    try {
      if (type === 'species') {
        const species = allSpecies.find(s => s.guid === guid);
        await axios.put(`${API_URL}/taxa/${guid}`, {
          genus: species.genus,
          species: editName,
          display_name: `${species.genus} ${editName}`
        });
      } else {
        await axios.put(`${API_URL}/subspecies/${guid}`, {
          subspecies_name: editName
        });
      }
      fetchData();
      setEditingSpecies(null);
      setEditingSubspecies(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      alert('Ошибка сохранения');
    }
  };

  const toggleGenus = (genus) => {
    setExpandedGenera(prev => ({ ...prev, [genus]: !prev[genus] }));
  };

  const toggleSpecies = (speciesGuid) => {
    setExpandedSpecies(prev => ({ ...prev, [speciesGuid]: !prev[speciesGuid] }));
  };

  const speciesByGenus = {};
  for (const s of allSpecies) {
    if (!speciesByGenus[s.genus]) speciesByGenus[s.genus] = [];
    speciesByGenus[s.genus].push(s);
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1500,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '700px',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Управление таксонами</h2>
          <IconButton icon="Close" onClick={() => { onClose(); }} style={{ padding: '4px', fontSize: '18px' }} />
        </div>

        <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
          {!showAddGenus ? (
            <div style={{ marginBottom: '15px', padding: '4px', display: 'flex', justifyContent: 'flex-start' }}>
              <span onClick={() => setShowAddGenus(true)} style={{ cursor: 'pointer', color: '#27ae60', fontSize: '14px', fontWeight: 'bold' }}>➕ Создать род</span>
            </div>
          ) : (
            <div style={{ marginBottom: '15px', padding: '8px', background: '#f9f9f9', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="text" placeholder="Название рода" value={newGenusName} onChange={(e) => setNewGenusName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddGenus()} style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} autoFocus />
              <IconButton icon="Save" onClick={handleAddGenus} style={{ background: '#27ae60', color: 'white', padding: '4px 8px' }} />
              <IconButton icon="Close" onClick={() => setShowAddGenus(false)} style={{ background: '#95a5a6', color: 'white', padding: '4px 8px' }} />
            </div>
          )}

          {Object.keys(speciesByGenus).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Нет таксонов</div>
          ) : (
            Object.keys(speciesByGenus).sort().map(genus => (
              <div key={genus} style={{ marginBottom: '8px' }}>
                <div style={{ padding: '6px 4px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: '#f5f5f5', borderRadius: '4px', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }} onClick={() => toggleGenus(genus)}>
                    <span style={{ fontSize: '12px', marginRight: '8px', userSelect: 'none' }}>{expandedGenera[genus] ? '▼' : '▶'}</span>
                    <span style={{ fontWeight: 'bold' }}>{genus}</span>
                  </div>
                  <span onClick={() => { setShowAddSpecies(genus); setNewSpeciesName(''); }} style={{ cursor: 'pointer', color: '#27ae60', fontSize: '12px', padding: '2px 6px' }}>✚ добавить вид</span>
                </div>
                
                {expandedGenera[genus] && (
                  <div style={{ paddingLeft: '20px', marginTop: '4px' }}>
                    {showAddSpecies === genus && (
                      <div style={{ marginBottom: '8px', padding: '8px', background: '#f9f9f9', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="text" placeholder="Название вида" value={newSpeciesName} onChange={(e) => setNewSpeciesName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddSpecies(genus)} style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} autoFocus />
                        <IconButton icon="Save" onClick={() => handleAddSpecies(genus)} style={{ background: '#27ae60', color: 'white', padding: '4px 8px' }} />
                        <IconButton icon="Close" onClick={() => setShowAddSpecies(null)} style={{ background: '#95a5a6', color: 'white', padding: '4px 8px' }} />
                      </div>
                    )}
                    
                    {speciesByGenus[genus].map(species => {
                      const subspeciesList = allSubspecies.filter(ss => ss.species_guid === species.guid);
                      const hasSubspecies = subspeciesList.length > 0;
                      const isAddingSubspecies = showAddSubspecies === species.guid;
                      return (
                        <div key={species.guid} style={{ marginBottom: '4px' }}>
                          <div style={{ padding: '4px 4px', display: 'flex', alignItems: 'center', borderLeft: '2px solid #ddd', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => hasSubspecies && toggleSpecies(species.guid)}>
                              {hasSubspecies && <span style={{ fontSize: '11px', marginRight: '6px', userSelect: 'none' }}>{expandedSpecies[species.guid] ? '▼' : '▶'}</span>}
                              {editingSpecies === species.guid ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit(species.guid, 'species')} autoFocus style={{ fontSize: '12px', padding: '2px 4px', width: '120px' }} />
                              ) : (
                                <span style={{ fontStyle: 'italic', cursor: 'pointer' }} onDoubleClick={() => handleEditSpecies(species)} title="Двойной клик для редактирования">{species.species_name}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <span onClick={() => { setShowAddSubspecies(species.guid); setNewSubspeciesName(''); }} style={{ cursor: 'pointer', color: '#27ae60', fontSize: '11px' }}>✚ подвид</span>
                              <IconButton icon="Delete" onClick={() => handleDelete(species.guid, 'species')} style={{ color: '#e74c3c', padding: '2px' }} />
                            </div>
                          </div>
                          
                          {expandedSpecies[species.guid] && hasSubspecies && (
                            <div style={{ paddingLeft: '20px', borderLeft: '2px solid #ddd', marginLeft: '10px' }}>
                              {subspeciesList.map(ss => (
                                <div key={ss.guid} style={{ padding: '4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                  {editingSubspecies === ss.guid ? (
                                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit(ss.guid, 'subspecies')} autoFocus style={{ fontSize: '11px', padding: '2px 4px', width: '100px' }} />
                                  ) : (
                                    <span style={{ color: '#666', cursor: 'pointer' }} onDoubleClick={() => handleEditSubspecies(ss)} title="Двойной клик для редактирования">└─ <em>{ss.subspecies_name}</em></span>
                                  )}
                                  <IconButton icon="Delete" onClick={() => handleDelete(ss.guid, 'subspecies')} style={{ color: '#e74c3c', padding: '2px' }} />
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {isAddingSubspecies && (
                            <div style={{ marginTop: '8px', marginBottom: '8px', padding: '8px', background: '#f9f9f9', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '20px' }}>
                              <input type="text" placeholder="Название подвида" value={newSubspeciesName} onChange={(e) => setNewSubspeciesName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddSubspecies(species.guid)} style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }} autoFocus />
                              <IconButton icon="Save" onClick={() => handleAddSubspecies(species.guid)} style={{ background: '#27ae60', color: 'white', padding: '4px 8px' }} />
                              <IconButton icon="Close" onClick={() => setShowAddSubspecies(null)} style={{ background: '#95a5a6', color: 'white', padding: '4px 8px' }} />
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
        
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <IconButton icon="Close" label="Закрыть" onClick={() => { if (onUpdate) onUpdate(); onClose(); }} style={{ background: '#3498db', color: 'white' }} />
        </div>
      </div>
    </div>
  );
};

export default TaxonManager;
