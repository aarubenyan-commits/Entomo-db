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
  const [taxonSearch, setTaxonSearch] = useState('');
  const [taxonResults, setTaxonResults] = useState([]);
  const [linkedTaxa, setLinkedTaxa] = useState([]);

  useEffect(() => {
    axios.get(`${API_URL}/persons`)
      .then(res => {
        const opts = res.data.map(p => ({ value: p.full_name, label: p.full_name }));
        setCollectorOptions(opts);
        if (formData.collector_name) {
          setSelectedCollector({ value: formData.collector_name, label: formData.collector_name });
        }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (point?.guid) {
      axios.get(`${API_URL}/point_taxa/${point.guid}`)
        .then(res => {
          setPointTaxa(res.data);
          setLinkedTaxa(res.data.map(t => t.guid));
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

  // Упрощённая функция парсинга - прямой вызов бэкенда
  const parseCoordinates = async () => {
    if (!coordString.trim()) {
      setLatitude(null);
      setLongitude(null);
      return;
    }
    
    setLoadingParse(true);
    
    let latStr = '';
    let lonStr = '';
    
    // Пробуем разделить по запятой
    if (coordString.includes(',')) {
      const parts = coordString.split(',');
      latStr = parts[0].trim();
      lonStr = parts[1].trim();
    } else {
      // Пробуем разделить по пробелу
      const parts = coordString.trim().split(/\s+/);
      if (parts.length >= 2) {
        // Если последняя часть похожа на долготу (E/W)
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
      alert('Не удалось разделить координаты. Используйте формат: широта, долгота');
      setLoadingParse(false);
      return;
    }
    
    // Парсим через бэкенд
    const lat = await parseDMS(latStr);
    const lon = await parseDMS(lonStr);
    
    if (lat && lon) {
      setLatitude(lat);
      setLongitude(lon);
    } else {
      alert(`Не удалось распарсить координаты:\nШирота: ${latStr}\nДолгота: ${lonStr}`);
    }
    
    setLoadingParse(false);
  };

  const handleParseClick = () => {
    parseCoordinates();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      parseCoordinates();
    }
  };

  const dmsDisplay = (latitude !== null && longitude !== null) 
    ? `${decimalToDms(latitude, true)} ${decimalToDms(longitude, false)}`
    : '';
  const decimalDisplay = (latitude !== null && longitude !== null)
    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    : '';

  const reverseGeocodeNominatim = async (lat, lng) => {
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.display_name) {
        setFormData(prev => ({ ...prev, location_original: data.display_name.substring(0, 200) }));
      } else {
        alert('Не удалось определить адрес по координатам');
      }
    } catch (error) {
      console.error('Ошибка геокодирования OSM:', error);
      alert('Ошибка при получении адреса');
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

  const handleCollectorChange = (selected) => {
    setSelectedCollector(selected);
    setFormData(prev => ({ ...prev, collector_name: selected?.value || '' }));
  };

  const searchTaxa = async () => {
    if (!taxonSearch.trim()) return;
    const res = await axios.get(`${API_URL}/taxa/search?q=${encodeURIComponent(taxonSearch)}`);
    setTaxonResults(res.data);
  };

  const addTaxonToPoint = async (taxonGuid) => {
    if (!point?.guid) return;
    await axios.post(`${API_URL}/point_taxa/${point.guid}/${taxonGuid}`);
    const res = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
    setPointTaxa(res.data);
    setLinkedTaxa(res.data.map(t => t.guid));
    setTaxonSearch('');
    setTaxonResults([]);
  };

  const removeTaxon = async (taxonGuid) => {
    if (!point?.guid) return;
    await axios.delete(`${API_URL}/point_taxa/${point.guid}/${taxonGuid}`);
    const res = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
    setPointTaxa(res.data);
    setLinkedTaxa(res.data.map(t => t.guid));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.collector_name.trim()) {
      alert('Укажите сборщика');
      return;
    }
    
    if (latitude === null || longitude === null) {
      alert('Введите координаты и нажмите кнопку "Парсить"');
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
              onChange={handleCollectorChange}
              placeholder="Выберите сборщика..."
              isClearable
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Координаты (широта, долгота):</label>
            <input
              type="text"
              placeholder="Пример: 40.555, 45.123 или 40°33'17.5N, 45°13'14.0E"
              value={coordString}
              onChange={(e) => setCoordString(e.target.value)}
              onKeyPress={handleKeyPress}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '8px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" onClick={handleParseClick} disabled={loadingParse} style={{ padding: '4px 12px', fontSize: '12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {loadingParse ? '⏳ Парсинг...' : '🔄 Парсить координаты'}
              </button>
              <button type="button" onClick={handleFetchAddress} disabled={geocoding} style={{ padding: '4px 12px', fontSize: '12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {geocoding ? 'Загрузка...' : '📍 Подтянуть описание'}
              </button>
            </div>
            {decimalDisplay && (
              <div style={{ fontSize: '13px', color: '#2e7d32', marginBottom: '4px', background: '#e8f5e9', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                📍 Десятичные: {decimalDisplay}
              </div>
            )}
            {dmsDisplay && (
              <div style={{ fontSize: '12px', color: '#555', background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
                🧭 DMS: {dmsDisplay}
              </div>
            )}
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Описание места:</label>
            <textarea
              rows="3"
              value={formData.location_original}
              onChange={(e) => setFormData(prev => ({ ...prev, location_original: e.target.value }))}
              placeholder="Страна, регион, ближайший населённый пункт"
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
              <DatePicker
                selected={formData.date_start}
                onChange={(date) => setFormData(prev => ({ ...prev, date_start: date }))}
                dateFormat="dd.MM.yyyy"
                placeholderText="Выберите дату"
              />
            )}
            {formData.date_type === 'range' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <DatePicker selected={formData.date_start} onChange={(date) => setFormData(prev => ({ ...prev, date_start: date }))} dateFormat="dd.MM.yyyy" placeholderText="С" />
                <DatePicker selected={formData.date_end} onChange={(date) => setFormData(prev => ({ ...prev, date_end: date }))} dateFormat="dd.MM.yyyy" placeholderText="По" />
              </div>
            )}
            {formData.date_type === 'text' && (
              <input
                type="text"
                value={formData.date_text}
                onChange={(e) => setFormData(prev => ({ ...prev, date_text: e.target.value }))}
                placeholder="2024, весна 2024, 05.2024"
                style={{ width: '100%', padding: '8px' }}
              />
            )}
          </div>
          
          {point?.guid && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Таксоны:</label>
              {pointTaxa.length === 0 && <p style={{ fontSize: '12px', color: '#666' }}>Нет привязанных таксонов</p>}
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                {pointTaxa.map(t => (
                  <li key={t.guid}>
                    {t.full_name || `${t.genus} ${t.species || ''}`}
                    <button type="button" onClick={() => removeTaxon(t.guid)} style={{ marginLeft: '10px', color: 'red', fontSize: '12px' }}>✖</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setShowTaxonSelector(!showTaxonSelector)} style={{ marginTop: '5px', padding: '4px 8px', fontSize: '12px' }}>
                {showTaxonSelector ? 'Скрыть' : '➕ Добавить таксон'}
              </button>
              
              {showTaxonSelector && (
                <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Название таксона..."
                      value={taxonSearch}
                      onChange={(e) => setTaxonSearch(e.target.value)}
                      style={{ flex: 1, padding: '6px' }}
                    />
                    <button type="button" onClick={searchTaxa}>🔍 Найти</button>
                  </div>
                  {taxonResults.length > 0 && (
                    <ul style={{ marginTop: '10px', paddingLeft: '20px', maxHeight: '150px', overflow: 'auto' }}>
                      {taxonResults.map(t => (
                        <li key={t.guid} style={{ marginBottom: '5px' }}>
                          {t.full_name || `${t.genus} ${t.species || ''}`}
                          {linkedTaxa.includes(t.guid) ? (
                            <span style={{ marginLeft: '10px', color: 'green' }}>✓ Уже привязан</span>
                          ) : (
                            <button type="button" onClick={() => addTaxonToPoint(t.guid)} style={{ marginLeft: '10px' }}>➕ Привязать</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={() => onSave(false)} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Отмена</button>
            <button type="submit" disabled={loading} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PointForm;
