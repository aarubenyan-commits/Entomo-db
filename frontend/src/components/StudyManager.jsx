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
  const [formHeight, setFormHeight] = useState(320);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [showLinkManager, setShowLinkManager] = useState(false);
  const [linkedPoints, setLinkedPoints] = useState([]);
  const [linkedTaxa, setLinkedTaxa] = useState([]);
  const [linkType, setLinkType] = useState('taxon');
  const [pointSearchName, setPointSearchName] = useState('');
  const [taxonSearchTerm, setTaxonSearchTerm] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    description: '',
    authors: ''
  });
  const resizerRef = useRef(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showPointForm, setShowPointForm] = useState(false);
  const [showTaxonManager, setShowTaxonManager] = useState(false);
  const [newPointCoords, setNewPointCoords] = useState({ lat: null, lng: null });
  const [pendingPointToLink, setPendingPointToLink] = useState(null);
  const [allPoints, setAllPoints] = useState([]);

  useEffect(() => {
    fetchStudies();
    loadAllPoints();
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
      const taxa = [];
      
      for (const link of linksRes.data) {
        if (link.direction === 'incoming' && link.relation_type === 'source') {
          const objGuid = link.target_guid;
          const objType = link.target_type;
          
          if (objType === 'point') {
            try {
              const pointRes = await axios.get(`${API_URL}/points/${objGuid}`);
              points.push({
                link_guid: link.link_guid,
                ...pointRes.data
              });
            } catch (error) {
              console.warn('Точка не найдена:', objGuid);
            }
          } else if (objType === 'taxon') {
            try {
              const taxaRes = await axios.get(`${API_URL}/taxa`);
              const taxon = taxaRes.data.find(t => t.guid === objGuid);
              if (taxon) {
                taxa.push({
                  link_guid: link.link_guid,
                  ...taxon
                });
              }
            } catch (error) {
              console.warn('Ошибка загрузки таксона:', objGuid);
            }
          }
        }
      }
      
      setLinkedPoints(points);
      setLinkedTaxa(taxa);
    } catch (error) {
      console.error('Ошибка загрузки связанных объектов:', error);
      setLinkedPoints([]);
      setLinkedTaxa([]);
    }
  };

  const openLinkManager = async (study) => {
    setSelectedStudy(study);
    await fetchLinkedObjects(study.guid);
    setShowLinkManager(true);
  };

  const searchTaxa = async () => {
    if (!taxonSearchTerm.trim()) return;
    try {
      const res = await axios.get(`${API_URL}/search?q=${encodeURIComponent(taxonSearchTerm)}`);
      const results = res.data.filter(r => r.type === "taxon");
      setLinkSearchResults(results);
      if (results.length === 0 && taxonSearchTerm.trim().length > 2) {
        setShowCreatePrompt(true);
      }
    } catch (error) {
      console.error("Ошибка поиска таксонов:", error);
      setLinkSearchResults([]);
    }
  };

  const searchPointsByName = async () => {
    if (!pointSearchName.trim()) {
      setLinkSearchResults([]);
      return;
    }
    
    const results = allPoints.filter(p => 
      p.location_original && 
      p.location_original.toLowerCase().includes(pointSearchName.toLowerCase())
    );
    
    setLinkSearchResults(results.map(p => ({
      type: "point",
      guid: p.guid,
      name: p.location_original || "Точка",
      location: p.location_original,
      date: p.date_text,
      collector: p.collector_name,
      latitude: p.latitude,
      longitude: p.longitude
    })));
    
    if (results.length === 0 && pointSearchName.trim().length > 2) {
      setShowCreatePrompt(true);
    }
  };

  const handleSearch = () => {
    if (linkType === 'point') {
      searchPointsByName();
    } else {
      searchTaxa();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleCreateNew = () => {
    setShowCreatePrompt(false);
    if (linkType === 'taxon') {
      setShowTaxonManager(true);
    } else if (linkType === 'point') {
      setShowMapSelector(true);
    }
  };

  const addLink = async (objectGuid, objectType, objectName) => {
    if (!selectedStudy) return;
    try {
      await axios.post(`${API_URL}/source/${objectType}/${objectGuid}/${selectedStudy.guid}`);
      await fetchLinkedObjects(selectedStudy.guid);
      await loadAllPoints();
      setLinkSearchResults([]);
      setPointSearchName('');
      setTaxonSearchTerm('');
      setShowMapSelector(false);
      setShowPointForm(false);
    } catch (error) {
      console.error('Ошибка привязки:', error);
      alert('Ошибка привязки: ' + (error.response?.data?.detail || error.message));
    }
  };

  const removeLink = async (linkGuid, objectName) => {
    if (window.confirm(`Удалить связь с "${objectName}"?`)) {
      try {
        await axios.delete(`${API_URL}/source/${linkGuid}`);
        await fetchLinkedObjects(selectedStudy.guid);
      } catch (error) {
        console.error('Ошибка удаления связи:', error);
        alert('Ошибка удаления связи');
      }
    }
  };

  const handlePointCreated = async (success, newPointGuid) => {
    setShowPointForm(false);
    const coords = { ...newPointCoords };
    setNewPointCoords({ lat: null, lng: null });
    
    if (success && newPointGuid && selectedStudy) {
      // Автоматически привязываем созданную точку к исследованию
      try {
        await axios.post(`${API_URL}/source/point/${newPointGuid}/${selectedStudy.guid}`);
        await loadAllPoints();
        await fetchLinkedObjects(selectedStudy.guid);
        alert('Точка создана и привязана к исследованию');
      } catch (error) {
        console.error('Ошибка привязки новой точки:', error);
        alert('Точка создана, но не привязана к исследованию');
      }
    } else if (success && selectedStudy) {
      // Если нет GUID, но нужно обновить список
      await loadAllPoints();
      await fetchLinkedObjects(selectedStudy.guid);
    }
    
    // Возвращаемся к окну выбора точки на карте
    if (success) {
      setShowMapSelector(true);
    }
  };

  const handleTaxonCreated = async (success, newTaxonGuid) => {
    setShowTaxonManager(false);
    if (success && newTaxonGuid && selectedStudy) {
      // Автоматически привязываем созданный таксон к исследованию
      try {
        await axios.post(`${API_URL}/source/taxon/${newTaxonGuid}/${selectedStudy.guid}`);
        await fetchLinkedObjects(selectedStudy.guid);
        alert('Таксон создан и привязан к исследованию');
        // Обновляем поиск таксонов
        searchTaxa();
      } catch (error) {
        console.error('Ошибка привязки нового таксона:', error);
        alert('Таксон создан, но не привязан к исследованию');
      }
    } else if (success) {
      searchTaxa();
    }
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
      console.error('Ошибка сохранения:', error);
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
        console.error('Ошибка удаления:', error);
        alert('Ошибка удаления исследования');
      }
    }
  };

  const resetForm = () => {
    setEditingGuid(null);
    setFormData({ title: '', url: '', description: '', authors: '' });
  };

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = formHeight;
    
    const onMouseMove = (moveEvent) => {
      if (!isResizing) return;
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(280, Math.min(500, startHeight + delta));
      setFormHeight(newHeight);
    };
    
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <>
      {/* Главное окно управления исследованиями */}
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
          width: '1000px',
          maxWidth: '90vw',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
            <h2 style={{ margin: 0 }}>Управление исследованиями</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#e74c3c', padding: '4px 8px' }}>✖️</button>
          </div>
          
          {/* Верхняя форма - с возможностью ресайза */}
          <div style={{ 
            height: `${formHeight}px`, 
            overflow: 'auto', 
            marginBottom: '10px', 
            paddingRight: '5px',
            borderBottom: '1px solid #ddd',
            flexShrink: 0
          }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: '250px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Название:</label>
                  <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} placeholder="Название исследования" />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Автор(ы):</label>
                  <input type="text" value={formData.authors} onChange={(e) => setFormData({...formData, authors: e.target.value})} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} placeholder="Автор" />
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Ссылка (URL):</label>
                <input type="url" value={formData.url} onChange={(e) => setFormData({...formData, url: e.target.value})} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} placeholder="https://..." />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Описание:</label>
                <textarea rows="2" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Краткое описание" />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={resetForm} style={{ padding: '6px 12px', fontSize: '12px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Очистить</button>
                <button type="submit" style={{ padding: '6px 12px', fontSize: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{editingGuid ? 'Обновить' : 'Создать'}</button>
              </div>
            </form>
          </div>

          {/* Ресайзер */}
          <div 
            ref={resizerRef} 
            onMouseDown={handleResizeMouseDown} 
            style={{ 
              height: '8px', 
              background: '#ddd', 
              cursor: 'ns-resize', 
              margin: '5px 0', 
              borderRadius: '4px',
              width: '100%',
              flexShrink: 0
            }} 
          />

          {/* Нижняя таблица */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginTop: '5px' }}>
            <div style={{ marginBottom: '10px', flexShrink: 0 }}>
              <input type="text" placeholder="Поиск по названию или автору..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Название</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Автор(ы)</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '100px' }}>Связи</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '80px' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudies.map(s => (
                    <tr key={s.guid} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>
                        <div><strong>{s.title || '—'}</strong></div>
                        {s.url && <div style={{ fontSize: '10px', color: '#666', wordBreak: 'break-all' }}>{s.url.substring(0, 60)}...</div>}
                        {s.description && <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>{s.description.substring(0, 80)}...</div>}
                      </td>
                      <td style={{ padding: '10px' }}>{s.authors || '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => openLinkManager(s)} style={{ background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px 12px', fontSize: '12px' }}>Управление</button>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={() => handleEdit(s)} style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✏️</button>
                        <button onClick={() => handleDelete(s.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#e74c3c' }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            width: '750px',
            maxWidth: '85vw',
            maxHeight: '85vh',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Связи исследования</h3>
              <button onClick={() => setShowLinkManager(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#e74c3c', padding: '4px 8px' }}>✖️</button>
            </div>
            <p style={{ marginBottom: '15px', fontWeight: 'bold', wordBreak: 'break-all' }}>{selectedStudy.title || selectedStudy.url}</p>
            
            <div style={{ marginBottom: '20px', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
              <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Добавить связь</h4>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                <select value={linkType} onChange={(e) => {
                  setLinkType(e.target.value);
                  setLinkSearchResults([]);
                  setPointSearchName('');
                  setTaxonSearchTerm('');
                }} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}>
                  <option value="taxon">Таксон</option>
                  <option value="point">Точка</option>
                </select>
                
                {linkType === 'taxon' ? (
                  <input
                    type="text"
                    placeholder="Поиск таксона по названию..."
                    value={taxonSearchTerm}
                    onChange={(e) => setTaxonSearchTerm(e.target.value)}
                    onKeyPress={handleKeyPress}
                    style={{ flex: 2, padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                  />
                ) : (
                  <div style={{ flex: 2, display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Поиск точки по названию..."
                      value={pointSearchName}
                      onChange={(e) => setPointSearchName(e.target.value)}
                      onKeyPress={handleKeyPress}
                      style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                    />
                    <button 
                      onClick={() => setShowMapSelector(true)} 
                      style={{ 
                        padding: '6px 12px', 
                        background: '#f39c12', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: 'pointer', 
                        fontSize: '12px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🗺️ Выбрать на карте
                    </button>
                  </div>
                )}
                
                <button onClick={handleSearch} style={{ padding: '6px 12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  Найти
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreatePrompt(true)} style={{ padding: '4px 8px', fontSize: '11px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Создать новый
                </button>
              </div>
              
              {linkSearchResults.length > 0 && (
                <div style={{ border: '1px solid #ccc', borderRadius: '4px', maxHeight: '200px', overflow: 'auto', marginTop: '10px' }}>
                  {linkSearchResults.map(r => (
                    <div key={r.guid} style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <strong>{r.name}</strong>
                        {r.location && <div style={{ fontSize: '10px', color: '#666' }}>{r.location.substring(0, 80)}</div>}
                        {r.date && <div style={{ fontSize: '10px', color: '#888' }}>Дата: {r.date}</div>}
                        {r.collector && <div style={{ fontSize: '10px', color: '#888' }}>Сборщик: {r.collector}</div>}
                      </div>
                      <button onClick={() => addLink(r.guid, r.type, r.name)} style={{ padding: '4px 12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginLeft: '10px' }}>
                        Привязать
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Связанные таксоны ({linkedTaxa.length})</h4>
              {linkedTaxa.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px', border: '1px dashed #ddd', borderRadius: '4px' }}>Нет привязанных таксонов</p>
              ) : (
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'auto', maxHeight: '200px' }}>
                  {linkedTaxa.map(t => (
                    <div key={t.link_guid} style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span><strong>{t.display_name || `${t.genus} ${t.species || ''}`}</strong></span>
                      <button onClick={() => removeLink(t.link_guid, t.display_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Связанные точки ({linkedPoints.length})</h4>
              {linkedPoints.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px', border: '1px dashed #ddd', borderRadius: '4px' }}>Нет привязанных точек</p>
              ) : (
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'auto', maxHeight: '200px' }}>
                  {linkedPoints.map(p => (
                    <div key={p.link_guid} style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <strong>{(p.location_original || '').substring(0, 100) || 'Без названия'}</strong>
                        {p.date_text && <div style={{ fontSize: '10px', color: '#888' }}>Дата: {p.date_text}</div>}
                        {p.collector_name && <div style={{ fontSize: '10px', color: '#888' }}>Сборщик: {p.collector_name}</div>}
                      </div>
                      <button onClick={() => removeLink(p.link_guid, p.location_original)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Диалог создания нового объекта */}
      {showCreatePrompt && (
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
          zIndex: 1200,
        }}>
          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', width: '350px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Ничего не найдено</h3>
            <p>Создать новый {linkType === 'taxon' ? 'таксон' : 'точку'}?</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setShowCreatePrompt(false)} style={{ padding: '8px 20px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Отмена</button>
              <button onClick={handleCreateNew} style={{ padding: '8px 20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно выбора точки на карте */}
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
                <button 
                  onClick={() => {
                    setShowMapSelector(false);
                    setNewPointCoords({ lat: null, lng: null });
                    setShowPointForm(true);
                  }}
                  style={{ padding: '6px 12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ➕ Создать новую точку
                </button>
                <button onClick={() => setShowMapSelector(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#e74c3c' }}>✖️</button>
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
                onMarkerClick={(guid, lat, lng) => {
                  const point = allPoints.find(p => p.guid === guid);
                  if (point) {
                    addLink(guid, 'point', point.location_original);
                  }
                }}
                highlightedRows={new Set()}
              />
            </div>
          </div>
        </div>
      )}

      {/* Форма создания новой точки - высокий z-index */}
      {showPointForm && (
        <div style={{ zIndex: 1400 }}>
          <PointForm
            point={null}
            initialLat={newPointCoords.lat}
            initialLng={newPointCoords.lng}
            onClose={() => {
              setShowPointForm(false);
              setNewPointCoords({ lat: null, lng: null });
            }}
            onSave={(success) => {
              if (success) {
                // Ждем немного, чтобы точка успела создаться в БД
                setTimeout(async () => {
                  // Получаем последнюю созданную точку
                  const pointsRes = await axios.get(`${API_URL}/points`);
                  const lastPoint = pointsRes.data[pointsRes.data.length - 1];
                  if (lastPoint && selectedStudy) {
                    await axios.post(`${API_URL}/source/point/${lastPoint.guid}/${selectedStudy.guid}`);
                    await loadAllPoints();
                    await fetchLinkedObjects(selectedStudy.guid);
                    alert('Точка создана и привязана к исследованию');
                  } else if (selectedStudy) {
                    await loadAllPoints();
                    await fetchLinkedObjects(selectedStudy.guid);
                  }
                  setShowPointForm(false);
                  setNewPointCoords({ lat: null, lng: null });
                  setShowMapSelector(true);
                }, 500);
              } else {
                setShowPointForm(false);
                setNewPointCoords({ lat: null, lng: null });
                setShowMapSelector(true);
              }
            }}
          />
        </div>
      )}

      {/* Менеджер таксонов для создания нового - высокий z-index */}
      {showTaxonManager && (
        <div style={{ zIndex: 1400 }}>
          <TaxonManager
            onClose={() => {
              setShowTaxonManager(false);
            }}
            onUpdate={(success) => {
              if (success) {
                setTimeout(async () => {
                  const taxaRes = await axios.get(`${API_URL}/taxa`);
                  const lastTaxon = taxaRes.data[taxaRes.data.length - 1];
                  if (lastTaxon && selectedStudy) {
                    await axios.post(`${API_URL}/source/taxon/${lastTaxon.guid}/${selectedStudy.guid}`);
                    await fetchLinkedObjects(selectedStudy.guid);
                    alert('Таксон создан и привязан к исследованию');
                    searchTaxa();
                  }
                  setShowTaxonManager(false);
                }, 500);
              } else {
                setShowTaxonManager(false);
              }
            }}
          />
        </div>
      )}
    </>
  );
};

export default StudyManager;
