import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import Select from 'react-select';
import 'react-datepicker/dist/react-datepicker.css';

const API_URL = 'http://127.0.0.1:8000';

const PointForm = ({ point, initialLat, initialLng, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    latitude: initialLat !== undefined && initialLat !== null 
      ? initialLat 
      : (point?.latitude !== undefined && point?.latitude !== null ? point.latitude : ''),
    longitude: initialLng !== undefined && initialLng !== null 
      ? initialLng 
      : (point?.longitude !== undefined && point?.longitude !== null ? point.longitude : ''),
    location_original: point?.location_original || '',
    date_type: point?.date_start && point?.date_end ? 'range' : (point?.date_start ? 'exact' : 'text'),
    date_start: point?.date_start ? new Date(point.date_start) : null,
    date_end: point?.date_end ? new Date(point.date_end) : null,
    date_text: point?.date_text || '',
    collector_name: point?.collector_name || '',
  });
  
  const [collectorOptions, setCollectorOptions] = useState([]);
  const [selectedCollector, setSelectedCollector] = useState(null);
  const [pointTaxa, setPointTaxa] = useState([]);
  const [showTaxonManager, setShowTaxonManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Загрузка списка сборщиков
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

  // Загрузка таксонов точки (если редактируем)
  useEffect(() => {
    if (point?.guid) {
      axios.get(`${API_URL}/point_taxa/${point.guid}`)
        .then(res => setPointTaxa(res.data))
        .catch(err => console.error(err));
    }
  }, [point?.guid]);

  const reverseGeocodeNominatim = async (lat, lng) => {
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.display_name) {
        const address = data.display_name.substring(0, 200);
        setFormData(prev => ({ ...prev, location_original: address }));
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
    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      alert('Сначала введите корректные координаты (широту и долготу)');
      return;
    }
    reverseGeocodeNominatim(lat, lng);
  };

  const handleCollectorChange = (selected) => {
    setSelectedCollector(selected);
    setFormData({ ...formData, collector_name: selected?.value || '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.collector_name.trim()) {
      alert('Укажите сборщика');
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
        const start = formData.date_start.toLocaleDateString('ru-RU');
        const end = formData.date_end.toLocaleDateString('ru-RU');
        date_text_str = `${start} – ${end}`;
      }
    } else if (formData.date_type === 'text') {
      date_text_str = formData.date_text;
    }
    
    const payload = {
      latitude: formData.latitude === '' ? null : parseFloat(formData.latitude),
      longitude: formData.longitude === '' ? null : parseFloat(formData.longitude),
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
      setLoading(false);
    }
  };

  const handleTaxonAdded = () => {
    if (point?.guid) {
      axios.get(`${API_URL}/point_taxa/${point.guid}`)
        .then(res => setPointTaxa(res.data))
        .catch(err => console.error(err));
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
        width: '500px',
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
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Координаты (десятичные градусы):</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                step="any"
                placeholder="Широта (пример: 40.555)"
                value={formData.latitude}
                onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
              <input
                type="number"
                step="any"
                placeholder="Долгота (пример: 45.123)"
                value={formData.longitude}
                onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
            <button type="button" onClick={handleFetchAddress} disabled={geocoding} style={{ marginTop: '8px', padding: '4px 8px', fontSize: '12px' }}>
              {geocoding ? 'Загрузка...' : 'Подтянуть описание с карты'}
            </button>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Описание места:</label>
            <textarea
              rows="3"
              value={formData.location_original}
              onChange={(e) => setFormData({...formData, location_original: e.target.value})}
              placeholder="Страна, регион, ближайший населённый пункт"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Дата:</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <label><input type="radio" name="date_type" checked={formData.date_type === 'exact'} onChange={() => setFormData({...formData, date_type: 'exact'})} /> Точная</label>
              <label><input type="radio" name="date_type" checked={formData.date_type === 'range'} onChange={() => setFormData({...formData, date_type: 'range'})} /> Диапазон</label>
              <label><input type="radio" name="date_type" checked={formData.date_type === 'text'} onChange={() => setFormData({...formData, date_type: 'text'})} /> Текст</label>
            </div>
            {formData.date_type === 'exact' && (
              <DatePicker
                selected={formData.date_start}
                onChange={(date) => setFormData({...formData, date_start: date})}
                dateFormat="dd.MM.yyyy"
                placeholderText="Выберите дату"
              />
            )}
            {formData.date_type === 'range' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <DatePicker selected={formData.date_start} onChange={(date) => setFormData({...formData, date_start: date})} dateFormat="dd.MM.yyyy" placeholderText="С" />
                <DatePicker selected={formData.date_end} onChange={(date) => setFormData({...formData, date_end: date})} dateFormat="dd.MM.yyyy" placeholderText="По" />
              </div>
            )}
            {formData.date_type === 'text' && (
              <input
                type="text"
                value={formData.date_text}
                onChange={(e) => setFormData({...formData, date_text: e.target.value})}
                placeholder="2024, весна 2024, 05.2024"
                style={{ width: '100%', padding: '8px' }}
              />
            )}
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Таксоны:</label>
            {pointTaxa.length === 0 && <p style={{ fontSize: '12px', color: '#666' }}>Нет привязанных таксонов</p>}
            <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
              {pointTaxa.map(t => (
                <li key={t.guid}>{t.full_name}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setShowTaxonManager(true)} style={{ marginTop: '5px', padding: '4px 8px', fontSize: '12px' }}>
              📋 Управление таксонами
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={() => onSave(false)} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Отмена</button>
            <button type="submit" disabled={loading} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
      {showTaxonManager && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200
        }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3>Привязать таксон к точке</h3>
            <TaxonSelector pointGuid={point?.guid} onSelect={handleTaxonAdded} onClose={() => setShowTaxonManager(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

// Компонент выбора таксона (поиск + список)
const TaxonSelector = ({ pointGuid, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [linkedTaxa, setLinkedTaxa] = useState([]);

  useEffect(() => {
    if (pointGuid) {
      axios.get(`${API_URL}/point_taxa/${pointGuid}`)
        .then(res => setLinkedTaxa(res.data.map(t => t.guid)))
        .catch(err => console.error(err));
    }
  }, [pointGuid]);

  const handleSearch = async () => {
    if (!search.trim()) return;
    const res = await axios.get(`${API_URL}/taxa/search?q=${encodeURIComponent(search)}`);
    setResults(res.data);
  };

  const handleAdd = async (taxonGuid) => {
    await axios.post(`${API_URL}/point_taxa/${pointGuid}/${taxonGuid}`);
    onSelect();
    setLinkedTaxa([...linkedTaxa, taxonGuid]);
    setSearch('');
    setResults([]);
  };

  const handleCreateNew = async () => {
    if (!search.trim()) return;
    const res = await axios.post(`${API_URL}/taxa?genus=${encodeURIComponent(search)}&species=`);
    const newTaxon = res.data;
    await axios.post(`${API_URL}/point_taxa/${pointGuid}/${newTaxon.guid}`);
    onSelect();
    setLinkedTaxa([...linkedTaxa, newTaxon.guid]);
    setSearch('');
    setResults([]);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Род или вид..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px' }}
        />
        <button onClick={handleSearch}>🔍 Найти</button>
        <button onClick={handleCreateNew}>➕ Создать новый</button>
      </div>
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflow: 'auto' }}>
          {results.map(t => (
            <li key={t.guid} style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t.full_name}</span>
              {linkedTaxa.includes(t.guid) ? (
                <span style={{ color: 'green' }}>✓ Уже привязан</span>
              ) : (
                <button onClick={() => handleAdd(t.guid)}>➕ Привязать</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <button onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
};

export default PointForm;
