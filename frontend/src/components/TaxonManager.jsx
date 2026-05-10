import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const TaxonManager = ({ onClose, onUpdate }) => {
  const [taxa, setTaxa] = useState([]);
  const [editingGuid, setEditingGuid] = useState(null);
  const [formData, setFormData] = useState({
    genus: '',
    species: '',
    subspecies: '',
    display_name: ''
  });

  useEffect(() => {
    fetchTaxa();
  }, []);

  const fetchTaxa = async () => {
    try {
      const res = await axios.get(`${API_URL}/taxa`);
      setTaxa(res.data);
    } catch (error) {
      console.error('Ошибка загрузки таксонов:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingGuid) {
        await axios.put(`${API_URL}/taxa/${editingGuid}`, formData);
      } else {
        await axios.post(`${API_URL}/taxa`, formData);
      }
      fetchTaxa();
      if (onUpdate) onUpdate();
      resetForm();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      alert('Ошибка сохранения таксона');
    }
  };

  const handleEdit = (taxon) => {
    setEditingGuid(taxon.guid);
    setFormData({
      genus: taxon.genus || '',
      species: taxon.species || '',
      subspecies: taxon.subspecies || '',
      display_name: taxon.display_name || ''
    });
  };

  const handleDelete = async (guid) => {
    if (window.confirm('Удалить этот таксон?')) {
      try {
        await axios.delete(`${API_URL}/taxa/${guid}`);
        fetchTaxa();
        if (onUpdate) onUpdate();
      } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка удаления таксона');
      }
    }
  };

  const resetForm = () => {
    setEditingGuid(null);
    setFormData({ genus: '', species: '', subspecies: '', display_name: '' });
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
        <h2>{editingGuid ? 'Редактировать таксон' : 'Новый таксон'}</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Род (genus):</label>
            <input
              type="text"
              value={formData.genus}
              onChange={(e) => setFormData({...formData, genus: e.target.value})}
              required
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Вид (species):</label>
            <input
              type="text"
              value={formData.species}
              onChange={(e) => setFormData({...formData, species: e.target.value})}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Подвид (subspecies):</label>
            <input
              type="text"
              value={formData.subspecies}
              onChange={(e) => setFormData({...formData, subspecies: e.target.value})}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Отображаемое имя:</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({...formData, display_name: e.target.value})}
              placeholder="Оставьте пустым для автоматического формирования"
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={() => { resetForm(); onClose(); }} style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Отмена</button>
            <button type="submit" style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Сохранить</button>
          </div>
        </form>
        
        {taxa.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
            <h3>Список таксонов</h3>
            <ul style={{ maxHeight: '300px', overflow: 'auto', paddingLeft: '20px' }}>
              {taxa.map(t => (
                <li key={t.guid} style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>{t.genus}</strong> {t.species || ''} {t.subspecies || ''}</span>
                  <div>
                    <button onClick={() => handleEdit(t)} style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✏️</button>
                    <button onClick={() => handleDelete(t.guid)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaxonManager;
