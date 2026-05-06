import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const PersonManager = ({ persons, onClose, onUpdate }) => {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const handleEdit = (person) => {
    setEditingId(person.guid);
    setEditName(person.full_name);
  };

  const handleSave = async (guid) => {
    if (!editName.trim()) {
      alert('Имя не может быть пустым');
      return;
    }
    try {
      await axios.put(`${API_URL}/persons/${guid}`, { full_name: editName });
      onUpdate();
      setEditingId(null);
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (guid, name) => {
    if (window.confirm(`Удалить сборщика "${name}"? Все связанные с ним точки останутся, но поле сборщика будет очищено.`)) {
      try {
        await axios.delete(`${API_URL}/persons/${guid}`);
        onUpdate();
      } catch (err) {
        alert('Ошибка удаления: ' + (err.response?.data?.detail || err.message));
      }
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
        width: '500px',
        maxHeight: '80vh',
        overflow: 'auto',
      }}>
        <h2>Управление сборщиками</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px' }}>ФИО</th>
              <th style={{ width: '100px' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {persons.map(p => (
              <tr key={p.guid} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={{ padding: '8px' }}>
                  {editingId === p.guid ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ width: '100%', padding: '4px' }}
                    />
                  ) : (
                    p.full_name
                  )}
                </td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                  {editingId === p.guid ? (
                    <>
                      <button onClick={() => handleSave(p.guid)} style={{ marginRight: '8px', background: '#27ae60', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>💾</button>
                      <button onClick={() => setEditingId(null)} style={{ background: '#95a5a6', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>✖️</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', marginRight: '8px' }}>✏️</button>
                      <button onClick={() => handleDelete(p.guid, p.full_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>🗑️</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};

export default PersonManager;
