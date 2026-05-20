import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const BulkEditModal = ({ selectedPoints, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [bulkInfo, setBulkInfo] = useState(null);
  const [collectors, setCollectors] = useState([]);
  const [studies, setStudies] = useState([]);
  const [taxa, setTaxa] = useState([]);
  
  const [selectedCollector, setSelectedCollector] = useState('');
  const [selectedStudy, setSelectedStudy] = useState('');
  const [selectedTaxa, setSelectedTaxa] = useState([]);
  
  const [updateCollector, setUpdateCollector] = useState(false);
  const [updateStudy, setUpdateStudy] = useState(false);
  const [updateTaxa, setUpdateTaxa] = useState(false);

  useEffect(() => {
    loadBulkInfo();
    loadCollectors();
    loadStudies();
    loadTaxa();
  }, []);

  const loadBulkInfo = async () => {
    try {
      const response = await axios.post(`${API_URL}/points/bulk-info`, selectedPoints);
      setBulkInfo(response.data);
    } catch (error) {
      console.error('Ошибка загрузки информации:', error);
    }
  };

  const loadCollectors = async () => {
    try {
      const response = await axios.get(`${API_URL}/persons`);
      setCollectors(response.data);
    } catch (error) {
      console.error('Ошибка загрузки сборщиков:', error);
    }
  };

  const loadStudies = async () => {
    try {
      const response = await axios.get(`${API_URL}/studies`);
      setStudies(response.data);
    } catch (error) {
      console.error('Ошибка загрузки исследований:', error);
    }
  };

  const loadTaxa = async () => {
    try {
      const response = await axios.get(`${API_URL}/taxa`);
      setTaxa(response.data);
    } catch (error) {
      console.error('Ошибка загрузки таксонов:', error);
    }
  };

  const handleSubmit = async () => {
    if (!updateCollector && !updateStudy && !updateTaxa) {
      alert('Выберите хотя бы одно поле для обновления');
      return;
    }

    const updates = {};
    
    if (updateCollector && selectedCollector) {
      updates.collector_name = selectedCollector;
    }
    
    if (updateStudy && selectedStudy) {
      updates.study_guid = selectedStudy;
    }
    
    if (updateTaxa && selectedTaxa.length > 0) {
      updates.taxa_guids = selectedTaxa;
    }

    if (Object.keys(updates).length === 0) {
      alert('Заполните значения для обновления');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/points/bulk-update`, {
        point_guids: selectedPoints,
        updates: updates
      });
      
      alert(response.data.message);
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error('Ошибка массового обновления:', error);
      alert('Ошибка при обновлении: ' + (error.response?.data?.detail || error.message));
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
      zIndex: 2000,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '600px',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Массовое редактирование</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#e74c3c' }}>✖️</button>
        </div>

        {bulkInfo && (
          <div style={{ marginBottom: '20px', padding: '10px', background: '#e8f4f8', borderRadius: '4px' }}>
            <strong>Выбрано точек: {bulkInfo.points_count}</strong>
            <div style={{ fontSize: '12px', marginTop: '5px' }}>
              {bulkInfo.unique_collectors.length > 0 && (
                <div>📋 Сборщики: {bulkInfo.unique_collectors.join(', ')}</div>
              )}
              {bulkInfo.unique_studies.length > 0 && (
                <div>📚 Исследований: {bulkInfo.unique_studies.length}</div>
              )}
              {bulkInfo.unique_taxa.length > 0 && (
                <div>🔬 Таксонов: {bulkInfo.unique_taxa.length}</div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="checkbox"
              checked={updateCollector}
              onChange={(e) => setUpdateCollector(e.target.checked)}
              style={{ marginRight: '10px' }}
            />
            <strong>Заменить сборщика:</strong>
          </label>
          {updateCollector && (
            <select
              value={selectedCollector}
              onChange={(e) => setSelectedCollector(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="">Выберите сборщика...</option>
              {collectors.map(c => (
                <option key={c.guid} value={c.display_name}>{c.display_name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="checkbox"
              checked={updateStudy}
              onChange={(e) => setUpdateStudy(e.target.checked)}
              style={{ marginRight: '10px' }}
            />
            <strong>Привязать исследование:</strong>
          </label>
          {updateStudy && (
            <select
              value={selectedStudy}
              onChange={(e) => setSelectedStudy(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="">Выберите исследование...</option>
              {studies.map(s => (
                <option key={s.guid} value={s.guid}>{s.title || s.url}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="checkbox"
              checked={updateTaxa}
              onChange={(e) => setUpdateTaxa(e.target.checked)}
              style={{ marginRight: '10px' }}
            />
            <strong>Заменить таксоны:</strong>
          </label>
          {updateTaxa && (
            <select
              multiple
              value={selectedTaxa}
              onChange={(e) => setSelectedTaxa(Array.from(e.target.selectedOptions, option => option.value))}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minHeight: '150px' }}
            >
              {taxa.map(t => (
                <option key={t.guid} value={t.guid}>
                  {t.display_name || `${t.genus} ${t.species || ''}`}
                </option>
              ))}
            </select>
          )}
          {updateTaxa && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Hold Ctrl (Cmd) для выбора нескольких таксонов
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {loading ? 'Обновление...' : 'Применить изменения'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkEditModal;
