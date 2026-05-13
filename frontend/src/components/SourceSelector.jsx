import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const SourceSelector = ({ objectType, objectGuid, onUpdate }) => {
  const [sources, setSources] = useState([]);
  const [studies, setStudies] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadSources();
    loadStudies();
  }, [objectGuid]);

  const loadSources = async () => {
    try {
      const res = await axios.get(`${API_URL}/sources/${objectType}/${objectGuid}`);
      setSources(res.data);
    } catch (error) {
      console.error('Ошибка загрузки источников:', error);
    }
  };

  const loadStudies = async () => {
    try {
      const res = await axios.get(`${API_URL}/studies`);
      setStudies(res.data);
    } catch (error) {
      console.error('Ошибка загрузки исследований:', error);
    }
  };

  const addSource = async () => {
    if (!selectedStudy) {
      alert('Выберите исследование');
      return;
    }
    try {
      await axios.post(`${API_URL}/source/${objectType}/${objectGuid}/${selectedStudy}`);
      loadSources();
      setSelectedStudy('');
      if (onUpdate) onUpdate();
      alert('Источник добавлен');
    } catch (error) {
      console.error('Ошибка добавления источника:', error);
      alert('Ошибка добавления источника');
    }
  };

  const removeSource = async (linkGuid) => {
    if (window.confirm('Удалить этот источник?')) {
      try {
        await axios.delete(`${API_URL}/source/${linkGuid}`);
        loadSources();
        if (onUpdate) onUpdate();
        alert('Источник удалён');
      } catch (error) {
        console.error('Ошибка удаления источника:', error);
        alert('Ошибка удаления источника');
      }
    }
  };

  return (
    <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
      <h4>📚 Источники информации</h4>
      
      {sources.length > 0 ? (
        <ul style={{ marginBottom: '10px' }}>
          {sources.map(s => (
            <li key={s.link_guid} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {s.title ? <strong>{s.title}</strong> : <a href={s.url} target="_blank">{s.url}</a>}
                {s.authors && <span style={{ fontSize: '12px', color: '#666', marginLeft: '5px' }}>({s.authors})</span>}
                {s.description && <div style={{ fontSize: '11px', color: '#888' }}>{s.description}</div>}
              </div>
              <button onClick={() => removeSource(s.link_guid)} style={{ color: 'red' }}>🗑️</button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: '#999', fontSize: '12px' }}>Нет привязанных источников</p>
      )}
      
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select 
          value={selectedStudy} 
          onChange={(e) => setSelectedStudy(e.target.value)}
          style={{ padding: '5px', fontSize: '12px', flex: 1 }}
        >
          <option value="">Выберите исследование...</option>
          {studies.map(s => (
            <option key={s.guid} value={s.guid}>{s.title || s.url}</option>
          ))}
        </select>
        <button onClick={addSource} style={{ padding: '5px 10px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          ➕ Добавить источник
        </button>
        <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '5px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {showAddForm ? 'Скрыть' : '+ Новое исследование'}
        </button>
      </div>
      
      {showAddForm && (
        <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
          <input type="text" placeholder="Название (или ссылка)" id="new_study_title" style={{ width: '100%', padding: '5px', marginBottom: '5px' }} />
          <input type="url" placeholder="Ссылка (URL)" id="new_study_url" style={{ width: '100%', padding: '5px', marginBottom: '5px' }} />
          <textarea placeholder="Описание" id="new_study_description" rows="2" style={{ width: '100%', padding: '5px', marginBottom: '5px' }} />
          <input type="text" placeholder="Автор(ы)" id="new_study_authors" style={{ width: '100%', padding: '5px', marginBottom: '5px' }} />
          <button onClick={async () => {
            const title = document.getElementById('new_study_title').value;
            const url = document.getElementById('new_study_url').value;
            if (!title && !url) {
              alert('Укажите название или ссылку');
              return;
            }
            try {
              await axios.post(`${API_URL}/studies`, {
                title: title || null,
                url: url || null,
                description: document.getElementById('new_study_description').value || null,
                authors: document.getElementById('new_study_authors').value || null
              });
              loadStudies();
              setShowAddForm(false);
              alert('Исследование создано');
            } catch (error) {
              console.error('Ошибка создания исследования:', error);
              alert('Ошибка создания исследования');
            }
          }} style={{ padding: '5px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Создать исследование
          </button>
        </div>
      )}
    </div>
  );
};

export default SourceSelector;
