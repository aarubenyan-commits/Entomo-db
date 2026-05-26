import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const API_URL = 'http://127.0.0.1:8000';

const decimalToDms = (decimal, isLat) => {
  if (decimal === undefined || decimal === null || isNaN(parseFloat(decimal))) return '';
  const dec = parseFloat(decimal);
  const degrees = Math.floor(Math.abs(dec));
  const minutesFull = (Math.abs(dec) - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  const secondsRounded = Math.round(seconds * 10) / 10;
  const direction = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${secondsRounded.toFixed(1)}"${direction}`;
};

const parseDMS = async (dmsStr) => {
  if (!dmsStr || typeof dmsStr !== "string") return null;
  try {
    const response = await axios.post(`${API_URL}/parse/dms`, { dms: dmsStr });
    return response.data.decimal;
  } catch {
    return null;
  }
};

const ExpandablePointCard = ({ point, isSelected, isHighlighted, onSelect, onHighlight, onUpdate, onCancel, isNew = false, autoFocus = false }) => {
  const [expanded, setExpanded] = useState(isNew);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const formRef = useRef(null);
  
  const collectors = point.collectors || [];
  const collectorsNames = collectors.map(c => c.display_name).join(', ');
  const studiesCount = point.studies_count || 0;
  const existingStudies = point.studies || [];
  const initialTaxa = point.taxa || [];
  
  const [formData, setFormData] = useState({
    location_original: point.location_original || '',
    date_type: 'text',
    date_start: null,
    date_end: null,
    date_text: point.display_date || (isNew ? new Date().toLocaleDateString('ru-RU') : ''),
    collectors: collectors.map(c => ({ guid: c.guid, name: c.display_name })),
    taxa: [...initialTaxa],
    studies: existingStudies,
  });
  
  const [coordString, setCoordString] = useState('');
  const [latitude, setLatitude] = useState(point.latitude || null);
  const [longitude, setLongitude] = useState(point.longitude || null);
  const [latitudeDms, setLatitudeDms] = useState(point.latitude_dms || '');
  const [longitudeDms, setLongitudeDms] = useState(point.longitude_dms || '');
  
  const [allPersons, setAllPersons] = useState([]);
  const [allSpecies, setAllSpecies] = useState([]);
  const [allSubspecies, setAllSubspecies] = useState([]);
  const [allStudies, setAllStudies] = useState([]);
  const [selectedStudies, setSelectedStudies] = useState([]);
  
  const [expandedGenera, setExpandedGenera] = useState({});
  const [expandedSpecies, setExpandedSpecies] = useState({});
  const [showTaxonSelector, setShowTaxonSelector] = useState(false);
  
  const speciesCount = formData.taxa.length;
  const displayTaxa = formData.taxa.slice(0, 3);
  const remainingCount = formData.taxa.length - 3;
  
  useEffect(() => {
    if (autoFocus && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const firstInput = formRef.current.querySelector('input, textarea');
      if (firstInput) firstInput.focus();
    }
  }, [autoFocus]);
  
  useEffect(() => {
    if (latitudeDms && longitudeDms) {
      setCoordString(`${latitudeDms} ${longitudeDms}`);
    }
    loadSelectData();
  }, []);
  
  const loadSelectData = async () => {
    try {
      const [personsRes, speciesRes, subspeciesRes, studiesRes] = await Promise.all([
        axios.get(`${API_URL}/persons`),
        axios.get(`${API_URL}/species`),
        axios.get(`${API_URL}/subspecies`),
        axios.get(`${API_URL}/studies`)
      ]);
      setAllPersons(personsRes.data);
      setAllSpecies(speciesRes.data);
      setAllSubspecies(subspeciesRes.data);
      setAllStudies(studiesRes.data);
      setSelectedStudies(existingStudies.map(s => ({ value: s.guid, label: s.title || s.url })));
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    }
  };
  
  const handleParseCoordinates = async () => {
    if (!coordString.trim()) return;
    const parts = coordString.trim().split(/\s+/);
    if (parts.length < 2) {
      alert('Введите обе координаты');
      return;
    }
    const lat = await parseDMS(parts[0]);
    const lon = await parseDMS(parts[1]);
    if (lat && lon) {
      setLatitude(lat);
      setLongitude(lon);
      setLatitudeDms(decimalToDms(lat, true));
      setLongitudeDms(decimalToDms(lon, false));
    } else {
      alert('Не удалось распознать координаты');
    }
  };
  
  const reverseGeocode = async () => {
    if (latitude === null || longitude === null) {
      alert('Сначала введите координаты');
      return;
    }
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.display_name) {
        setFormData(prev => ({ ...prev, location_original: data.display_name.substring(0, 200) }));
      }
    } catch (error) {
      console.error('Ошибка геокодирования:', error);
    } finally {
      setGeocoding(false);
    }
  };
  
  const addCollector = (personGuid, personName) => {
    if (!formData.collectors.find(c => c.guid === personGuid)) {
      setFormData(prev => ({
        ...prev,
        collectors: [...prev.collectors, { guid: personGuid, name: personName }]
      }));
    }
  };
  
  const removeCollector = (personGuid) => {
    setFormData(prev => ({
      ...prev,
      collectors: prev.collectors.filter(c => c.guid !== personGuid)
    }));
  };
  
  const addTaxon = (taxonGuid, taxonName) => {
    if (!formData.taxa.find(t => t.guid === taxonGuid)) {
      setFormData(prev => ({
        ...prev,
        taxa: [...prev.taxa, { guid: taxonGuid, display_name: taxonName }]
      }));
    }
  };
  
  const moveTaxonUp = (index) => {
    if (index > 0) {
      const newTaxa = [...formData.taxa];
      [newTaxa[index - 1], newTaxa[index]] = [newTaxa[index], newTaxa[index - 1]];
      setFormData(prev => ({ ...prev, taxa: newTaxa }));
    }
  };
  
  const moveTaxonDown = (index) => {
    if (index < formData.taxa.length - 1) {
      const newTaxa = [...formData.taxa];
      [newTaxa[index], newTaxa[index + 1]] = [newTaxa[index + 1], newTaxa[index]];
      setFormData(prev => ({ ...prev, taxa: newTaxa }));
    }
  };
  
  const removeTaxon = async (taxonGuid) => {
    console.log("removeTaxon called", taxonGuid);
    if (!isNew && point && point.guid && point.guid !== 'new') {
      if (window.confirm('Удалить этот таксон из точки?')) {
        try {
          const url = `${API_URL}/point_taxa/${point.guid}/${taxonGuid}`;
          console.log("DELETE:", url);
          await axios.delete(url);
          console.log("DELETE successful");
          setFormData(prev => ({
            ...prev,
            taxa: prev.taxa.filter(t => t.guid !== taxonGuid)
          }));
          if (onUpdate) onUpdate(point.guid, true);
        } catch (error) {
          console.error('Delete error:', error);
          alert('Ошибка удаления: ' + (error.response?.data?.detail || error.message));
        }
      }
    } else {
      console.log("Removing from local state only");
      setFormData(prev => ({
        ...prev,
        taxa: prev.taxa.filter(t => t.guid !== taxonGuid)
      }));
    }
  };
  
  // В функции handleSave для новой точки (isNew === true)
