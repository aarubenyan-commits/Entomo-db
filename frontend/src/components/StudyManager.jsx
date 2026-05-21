import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import MapView from './MapView';
import PointForm from './PointForm';
import TaxonManager from './TaxonManager';

const API_URL = 'http://127.0.0.1:8000';

const StudyManager = ({ onClose, onUpdate }) => {
  const [studies, setStudies] = useState([]);
  const [filteredStudies, setFilteredStudies] = useState([]);
  const [editingGuid, setEditingGuid] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [showLinkManager, setShowLinkManager] = useState(false);
  const [linkedPoints, setLinkedPoints] = useState([]);
  const [linkedSpecies, setLinkedSpecies] = useState([]);
  const [linkedSubspecies, setLinkedSubspecies] = useState([]);
  const [allSpecies, setAllSpecies] = useState([]);
  const [allSubspecies, setAllSubspecies] = useState([]);
  const [expandedGenera, setExpandedGenera] = useState({});
  const [expandedSpecies, setExpandedSpecies] = useState({});
  const [searchTaxon, setSearchTaxon] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [expandedSearchGenera, setExpandedSearchGenera] = useState({});
  const [expandedSearchSpecies, setExpandedSearchSpecies] = useState({});
  const [pointSearch, setPointSearch] = useState('');
  const [pointResults, setPointResults] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    description: '',
    authors: ''
  });
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showPointForm, setShowPointForm] = useState(false);
  const [showTaxonManager, setShowTaxonManager] = useState(false);
  const [newPointCoords, setNewPointCoords] = useState({ lat: null, lng: null });
  const [allPoints, setAllPoints] = useState([]);
  const [activeTab, setActiveTab] = useState('taxa');

  useEffect(() => {
    fetchStudies();
    loadAllPoints();
    loadAllTaxa();
  }, []);

  useEffect(() => {
    filterStudies();
  }, [searchTerm, studies]);

  const fetchStudies = async () => {
    try {
      const res = await axios.get(`${API_URL}/studies`);
      setStudies(res.data);
      setFilteredStudies(res.data);
    } catch (error) {
      console.error('Ошибка загрузки исследований:', error);
    }
  };

  const loadAllPoints = async () => {
    try {
      const res = await axios.get(`${API_URL}/points`);
      setAllPoints(res.data);
    } catch (error) {
      console.error('Ошибка загрузки точек:', error);
    }
  };

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

  const filterStudies = () => {
    if (!searchTerm.trim()) {
      setFilteredStudies(studies);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = studies.filter(s => 
        (s.title && s.title.toLowerCase().includes(term)) ||
        (s.authors && s.authors.toLowerCase().includes(term))
      );
      setFilteredStudies(filtered);
    }
  };

  const fetchLinkedObjects = async (studyGuid) => {
    try {
      const linksRes = await axios.get(`${API_URL}/objects/study/${studyGuid}/links`);
      
      const points = [];
      const species = [];
      const subspecies = [];
      
      for (const link of linksRes.data) {
        if (link.direction === 'incoming' && link.relation_type === 'source') {
          const objGuid = link.target_guid;
          const objType = link.target_type;
          
          if (objType === 'point') {
            try {
              const pointRes = await axios.get(`${API_URL}/points/${objGuid}`);
              points.push({ link_guid: link.link_guid, ...pointRes.data });
            } catch (error) {}
          } else if (objType === 'species') {
            try {
              const speciesRes = await axios.get(`${API_URL}/species/${objGuid}`);
              if (speciesRes.data) species.push({ link_guid: link.link_guid, ...speciesRes.data });
            } catch (error) {}
          } else if (objType === 'subspecies') {
            try {
              const ssRes = await axios.get(`${API_URL}/subspecies/${objGuid}`);
              if (ssRes.data) {
                const parent = allSpecies.find(s => s.guid === ssRes.data.species_guid);
                subspecies.push({ link_guid: link.link_guid, ...ssRes.data, parent_species: parent });
              }
            } catch (error) {}
          }
        }
      }
      
      setLinkedPoints(points);
      setLinkedSpecies(species);
      setLinkedSubspecies(subspecies);
    } catch (error) {
      console.error('Ошибка загрузки связей:', error);
    }
  };

  const openLinkManager = async (study) => {
    setSelectedStudy(study);
    await fetchLinkedObjects(study.guid);
    setShowLinkManager(true);
  };

  const addLink = async (objectGuid, objectType, objectName) => {
    if (!selectedStudy) return;
    try {
      await axios.post(`${API_URL}/source/${objectType}/${objectGuid}/${selectedStudy.guid}`);
      await fetchLinkedObjects(selectedStudy.guid);
      setSearchResults([]);
      setSearchTaxon('');
    } catch (error) {
      alert('Ошибка привязки: ' + (error.response?.data?.detail || error.message));
    }
  };

  const removeLink = async (linkGuid, objectName) => {
    if (window.confirm(`Удалить связь с "${objectName}"?`)) {
      try {
        await axios.delete(`${API_URL}/source/${linkGuid}`);
        await fetchLinkedObjects(selectedStudy.guid);
      } catch (error) {
        alert('Ошибка удаления связи');
      }
    }
  };

  const searchTaxa = () => {
    if (!searchTaxon.trim()) {
      setSearchResults([]);
      return;
    }
    
    const term = searchTaxon.toLowerCase();
    const genusMap = new Map();
    
    for (const species of allSpecies) {
      const speciesName = `${species.genus} ${species.species_name}`;
      const matches = speciesName.toLowerCase().includes(term);
      const subspeciesList = allSubspecies.filter(ss => ss.species_guid === species.guid);
      const matchingSubspecies = subspeciesList.filter(ss => ss.subspecies_name.toLowerCase().includes(term));
      
      if (matches || matchingSubspecies.length > 0) {
        if (!genusMap.has(species.genus)) {
          genusMap.set(species.genus, { genus: species.genus, species: [] });
        }
        genusMap.get(species.genus).species.push({
          guid: species.guid,
          name: speciesName,
          species_name: species.species_name,
          subspecies: matchingSubspecies.length > 0 ? matchingSubspecies : (matches ? subspeciesList : []),
          matches: matches
        });
      }
    }
    
    setSearchResults(Array.from(genusMap.values()));
  };

  const searchPoints = () => {
    if (!pointSearch.trim()) {
      setPointResults([]);
      return;
    }
    const term = pointSearch.toLowerCase();
    const results = allPoints.filter(p => 
      p.location_original && p.location_original.toLowerCase().includes(term)
    );
    setPointResults(results.slice(0, 15));
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchTaxa();
    }
  };

  const handlePointKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchPoints();
    }
  };

  const toggleGenus = (genus) => {
    setExpandedGenera(prev => ({ ...prev, [genus]: !prev[genus] }));
  };

  const toggleSpecies = (speciesGuid) => {
    setExpandedSpecies(prev => ({ ...prev, [speciesGuid]: !prev[speciesGuid] }));
  };

  const toggleSearchGenus = (genus) => {
    setExpandedSearchGenera(prev => ({ ...prev, [genus]: !prev[genus] }));
  };

  const toggleSearchSpecies = (speciesGuid) => {
    setExpandedSearchSpecies(prev => ({ ...prev, [speciesGuid]: !prev[speciesGuid] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title && !formData.url) {
      alert('Укажите название или ссылку');
      return;
    }
    try {
      if (editingGuid) {
        await axios.put(`${API_URL}/studies/${editingGuid}`, formData);
      } else {
        await axios.post(`${API_URL}/studies`, formData);
      }
      fetchStudies();
      if (onUpdate) onUpdate();
      resetForm();
    } catch (error) {
      alert('Ошибка сохранения исследования');
    }
  };

  const handleEdit = (study) => {
    setEditingGuid(study.guid);
    setFormData({
      title: study.title || '',
      url: study.url || '',
      description: study.description || '',
      authors: study.authors || ''
    });
  };

  const handleDelete = async (guid) => {
    if (window.confirm('Удалить это исследование?')) {
      try {
        await axios.delete(`${API_URL}/studies/${guid}`);
        fetchStudies();
        if (onUpdate) onUpdate();
        if (selectedStudy?.guid === guid) setShowLinkManager(false);
        if (editingGuid === guid) resetForm();
      } catch (error) {
        alert('Ошибка удаления исследования');
      }
    }
  };

  const resetForm = () => {
    setEditingGuid(null);
    setFormData({ title: '', url: '', description: '', authors: '' });
  };

  const handlePointCreated = async (success, newPointGuid) => {
    setShowPointForm(false);
    if (success && newPointGuid && selectedStudy) {
      try {
        await axios.post(`${API_URL}/source/point/${newPointGuid}/${selectedStudy.guid}`);
        await loadAllPoints();
        await fetchLinkedObjects(selectedStudy.guid);
        alert('Точка создана и привязана');
      } catch (error) {}
    }
    setShowMapSelector(true);
  };

  const handleTaxonCreated = async (success) => {
    setShowTaxonManager(false);
    if (success) {
      await loadAllTaxa();
      alert('Таксон создан');
    }
  };

  // Группировка привязанных видов по родам
  const linkedByGenus = {};
  for (const s of linkedSpecies) {
    if (!linkedByGenus[s.genus]) linkedByGenus[s.genus] = [];
    linkedByGenus[s.genus].push(s);
  }

  // Группировка привязанных подвидов по видам
  const linkedSubspeciesBySpecies = {};
  for (const ss of linkedSubspecies) {
    const speciesGuid = ss.parent_species?.guid;
    if (speciesGuid) {
      if (!linkedSubspeciesBySpecies[speciesGuid]) linkedSubspeciesBySpecies[speciesGuid] = [];
      linkedSubspeciesBySpecies[speciesGuid].push(ss);
    }
  }

  return (
    <>
      {/* Главное окно */}
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
        zIndex: 1000,
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          width: '900px',
          maxWidth: '90vw',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
            <h2 style={{ margin: 0 }}>Управление исследованиями</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖️</button>
          </div>
          
          <form onSubmit={handleSubmit} style={{ marginBottom: '15px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Название" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} style={{ flex: 2, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <input type="text" placeholder="Автор(ы)" value={formData.authors} onChange={(e) => setFormData({...formData, authors: e.target.value})} style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
            <input type="url" placeholder="Ссылка (URL)" value={formData.url} onChange={(e) => setFormData({...formData, url: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
            <textarea placeholder="Описание" rows="2" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="button" onClick={resetForm} style={{ padding: '6px 12px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Очистить</button>
              <button type="submit" style={{ padding: '6px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{editingGuid ? 'Обновить' : 'Создать'}</button>
            </div>
          </form>

          <input type="text" placeholder="Поиск исследований..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px', flexShrink: 0 }} />

          <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5' }}>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Название</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Автор(ы)</th>
                  <th style={{ padding: '10px', textAlign: 'center', width: '100px' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudies.map(s => (
                  <tr key={s.guid} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>
                      <strong>{s.title || '—'}</strong>
                      {s.url && <div style={{ fontSize: '11px', color: '#666' }}>{s.url}</div>}
                      {s.description && <div style={{ fontSize: '11px', color: '#888' }}>{s.description}</div>}
                    </td>
                    <td style={{ padding: '10px' }}>{s.authors || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openLinkManager(s)} style={{ marginRight: '8px', padding: '4px 8px', cursor: 'pointer', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px' }}>Связи</button>
                      <button onClick={() => handleEdit(s)} style={{ marginRight: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✏️</button>
                      <button onClick={() => handleDelete(s.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Панель управления связями */}
      {showLinkManager && selectedStudy && (
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
          zIndex: 1100,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '700px',
            maxWidth: '90vw',
            maxHeight: '85vh',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Связи исследования</h3>
              <button onClick={() => setShowLinkManager(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖️</button>
            </div>
            
            <div style={{ padding: '10px', background: '#f0f0f0', borderRadius: '6px', marginBottom: '15px' }}>
              <strong>{selectedStudy.title || selectedStudy.url}</strong>
            </div>

            {/* Вкладки */}
            <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '15px' }}>
              <button onClick={() => setActiveTab('taxa')} style={{ padding: '8px 16px', background: activeTab === 'taxa' ? '#27ae60' : 'transparent', color: activeTab === 'taxa' ? 'white' : '#333', border: 'none', cursor: 'pointer', borderRadius: '4px 4px 0 0' }}>Таксоны</button>
              <button onClick={() => setActiveTab('points')} style={{ padding: '8px 16px', background: activeTab === 'points' ? '#27ae60' : 'transparent', color: activeTab === 'points' ? 'white' : '#333', border: 'none', cursor: 'pointer', borderRadius: '4px 4px 0 0' }}>Точки</button>
            </div>

            {/* Вкладка Таксонов */}
            {activeTab === 'taxa' && (
              <>
                {/* Поиск для привязки */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '5px' }}>Привязать новый таксон:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Введите название вида для поиска..."
                      value={searchTaxon}
                      onChange={(e) => setSearchTaxon(e.target.value)}
                      onKeyPress={handleSearchKeyPress}
                      style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <button onClick={searchTaxa} style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Найти</button>
                    <button onClick={() => setShowTaxonManager(true)} style={{ padding: '8px 16px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Создать вид</button>
                  </div>
                  
                  {/* Результаты поиска таксонов - раскрывающееся дерево */}
                  {searchResults.length > 0 && (
                    <div style={{ marginTop: '10px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '250px', overflow: 'auto' }}>
                      {searchResults.map(genusItem => (
                        <div key={genusItem.genus} style={{ borderBottom: '1px solid #eee' }}>
                          <div 
                            style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: '#f9f9f9' }}
                            onClick={() => toggleSearchGenus(genusItem.genus)}
                          >
                            <span style={{ fontSize: '14px', marginRight: '8px', userSelect: 'none' }}>
                              {expandedSearchGenera[genusItem.genus] ? '▼' : '▶'}
                            </span>
                            <span style={{ fontWeight: 'bold' }}>{genusItem.genus}</span>
                          </div>
                          {expandedSearchGenera[genusItem.genus] && (
                            <div style={{ paddingLeft: '25px' }}>
                              {genusItem.species.map(species => {
                                const hasSubspecies = species.subspecies && species.subspecies.length > 0;
                                return (
                                  <div key={species.guid}>
                                    <div 
                                      style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderLeft: '2px solid #ddd' }}
                                      onClick={() => hasSubspecies && toggleSearchSpecies(species.guid)}
                                    >
                                      {hasSubspecies && (
                                        <span style={{ fontSize: '12px', marginRight: '8px', userSelect: 'none' }}>
                                          {expandedSearchSpecies[species.guid] ? '▼' : '▶'}
                                        </span>
                                      )}
                                      <span style={{ fontStyle: 'italic', flex: 1 }}>{species.species_name}</span>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); addLink(species.guid, 'species', species.name); }}
                                        style={{ padding: '2px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                      >
                                        Привязать вид
                                      </button>
                                    </div>
                                    {expandedSearchSpecies[species.guid] && species.subspecies.length > 0 && (
                                      <div style={{ paddingLeft: '25px', borderLeft: '2px solid #ddd', marginLeft: '15px' }}>
                                        {species.subspecies.map(ss => (
                                          <div key={ss.guid} style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                            <span style={{ color: '#666' }}>└─ <em>{ss.subspecies_name}</em></span>
                                            <button onClick={() => addLink(ss.guid, 'subspecies', `${species.name} ${ss.subspecies_name}`)} style={{ padding: '2px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Привязать подвид</button>
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
                      ))}
                    </div>
                  )}
                </div>

                {/* Привязанные таксоны - раскрывающееся дерево */}
                <div>
                  <h4 style={{ margin: '0 0 10px 0' }}>Привязанные таксоны:</h4>
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', maxHeight: '350px', overflow: 'auto', padding: '10px' }}>
                    {Object.keys(linkedByGenus).length === 0 && linkedSubspecies.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Нет привязанных таксонов</div>
                    ) : (
                      Object.keys(linkedByGenus).sort().map(genus => (
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
                              {linkedByGenus[genus].map(species => {
                                const hasSubspecies = linkedSubspeciesBySpecies[species.guid] && linkedSubspeciesBySpecies[species.guid].length > 0;
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
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); removeLink(species.link_guid, `${species.genus} ${species.species_name}`); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '14px' }}
                                      >
                                        ✖
                                      </button>
                                    </div>
                                    {expandedSpecies[species.guid] && hasSubspecies && (
                                      <div style={{ paddingLeft: '20px', borderLeft: '2px solid #ddd', marginLeft: '10px' }}>
                                        {linkedSubspeciesBySpecies[species.guid].map(ss => (
                                          <div key={ss.guid} style={{ padding: '4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                            <span style={{ color: '#666' }}>└─ <em>{ss.subspecies_name}</em></span>
                                            <button onClick={() => removeLink(ss.link_guid, ss.subspecies_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '12px' }}>✖</button>
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
                    {/* Подвиды без родительского вида (если такие есть) */}
                    {linkedSubspecies.filter(ss => !linkedByGenus[ss.parent_species?.genus]?.some(s => s.guid === ss.parent_species?.guid)).map(ss => (
                      <div key={ss.guid} style={{ padding: '6px 4px', marginLeft: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '2px solid #ddd' }}>
                        <span style={{ fontSize: '13px' }}>└─ <em>{ss.parent_species?.genus} {ss.parent_species?.species_name} {ss.subspecies_name}</em></span>
                        <button onClick={() => removeLink(ss.link_guid, ss.subspecies_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c' }}>✖</button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Вкладка Точек */}
            {activeTab === 'points' && (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '5px' }}>Привязать точку:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Введите название места..."
                      value={pointSearch}
                      onChange={(e) => setPointSearch(e.target.value)}
                      onKeyPress={handlePointKeyPress}
                      style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <button onClick={searchPoints} style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Найти</button>
                    <button onClick={() => setShowMapSelector(true)} style={{ padding: '8px 16px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>На карте</button>
                  </div>
                  
                  {pointResults.length > 0 && (
                    <div style={{ marginTop: '10px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '200px', overflow: 'auto' }}>
                      {pointResults.map(p => (
                        <div key={p.guid} style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{p.location_original?.substring(0, 60)}</strong>
                            {p.date_text && <div style={{ fontSize: '11px', color: '#888' }}>{p.date_text}</div>}
                          </div>
                          <button onClick={() => addLink(p.guid, 'point', p.location_original)} style={{ padding: '4px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Привязать</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 style={{ margin: '0 0 10px 0' }}>Привязанные точки ({linkedPoints.length}):</h4>
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', maxHeight: '300px', overflow: 'auto' }}>
                    {linkedPoints.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Нет привязанных точек</div>
                    ) : (
                      linkedPoints.map(p => (
                        <div key={p.link_guid} style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{p.location_original?.substring(0, 60) || 'Без названия'}</strong>
                            {p.date_text && <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>📅 {p.date_text}</span>}
                          </div>
                          <button onClick={() => removeLink(p.link_guid, p.location_original)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c' }}>✖</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: '15px', textAlign: 'right' }}>
              <button onClick={() => setShowLinkManager(false)} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* Выбор точки на карте */}
      {showMapSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1300,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90vw',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}>Выберите точку на карте</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowMapSelector(false); setShowPointForm(true); }} style={{ padding: '6px 12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>➕ Новая точка</button>
                <button onClick={() => setShowMapSelector(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>✖️</button>
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <MapView 
                points={allPoints}
                onMapClick={(lat, lng) => {
                  setShowMapSelector(false);
                  setNewPointCoords({ lat, lng });
                  setShowPointForm(true);
                }}
                onMarkerClick={(guid) => {
                  const point = allPoints.find(p => p.guid === guid);
                  if (point) addLink(guid, 'point', point.location_original);
                }}
                highlightedRows={new Set()}
              />
            </div>
          </div>
        </div>
      )}

      {/* Форма создания точки */}
      {showPointForm && (
        <PointForm
          point={null}
          initialLat={newPointCoords.lat}
          initialLng={newPointCoords.lng}
          onClose={() => { setShowPointForm(false); setNewPointCoords({ lat: null, lng: null }); }}
          onSave={handlePointCreated}
        />
      )}

      {/* Менеджер таксонов */}
      {showTaxonManager && (
        <TaxonManager onClose={() => setShowTaxonManager(false)} onUpdate={handleTaxonCreated} />
      )}
    </>
  );
};

export default StudyManager;
