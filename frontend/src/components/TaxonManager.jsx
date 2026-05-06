import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const TaxonManager = ({ onClose, onUpdate }) => {
  const [taxa, setTaxa] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editGenus, setEditGenus] = useState('');
  const [editSpecies, setEditSpecies] = useState('');
  const [newGenus, setNewGenus] = useState('');
  const [newSpecies, setNewSpecies] = useState('');

  const loadTaxa = async () => {
    const res = await axios.get(`${API_URL}/taxa`);
    setTaxa(res.data);
  };

  useEffect(() => {
    loadTaxa();
  }, []);

  const handleAdd = async () => {
    if (!newGenus.trim()) return;
    await axios.post(`${API_URL}/taxa?genus=${encodeURIComponent(newGenus)}&species=${encodeURIComponent(newSpecies)}`);
    setNewGenus('');
    setNewSpecies('');
    loadTaxa();
    if (onUpdate) onUpdate();
  };

  const handleEdit = (guid, genus, species) => {
    setEditingId(guid);
    setEditGenus(genus);
    setEditSpecies(species || '');
  };

  const handleSave = async (guid) => {
    if (!editGenus.trim()) return;
    await axios.put(`${API_URL}/taxa/${guid}?genus=${encodeURIComponent(editGenus)}&species=${encodeURIComponent(editSpecies)}`);
    setEditingId(null);
    loadTaxa();
    if (onUpdate) onUpdate();
  };

  const handleDelete = async (guid) => {
    if (!window.confirm('Удалить таксон? Все связи с точками будут удалены.')) return;
    await axios.delete(`${API_URL}/taxa/${guid}`);
    loadTaxa();
    if (onUpdate) onUpdate();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100
    }}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '600px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3>Управление таксонами</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <input type="text" placeholder="Род" value={newGenus} onChange={e => setNewGenus(e.target.value)} style={{ flex: 1, padding: '8px' }} />
          <input type="text" placeholder="Вид (опционально)" value={newSpecies} onChange={e => setNewSpecies(e.target.value)} style={{ flex: 1, padding: '8px' }} />
          <button onClick={handleAdd} style={{ padding: '8px 16px' }}>➕ Добавить</button>
        </div>
        <hr />
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {taxa.map((t, idx) => (
            <li key={t.guid} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ minWidth: '30px' }}>{idx+1}.</span>
              {editingId === t.guid ? (
                <>
                  <input type="text" value={editGenus} onChange={e => setEditGenus(e.target.value)} style={{ flex: 1, padding: '6px' }} />
                  <input type="text" value={editSpecies} onChange={e => setEditSpecies(e.target.value)} style={{ flex: 1, padding: '6px' }} />
                  <button onClick={() => handleSave(t.guid)}>💾</button>
                  <button onClick={() => setEditingId(null)}>❌</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 2 }}><strong>{t.genus}</strong> {t.species || ''}</span>
                  <button onClick={() => handleEdit(t.guid, t.genus, t.species)}>✏️</button>
                  <button onClick={() => handleDelete(t.guid)} style={{ color: 'red' }}>🗑️</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};

export default TaxonManager;
