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
  const [loading, setLoading] = useState(false);

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
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Описание места:</label>
            <textarea
              rows="3"
              value={formData.location_original}
              onChange={(e) => setFormData({...formData, location_original: e.target.value})}
              placeholder="Страна, регион, ближайший населённый пункт"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          
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