const handleSave = async () => {
  setLoading(true);
  try {
    if (isNew) {
      const payload = {
        location_original: formData.location_original,
        latitude: latitude,
        longitude: longitude,
        date_text: formData.date_text,
        collectors: formData.collectors,  // <-- ВАЖНО: передаём массив сборщиков
      };
      
      const response = await axios.post(`${API_URL}/points/create`, payload);
      const newPointGuid = response.data.guid;
      
      // Таксоны с порядком
      for (let i = 0; i < formData.taxa.length; i++) {
        const taxon = formData.taxa[i];
        await axios.post(`${API_URL}/point_taxa/${newPointGuid}/${taxon.guid}?sort_order=${i}`);
      }
      
      // Исследования
      for (const study of selectedStudies) {
        await axios.post(`${API_URL}/source/point/${newPointGuid}/${study.value}`);
      }
      
      if (onUpdate) onUpdate(newPointGuid, true);
    } else {
      // Существующая точка - аналогично обновляем collectors
      await axios.put(`${API_URL}/points/${point.guid}`, {
        location_original: formData.location_original,
        latitude: latitude,
        longitude: longitude,
        date_text: formData.date_text,
        collectors: formData.collectors,
      });
      
      // ... остальной код для таксонов и исследований ...
    }
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    alert('Ошибка сохранения: ' + (error.response?.data?.detail || error.message));
  } finally {
    setLoading(false);
  }
};
  const handleCancel = () => {
    if (isNew) {
      if (onCancel) {
        onCancel();
      } else {
        if (onUpdate) onUpdate(null, false);
      }
    } else {
      setExpanded(false);
    }
  };
  
  const handleDelete = async () => {
    if (window.confirm('Удалить эту точку?')) {
      try {
        await axios.delete(`${API_URL}/points/${point.guid}`);
        if (onUpdate) onUpdate(point.guid, true);
      } catch (error) {
        alert('Ошибка удаления');
      }
    }
  };
  
  const toggleGenus = (genus) => {
    setExpandedGenera(prev => ({ ...prev, [genus]: !prev[genus] }));
  };
  
  const toggleSpecies = (speciesGuid) => {
    setExpandedSpecies(prev => ({ ...prev, [speciesGuid]: !prev[speciesGuid] }));
  };
  
  const isTaxonLinked = (taxonGuid) => {
    return formData.taxa.some(t => t.guid === taxonGuid);
  };
  
  const speciesByGenus = {};
  for (const s of allSpecies) {
    if (!speciesByGenus[s.genus]) speciesByGenus[s.genus] = [];
    speciesByGenus[s.genus].push(s);
  }
  
  let bgColor = '#fff';
  if (isNew) bgColor = '#f0f7ff';
  else if (isHighlighted) bgColor = '#d4e6f1';
  else if (isSelected) bgColor = '#e8f4f8';
  
  const handleDoubleClick = () => {
    setExpanded(true);
  };
  
  if (isNew) {
    return (
      <div ref={formRef} style={{
        backgroundColor: bgColor,
        marginBottom: '8px',
        border: '1px solid #3498db',
        borderRadius: '8px',
        fontSize: '11px',
        boxShadow: '0 2px 8px rgba(52,152,219,0.2)',
      }}>
        <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', color: '#2c3e50' }}>Новая точка сбора</h4>
            <button onClick={handleCancel} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#95a5a6' }}>✕</button>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057' }}>📍 Место сбора</label>
              <button onClick={reverseGeocode} disabled={geocoding || !latitude || !longitude} style={{ padding: '2px 8px', background: '#e9ecef', border: 'none', borderRadius: '4px', cursor: (geocoding || !latitude || !longitude) ? 'not-allowed' : 'pointer', fontSize: '9px', opacity: (geocoding || !latitude || !longitude) ? 0.5 : 1 }}>{geocoding ? 'Загрузка...' : '📋 Скопировать название с карты'}</button>
            </div>
            <textarea rows="2" value={formData.location_original} onChange={(e) => setFormData(prev => ({ ...prev, location_original: e.target.value }))} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '11px' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>🗺️ Координаты</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input type="text" value={coordString} onChange={(e) => setCoordString(e.target.value)} placeholder="Пример: 43°00'0.0N 131°30'0.0E" style={{ flex: 1, padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace' }} />
              <button onClick={handleParseCoordinates} style={{ padding: '4px 10px', background: '#e9ecef', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px' }}>🔍 Распознать</button>
            </div>
            {latitude && longitude && (
              <div style={{ fontSize: '10px', color: '#27ae60', background: '#e8f5e9', padding: '6px 8px', borderRadius: '6px' }}>
                📍 Десятичные: {latitude.toFixed(6)}, {longitude.toFixed(6)}<br />
                🗺️ DMS: {decimalToDms(latitude, true)} {decimalToDms(longitude, false)}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>📅 Дата</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
              <label style={{ fontSize: '10px' }}><input type="radio" name="date_type" checked={formData.date_type === 'exact'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'exact' }))} /> Точная</label>
              <label style={{ fontSize: '10px' }}><input type="radio" name="date_type" checked={formData.date_type === 'range'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'range' }))} /> Диапазон</label>
              <label style={{ fontSize: '10px' }}><input type="radio" name="date_type" checked={formData.date_type === 'text'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'text' }))} /> Текст</label>
            </div>
            {formData.date_type === 'exact' && (
              <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date, date_text: date?.toLocaleDateString('ru-RU') || '' }))} dateFormat="dd.MM.yyyy" popperPlacement="bottom-start" />
            )}
            {formData.date_type === 'range' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date }))} dateFormat="dd.MM.yyyy" placeholderText="С" popperPlacement="bottom-start" />
                <DatePicker selected={formData.date_end} onChange={(date) => setFormData(prev => ({ ...prev, date_end: date }))} dateFormat="dd.MM.yyyy" placeholderText="По" popperPlacement="bottom-start" />
              </div>
            )}
            {formData.date_type === 'text' && (
              <input type="text" value={formData.date_text} onChange={(e) => setFormData(prev => ({ ...prev, date_text: e.target.value }))} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '11px' }} />
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>📚 Исследования</label>
            <Select isMulti options={allStudies.map(s => ({ value: s.guid, label: s.title || s.url }))} value={selectedStudies} onChange={setSelectedStudies} placeholder="Выберите исследования..." styles={{ control: (base) => ({ ...base, minHeight: '26px', fontSize: '10px' }), multiValue: (base) => ({ ...base, fontSize: '9px' }), placeholder: (base) => ({ ...base, fontSize: '10px' }) }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>👥 Сборщики</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
              {formData.collectors.map(c => (
                <span key={c.guid} style={{ background: '#e9ecef', padding: '2px 6px', borderRadius: '12px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {c.name}
                  <button onClick={() => removeCollector(c.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#e74c3c' }}>✕</button>
                </span>
              ))}
            </div>
            <select onChange={(e) => { if (e.target.value) { addCollector(e.target.value, e.target.options[e.target.selectedIndex].text); e.target.value = ''; } }} style={{ padding: '4px 6px', fontSize: '10px', border: '1px solid #ced4da', borderRadius: '6px' }}>
              <option value="">+ Добавить сборщика</option>
              {allPersons.filter(p => !formData.collectors.find(c => c.guid === p.guid)).map(p => (
                <option key={p.guid} value={p.guid}>{p.display_name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>🔬 Таксоны</label>
            <button onClick={() => setShowTaxonSelector(!showTaxonSelector)} style={{ padding: '4px 10px', background: '#e9ecef', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', marginBottom: '6px' }}>
              {showTaxonSelector ? 'Скрыть дерево' : '➕ Добавить таксон'}
            </button>
            {showTaxonSelector && (
              <div style={{ border: '1px solid #ced4da', borderRadius: '6px', padding: '8px', maxHeight: '200px', overflow: 'auto', marginBottom: '8px', background: '#fff' }}>
                {Object.keys(speciesByGenus).sort().map(genus => (
                  <div key={genus} style={{ marginBottom: '4px' }}>
                    <div style={{ padding: '4px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: '#f5f5f5', borderRadius: '4px' }} onClick={() => toggleGenus(genus)}>
                      <span style={{ fontSize: '10px', marginRight: '6px' }}>{expandedGenera[genus] ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 'bold', fontSize: '10px' }}>{genus}</span>
                    </div>
                    {expandedGenera[genus] && (
                      <div style={{ paddingLeft: '16px' }}>
                        {speciesByGenus[genus].map(species => {
                          const subspeciesList = allSubspecies.filter(ss => ss.species_guid === species.guid);
                          const hasSubspecies = subspeciesList.length > 0;
                          return (
                            <div key={species.guid} style={{ marginBottom: '2px' }}>
                              <div style={{ padding: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '2px solid #ddd' }} onClick={() => hasSubspecies && toggleSpecies(species.guid)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {hasSubspecies && <span style={{ fontSize: '9px' }}>{expandedSpecies[species.guid] ? '▼' : '▶'}</span>}
                                  <span style={{ fontStyle: 'italic', fontSize: '10px' }}>{species.species_name}</span>
                                </div>
                                <button onClick={() => addTaxon(species.guid, `${species.genus} ${species.species_name}`)} style={{ padding: '2px 6px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '9px' }}>Привязать</button>
                              </div>
                              {expandedSpecies[species.guid] && hasSubspecies && (
                                <div style={{ paddingLeft: '20px' }}>
                                  {subspeciesList.map(ss => (
                                    <div key={ss.guid} style={{ padding: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                                      <span style={{ color: '#666' }}>└─ <em>{ss.subspecies_name}</em></span>
                                      <button onClick={() => addTaxon(ss.guid, `${species.genus} ${species.species_name} ${ss.subspecies_name}`)} style={{ padding: '2px 6px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '9px' }}>Привязать</button>
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
            <div style={{ marginTop: '8px' }}>
              {formData.taxa.map((taxon, index) => (
                <div key={taxon.guid} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  background: '#e9ecef', 
                  padding: '4px 8px', 
                  borderRadius: '6px', 
                  marginBottom: '4px' 
                }}>
                  <span style={{ fontSize: '10px', flex: 1 }}>{taxon.display_name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => moveTaxonUp(index)} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, fontSize: '12px' }} title="Вверх">↑</button>
                    <button onClick={() => moveTaxonDown(index)} disabled={index === formData.taxa.length - 1} style={{ background: 'none', border: 'none', cursor: index === formData.taxa.length - 1 ? 'not-allowed' : 'pointer', opacity: index === formData.taxa.length - 1 ? 0.3 : 1, fontSize: '12px' }} title="Вниз">↓</button>
                    <button onClick={() => removeTaxon(taxon.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#e74c3c' }} title="Удалить">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #dee2e6' }}>
            <button onClick={handleCancel} style={{ padding: '4px 12px', background: '#e9ecef', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Отмена</button>
            <button onClick={handleSave} disabled={loading} style={{ padding: '4px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>{loading ? '...' : '💾 Сохранить'}</button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div
      style={{
        backgroundColor: bgColor,
        marginBottom: '4px',
        border: expanded ? '1px solid #b8c4ce' : '1px solid #e2e6ea',
        borderRadius: '8px',
        fontSize: '11px',
        transition: 'background-color 0.15s ease',
      }}
    >
      <div
        onDoubleClick={handleDoubleClick}
        onClick={(e) => {
          if (!e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
            onHighlight(point.guid);
          }
        }}
        style={{ padding: '8px 10px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(point.guid, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '14px', height: '14px', marginTop: '2px', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: '12px', color: '#2c3e50', marginBottom: '4px' }}>
              {formData.location_original || '—'}
            </div>
            {latitudeDms && longitudeDms && (
              <div style={{ fontSize: '10px', color: '#7f8c8d', fontFamily: 'monospace', textAlign: 'center', marginBottom: '8px' }}>
                {latitudeDms} {longitudeDms}
              </div>
            )}
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ width: '35%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#5d6d7e' }}>📅 {formData.date_text || '—'}</span>
                  <span style={{ fontSize: '9px', color: '#7f8c8d' }}>(Sp. {speciesCount})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#5d6d7e' }}>👤 {collectorsNames || '—'}</span>
                  <span style={{ fontSize: '9px', color: '#7f8c8d' }}>(sci {studiesCount})</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {displayTaxa.map((taxon, idx) => (
                  <div key={idx} style={{ fontSize: '10px', color: '#2c3e50', marginBottom: '2px' }}>
                    {taxon.display_name}
                  </div>
                ))}
                {remainingCount > 0 && (
                  <div style={{ fontSize: '9px', color: '#7f8c8d', fontStyle: 'italic', marginTop: '2px' }}>
                    и ещё {remainingCount}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '12px', borderTop: '1px solid #e2e6ea', background: '#f8f9fa' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button onClick={() => setExpanded(false)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#95a5a6' }}>✕</button>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057' }}>📍 Место сбора</label>
              <button onClick={reverseGeocode} disabled={geocoding || !latitude || !longitude} style={{ padding: '2px 8px', background: '#e9ecef', border: 'none', borderRadius: '4px', cursor: (geocoding || !latitude || !longitude) ? 'not-allowed' : 'pointer', fontSize: '9px', opacity: (geocoding || !latitude || !longitude) ? 0.5 : 1 }}>{geocoding ? 'Загрузка...' : '📋 Скопировать название с карты'}</button>
            </div>
            <textarea rows="2" value={formData.location_original} onChange={(e) => setFormData(prev => ({ ...prev, location_original: e.target.value }))} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '11px' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>🗺️ Координаты</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input type="text" value={coordString} onChange={(e) => setCoordString(e.target.value)} placeholder="Пример: 43°00'0.0N 131°30'0.0E" style={{ flex: 1, padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace' }} />
              <button onClick={handleParseCoordinates} style={{ padding: '4px 10px', background: '#e9ecef', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px' }}>🔍 Распознать</button>
            </div>
            {latitude && longitude && (
              <div style={{ fontSize: '10px', color: '#27ae60', background: '#e8f5e9', padding: '6px 8px', borderRadius: '6px' }}>
                📍 Десятичные: {latitude.toFixed(6)}, {longitude.toFixed(6)}<br />
                🗺️ DMS: {decimalToDms(latitude, true)} {decimalToDms(longitude, false)}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>📅 Дата</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
              <label style={{ fontSize: '10px' }}><input type="radio" name="date_type" checked={formData.date_type === 'exact'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'exact' }))} /> Точная</label>
              <label style={{ fontSize: '10px' }}><input type="radio" name="date_type" checked={formData.date_type === 'range'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'range' }))} /> Диапазон</label>
              <label style={{ fontSize: '10px' }}><input type="radio" name="date_type" checked={formData.date_type === 'text'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'text' }))} /> Текст</label>
            </div>
            {formData.date_type === 'exact' && (
              <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date, date_text: date?.toLocaleDateString('ru-RU') || '' }))} dateFormat="dd.MM.yyyy" popperPlacement="bottom-start" />
            )}
            {formData.date_type === 'range' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date }))} dateFormat="dd.MM.yyyy" placeholderText="С" popperPlacement="bottom-start" />
                <DatePicker selected={formData.date_end} onChange={(date) => setFormData(prev => ({ ...prev, date_end: date }))} dateFormat="dd.MM.yyyy" placeholderText="По" popperPlacement="bottom-start" />
              </div>
            )}
            {formData.date_type === 'text' && (
              <input type="text" value={formData.date_text} onChange={(e) => setFormData(prev => ({ ...prev, date_text: e.target.value }))} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '11px' }} />
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>📚 Исследования</label>
            <Select isMulti options={allStudies.map(s => ({ value: s.guid, label: s.title || s.url }))} value={selectedStudies} onChange={setSelectedStudies} placeholder="Выберите исследования..." styles={{ control: (base) => ({ ...base, minHeight: '26px', fontSize: '10px' }), multiValue: (base) => ({ ...base, fontSize: '9px' }), placeholder: (base) => ({ ...base, fontSize: '10px' }) }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>👥 Сборщики</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
              {formData.collectors.map(c => (
                <span key={c.guid} style={{ background: '#e9ecef', padding: '2px 6px', borderRadius: '12px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {c.name}
                  <button onClick={() => removeCollector(c.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#e74c3c' }}>✕</button>
                </span>
              ))}
            </div>
            <select onChange={(e) => { if (e.target.value) { addCollector(e.target.value, e.target.options[e.target.selectedIndex].text); e.target.value = ''; } }} style={{ padding: '4px 6px', fontSize: '10px', border: '1px solid #ced4da', borderRadius: '6px' }}>
              <option value="">+ Добавить сборщика</option>
              {allPersons.filter(p => !formData.collectors.find(c => c.guid === p.guid)).map(p => (
                <option key={p.guid} value={p.guid}>{p.display_name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#495057', marginBottom: '4px', display: 'block' }}>🔬 Таксоны</label>
            <button onClick={() => setShowTaxonSelector(!showTaxonSelector)} style={{ padding: '4px 10px', background: '#e9ecef', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', marginBottom: '6px' }}>
              {showTaxonSelector ? 'Скрыть дерево' : '➕ Добавить таксон'}
            </button>
            {showTaxonSelector && (
              <div style={{ border: '1px solid #ced4da', borderRadius: '6px', padding: '8px', maxHeight: '200px', overflow: 'auto', marginBottom: '8px', background: '#fff' }}>
                {Object.keys(speciesByGenus).sort().map(genus => (
                  <div key={genus} style={{ marginBottom: '4px' }}>
                    <div style={{ padding: '4px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: '#f5f5f5', borderRadius: '4px' }} onClick={() => toggleGenus(genus)}>
                      <span style={{ fontSize: '10px', marginRight: '6px' }}>{expandedGenera[genus] ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 'bold', fontSize: '10px' }}>{genus}</span>
                    </div>
                    {expandedGenera[genus] && (
                      <div style={{ paddingLeft: '16px' }}>
                        {speciesByGenus[genus].map(species => {
                          const subspeciesList = allSubspecies.filter(ss => ss.species_guid === species.guid);
                          const hasSubspecies = subspeciesList.length > 0;
                          const isLinked = isTaxonLinked(species.guid);
                          return (
                            <div key={species.guid} style={{ marginBottom: '2px' }}>
                              <div style={{ padding: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '2px solid #ddd' }} onClick={() => hasSubspecies && toggleSpecies(species.guid)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {hasSubspecies && <span style={{ fontSize: '9px' }}>{expandedSpecies[species.guid] ? '▼' : '▶'}</span>}
                                  <span style={{ fontStyle: 'italic', fontSize: '10px' }}>{species.species_name}</span>
                                </div>
                                {!isLinked && (
                                  <button onClick={() => addTaxon(species.guid, `${species.genus} ${species.species_name}`)} style={{ padding: '2px 6px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '9px' }}>Привязать</button>
                                )}
                              </div>
                              {expandedSpecies[species.guid] && hasSubspecies && (
                                <div style={{ paddingLeft: '20px' }}>
                                  {subspeciesList.map(ss => {
                                    const isLinkedSub = isTaxonLinked(ss.guid);
                                    return (
                                      <div key={ss.guid} style={{ padding: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                                        <span style={{ color: '#666' }}>└─ <em>{ss.subspecies_name}</em></span>
                                        {!isLinkedSub && (
                                          <button onClick={() => addTaxon(ss.guid, `${species.genus} ${species.species_name} ${ss.subspecies_name}`)} style={{ padding: '2px 6px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '9px' }}>Привязать</button>
                                        )}
                                      </div>
                                    );
                                  })}
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
            <div style={{ marginTop: '8px' }}>
              {formData.taxa.map((taxon, index) => (
                <div key={taxon.guid} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  background: '#e9ecef', 
                  padding: '4px 8px', 
                  borderRadius: '6px', 
                  marginBottom: '4px' 
                }}>
                  <span style={{ fontSize: '10px', flex: 1 }}>{taxon.display_name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => moveTaxonUp(index)} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, fontSize: '12px' }} title="Вверх">↑</button>
                    <button onClick={() => moveTaxonDown(index)} disabled={index === formData.taxa.length - 1} style={{ background: 'none', border: 'none', cursor: index === formData.taxa.length - 1 ? 'not-allowed' : 'pointer', opacity: index === formData.taxa.length - 1 ? 0.3 : 1, fontSize: '12px' }} title="Вниз">↓</button>
                    <button onClick={() => removeTaxon(taxon.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#e74c3c' }} title="Удалить">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #dee2e6' }}>
            <button onClick={handleDelete} style={{ padding: '4px 12px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', color: '#6c757d' }}>🗑️ Удалить</button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setExpanded(false)} style={{ padding: '4px 12px', background: '#e9ecef', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Отмена</button>
              <button onClick={handleSave} disabled={loading} style={{ padding: '4px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>{loading ? '...' : '💾 Сохранить'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpandablePointCard;
