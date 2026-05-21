import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import Select from 'react-select';
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
    const response = await fetch(`${API_URL}/parse/dms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dms: dmsStr })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.decimal !== undefined ? data.decimal : null;
  } catch (error) {
    console.error("DMS parse error:", error);
    return null;
  }
};

const PointForm = ({ point, initialLat, initialLng, onClose, onSave }) => {
  const [coordString, setCoordString] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [loadingParse, setLoadingParse] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [showStudyDialog, setShowStudyDialog] = useState(false);
  
  const [formData, setFormData] = useState({
    location_original: point?.location_original || '',
    date_type: point?.date_start && point?.date_end ? 'range' : (point?.date_start ? 'exact' : 'text'),
    date_start: point?.date_start ? new Date(point.date_start) : null,
    date_end: point?.date_end ? new Date(point.date_end) : null,
    date_text: point?.date_text || '',
    collector_name: point?.collector_name || '',
  });
  
  const [collectorOptions, setCollectorOptions] = useState([]);
  const [selectedCollector, setSelectedCollector] = useState(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [pointTaxa, setPointTaxa] = useState([]);
  const [showTaxonSelector, setShowTaxonSelector] = useState(false);
  const [allSpecies, setAllSpecies] = useState([]);
  const [allSubspecies, setAllSubspecies] = useState([]);
  const [expandedGenera, setExpandedGenera] = useState({});
  const [expandedSpecies, setExpandedSpecies] = useState({});

  useEffect(() => {
    axios.get(`${API_URL}/persons`)
      .then(res => {
        const opts = res.data.map(p => ({ value: p.display_name, label: p.display_name }));
        setCollectorOptions(opts);
        if (formData.collector_name) {
          setSelectedCollector({ value: formData.collector_name, label: formData.collector_name });
        }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    loadAllTaxa();
  }, []);

  useEffect(() => {
    if (point?.guid) {
      axios.get(`${API_URL}/point_taxa/${point.guid}`)
        .then(res => {
          setPointTaxa(res.data);
        })
        .catch(err => console.error(err));
    }
  }, [point?.guid]);

  useEffect(() => {
    let initialCoord = '';
    if (initialLat && initialLng) {
      initialCoord = `${initialLat}, ${initialLng}`;
      setLatitude(initialLat);
      setLongitude(initialLng);
    } else if (point?.latitude && point?.longitude) {
      initialCoord = `${point.latitude}, ${point.longitude}`;
      setLatitude(point.latitude);
      setLongitude(point.longitude);
    }
    setCoordString(initialCoord);
  }, [initialLat, initialLng, point?.latitude, point?.longitude]);

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

  const loadSources = async () => {
    if (!point?.guid) return;
    try {
      const res = await axios.get(`${API_URL}/sources/point/${point.guid}`);
      setSources(res.data);
      setShowSources(true);
    } catch (error) {
      console.error("Ошибка загрузки источников:", error);
    }
  };

  const openStudyDetails = (study) => {
    setSelectedStudy(study);
    setShowStudyDialog(true);
  };

  const parseCoordinates = async () => {
    if (!coordString.trim()) {
      setLatitude(null);
      setLongitude(null);
      return;
    }
    setLoadingParse(true);
    let latStr = '', lonStr = '';
    if (coordString.includes(',')) {
      const parts = coordString.split(',');
      latStr = parts[0].trim();
      lonStr = parts[1].trim();
    } else {
      const parts = coordString.trim().split(/\s+/);
      if (parts.length >= 2) {
        if (parts[parts.length - 1].match(/[EW]$/i)) {
          latStr = parts.slice(0, -1).join(' ');
          lonStr = parts[parts.length - 1];
        } else {
          latStr = parts[0];
          lonStr = parts[1];
        }
      }
    }
    if (!latStr || !lonStr) {
      alert('Не удалось разделить координаты');
      setLoadingParse(false);
      return;
    }
    const lat = await parseDMS(latStr);
    const lon = await parseDMS(lonStr);
    if (lat && lon) {
      setLatitude(lat);
      setLongitude(lon);
    } else {
      alert(`Не удалось распознать координаты`);
    }
    setLoadingParse(false);
  };

  const reverseGeocodeNominatim = async (lat, lng) => {
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.display_name) {
        setFormData(prev => ({ ...prev, location_original: data.display_name.substring(0, 200) }));
      }
    } catch (error) {
      console.error('Ошибка геокодирования OSM:', error);
    } finally {
      setGeocoding(false);
    }
  };

  const handleFetchAddress = () => {
    if (latitude === null || longitude === null) {
      alert('Сначала введите и распарсите координаты');
      return;
    }
    reverseGeocodeNominatim(latitude, longitude);
  };

  const addTaxonToPoint = async (taxonGuid, taxonType) => {
    if (!point?.guid) return;
    try {
      await axios.post(`${API_URL}/point_taxa/${point.guid}/${taxonGuid}`);
      const res = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
      setPointTaxa(res.data);
    } catch (error) {
      console.error('Ошибка привязки таксона:', error);
    }
  };

  const removeTaxon = async (taxonGuid) => {
    if (!point?.guid) return;
    await axios.delete(`${API_URL}/point_taxa/${point.guid}/${taxonGuid}`);
    const res = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
    setPointTaxa(res.data);
  };

  const toggleGenus = (genus) => {
    setExpandedGenera(prev => ({ ...prev, [genus]: !prev[genus] }));
  };

  const toggleSpecies = (speciesGuid) => {
    setExpandedSpecies(prev => ({ ...prev, [speciesGuid]: !prev[speciesGuid] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
// Сборщик необязателен - только предупреждение
if (!formData.collector_name.trim()) {
  if (!window.confirm('Сборщик не указан. Продолжить без сборщика?')) {
    return;
  }
}
    if (latitude === null || longitude === null) {
      alert('Введите координаты и нажмите кнопку "Распознать"');
      return;
    }
    setLoading(true);
    let date_start_str = null, date_end_str = null, date_text_str = null;
    if (formData.date_type === 'exact' && formData.date_start) {
      date_start_str = formData.date_start.toISOString().split('T')[0];
      date_text_str = formData.date_start.toLocaleDateString('ru-RU');
    } else if (formData.date_type === 'range') {
      if (formData.date_start) date_start_str = formData.date_start.toISOString().split('T')[0];
      if (formData.date_end) date_end_str = formData.date_end.toISOString().split('T')[0];
      if (date_start_str && date_end_str) {
        date_text_str = `${formData.date_start.toLocaleDateString('ru-RU')} – ${formData.date_end.toLocaleDateString('ru-RU')}`;
      }
    } else if (formData.date_type === 'text') {
      date_text_str = formData.date_text;
    }
    const payload = {
      latitude: latitude,
      longitude: longitude,
      location_original: formData.location_original,
      date_start: date_start_str,
      date_end: date_end_str,
      date_text: date_text_str,
      collector_name: formData.collector_name,
    };
    try {
      if (point?.guid) {
        await axios.put(`${API_URL}/points/${point.guid}`, payload);
      } else {
        await axios.post(`${API_URL}/points/create`, payload);
      }
      onSave(true);
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  // Группировка видов по родам
  const speciesByGenus = {};
  for (const s of allSpecies) {
    if (!speciesByGenus[s.genus]) speciesByGenus[s.genus] = [];
    speciesByGenus[s.genus].push(s);
  }

  const isTaxonLinked = (taxonGuid) => {
    return pointTaxa.some(t => t.guid === taxonGuid);
  };

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
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '600px',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <h2>{point ? 'Редактировать точку' : 'Новая точка'}</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Сборщик:</label>
            <Select
              options={collectorOptions}
              value={selectedCollector}
              onChange={(selected) => {
                setSelectedCollector(selected);
                setFormData(prev => ({ ...prev, collector_name: selected?.value || '' }));
              }}
              placeholder="Выберите сборщика..."
              isClearable
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Координаты:</label>
            <input
              type="text"
              placeholder="Пример: 40.555, 45.123 или 40°33'17.5N, 45°13'14.0E"
              value={coordString}
              onChange={(e) => setCoordString(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '8px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" onClick={parseCoordinates} disabled={loadingParse} style={{ padding: '4px 12px', fontSize: '12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {loadingParse ? '⏳ Парсинг...' : '🔄 Распознать координаты'}
              </button>
              <button type="button" onClick={handleFetchAddress} disabled={geocoding} style={{ padding: '4px 12px', fontSize: '12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {geocoding ? 'Загрузка...' : '📍 Название с карты'}
              </button>
            </div>
            {latitude && longitude && (
              <div style={{ fontSize: '13px', color: '#2e7d32', marginBottom: '4px', background: '#e8f5e9', padding: '6px 10px', borderRadius: '4px' }}>
                <div>📍 Десятичные: {latitude.toFixed(6)}, {longitude.toFixed(6)}</div>
                <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                  🗺️ DMS: {decimalToDms(latitude, true)}, {decimalToDms(longitude, false)}
                </div>
              </div>
            )}
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Описание:</label>
            <textarea
              rows="2"
              value={formData.location_original}
              onChange={(e) => setFormData(prev => ({ ...prev, location_original: e.target.value }))}
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Дата:</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <label><input type="radio" name="date_type" checked={formData.date_type === 'exact'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'exact' }))} /> Точная</label>
              <label><input type="radio" name="date_type" checked={formData.date_type === 'range'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'range' }))} /> Диапазон</label>
              <label><input type="radio" name="date_type" checked={formData.date_type === 'text'} onChange={() => setFormData(prev => ({ ...prev, date_type: 'text' }))} /> Текст</label>
            </div>
            {formData.date_type === 'exact' && (
              <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date }))} dateFormat="dd.MM.yyyy" />
            )}
            {formData.date_type === 'range' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date }))} dateFormat="dd.MM.yyyy" placeholderText="С" />
                <DatePicker selected={formData.date_end} onChange={(date) => setFormData(prev => ({ ...prev, date_end: date }))} dateFormat="dd.MM.yyyy" placeholderText="По" />
              </div>
            )}
            {formData.date_type === 'text' && (
              <input type="text" value={formData.date_text} onChange={(e) => setFormData(prev => ({ ...prev, date_text: e.target.value }))} style={{ width: '100%', padding: '8px' }} />
            )}
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Таксоны:</label>
            {pointTaxa.length === 0 ? (
              <div style={{ padding: '15px', textAlign: 'center', color: '#999', border: '1px solid #ddd', borderRadius: '4px' }}>Нет привязанных таксонов</div>
            ) : (
              <div style={{ border: '1px solid #ddd', borderRadius: '4px', marginBottom: '10px', maxHeight: '200px', overflow: 'auto' }}>
                {pointTaxa.map(t => (
                  <div key={t.guid} style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><strong>{t.genus}</strong> <em>{t.species || ''}</em> {t.subspecies && <em>({t.subspecies})</em>}</span>
                    <button type="button" onClick={() => removeTaxon(t.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>✖</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setShowTaxonSelector(!showTaxonSelector)} style={{ marginTop: '8px', padding: '4px 12px', fontSize: '12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {showTaxonSelector ? 'Скрыть' : '➕ Добавить таксон'}
            </button>
            
            {showTaxonSelector && allSpecies.length > 0 && (
              <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '300px', overflow: 'auto' }}>
                {Object.keys(speciesByGenus).sort().map(genus => (
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
                          const isLinked = isTaxonLinked(species.guid);
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
                                {isLinked ? (
                                  <span style={{ fontSize: '11px', color: 'green', marginRight: '8px' }}>✓</span>
                                ) : (
                                  <button 
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); addTaxonToPoint(species.guid, 'species'); }}
                                    style={{ padding: '2px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    Привязать вид
                                  </button>
                                )}
                              </div>
                              {expandedSpecies[species.guid] && hasSubspecies && (
                                <div style={{ paddingLeft: '20px', borderLeft: '2px solid #ddd', marginLeft: '10px' }}>
                                  {subspeciesList.map(ss => {
                                    const isLinkedSub = isTaxonLinked(ss.guid);
                                    return (
                                      <div key={ss.guid} style={{ padding: '4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                        <span style={{ color: '#666' }}>└─ <em>{ss.subspecies_name}</em></span>
                                        {isLinkedSub ? (
                                          <span style={{ fontSize: '11px', color: 'green' }}>✓</span>
                                        ) : (
                                          <button 
                                            type="button"
                                            onClick={() => addTaxonToPoint(ss.guid, 'subspecies')}
                                            style={{ padding: '2px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                          >
                                            Привязать подвид
                                          </button>
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
          </div>
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '20px' }}>
            <button type="button" onClick={loadSources} style={{ padding: '8px 16px', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              📚 Источники данных ({sources.length})
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => onSave(false)} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Отмена</button>
              <button type="submit" disabled={loading} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
            </div>
          </div>
        </form>

        {/* Модальное окно источников */}
        {showSources && (
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
            zIndex: 2000,
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              width: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}>
              <h3>📚 Источники данных для точки</h3>
              {sources.length === 0 ? (
                <p style={{ color: '#999' }}>Нет привязанных источников</p>
              ) : (
                <div>
                  {sources.map(s => (
                    <div
                      key={s.link_guid}
                      onClick={() => openStudyDetails(s)}
                      style={{
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '10px',
                        cursor: 'pointer',
                        backgroundColor: '#fafafa'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        {s.title || <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{s.url}</a>}
                      </div>
                      {s.authors && <div style={{ fontSize: '12px', color: '#666' }}>{s.authors}</div>}
                      {s.description && <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>{s.description.substring(0, 150)}...</div>}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowSources(false)} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Закрыть</button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно с деталями исследования */}
        {showStudyDialog && selectedStudy && (
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
            zIndex: 2001,
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              width: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}>
              <h3>📄 Детали исследования</h3>
              <div style={{ marginBottom: '15px' }}><strong>Название:</strong> {selectedStudy.title || selectedStudy.url}</div>
              {selectedStudy.authors && <div style={{ marginBottom: '15px' }}><strong>Автор(ы):</strong> {selectedStudy.authors}</div>}
              {selectedStudy.url && <div style={{ marginBottom: '15px' }}><strong>Ссылка:</strong> <a href={selectedStudy.url} target="_blank" rel="noopener noreferrer">{selectedStudy.url}</a></div>}
              {selectedStudy.description && (
                <div style={{ marginBottom: '15px' }}>
                  <strong>Описание:</strong>
                  <div style={{ marginTop: '5px', padding: '10px', background: '#f9f9f9', borderRadius: '4px', maxHeight: '200px', overflow: 'auto' }}>
                    {selectedStudy.description}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setShowStudyDialog(false)} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Закрыть</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PointForm;
