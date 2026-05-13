import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const API_URL = 'http://127.0.0.1:8000';

const CollectorManager = ({ onClose, onUpdate }) => {
  const [collectors, setCollectors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [selectedPoints, setSelectedPoints] = useState(new Set());

  const loadCollectors = async () => {
    const res = await axios.get(`${API_URL}/persons`);
    setCollectors(res.data);
  };

  useEffect(() => {
    loadCollectors();
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await axios.post(`${API_URL}/persons?display_name=${encodeURIComponent(newName)}`);
    setNewName('');
    loadCollectors();
  };

  const handleEdit = (guid, name) => {
    setEditingId(guid);
    setEditName(name);
  };

  const handleSave = async (guid) => {
    if (!editName.trim()) return;
    await axios.put(`${API_URL}/persons/${guid}?display_name=${encodeURIComponent(editName)}`);
    setEditingId(null);
    loadCollectors();
  };

  const handleDeleteClick = async (collector) => {
    try {
      const pointsRes = await axios.get(`${API_URL}/persons/${collector.guid}/points`);
      const points = pointsRes.data;
      if (points.length === 0) {
        if (window.confirm(`Удалить сборщика "${collector.display_name}"?`)) {
          await axios.delete(`${API_URL}/persons/${collector.guid}`);
          loadCollectors();
          if (onUpdate) onUpdate();
        }
      } else {
        setDeleteDialog({
          collector,
          points,
          replacementId: null,
        });
        setSelectedPoints(new Set(points.map(p => p.guid)));
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка при проверке связей');
    }
  };

  const togglePoint = (guid) => {
    const newSet = new Set(selectedPoints);
    if (newSet.has(guid)) newSet.delete(guid);
    else newSet.add(guid);
    setSelectedPoints(newSet);
  };

  const confirmReplace = async () => {
    const { collector, replacementId } = deleteDialog;
    if (!replacementId) {
      alert('Выберите сборщика для замены');
      return;
    }
    const replacementCollector = collectors.find(c => c.guid === replacementId);
    if (!replacementCollector) return;

    const confirmAll = window.confirm(`Заменить сборщика "${collector.display_name}" на "${replacementCollector.display_name}" во ВСЕХ точках?\n(Выбрано ${selectedPoints.size} из ${deleteDialog.points.length})`);
    if (!confirmAll) return;

    await axios.delete(`${API_URL}/persons/${collector.guid}?replace_with=${encodeURIComponent(replacementCollector.display_name)}`);
    loadCollectors();
    if (onUpdate) onUpdate();
    setDeleteDialog(null);
  };

  const closeDialog = () => setDeleteDialog(null);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '700px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3>Управление сборщиками</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
          <input type="text" placeholder="Новый сборщик" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1, padding: '8px' }} />
          <button onClick={handleAdd} style={{ padding: '8px 16px' }}>➕ Добавить</button>
        </div>
        <hr />
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {collectors.map((c, idx) => (
            <li key={c.guid} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ minWidth: '30px' }}>{idx+1}.</span>
              {editingId === c.guid ? (
                <>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1 }} />
                  <button onClick={() => handleSave(c.guid)}>💾</button>
                  <button onClick={() => setEditingId(null)}>❌</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1 }}>{c.display_name}</span>
                  <button onClick={() => handleEdit(c.guid, c.display_name)}>✏️</button>
                  <button onClick={() => handleDeleteClick(c)} style={{ color: 'red' }}>🗑️</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={() => { if (onUpdate) onUpdate(); onClose(); }}>Закрыть</button>
        </div>
      </div>

      {deleteDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200
        }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '700px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3>Удаление сборщика «{deleteDialog.collector.display_name}»</h3>
            <p>Выберите точки, в которых нужно заменить сборщика (остальным связь будет удалена):</p>
            <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #ccc', marginBottom: '15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f0f0f0' }}>
                  <tr><th style={{ width: '30px' }}><input type="checkbox" checked={selectedPoints.size === deleteDialog.points.length} onChange={() => {
                    if (selectedPoints.size === deleteDialog.points.length) setSelectedPoints(new Set());
                    else setSelectedPoints(new Set(deleteDialog.points.map(p => p.guid)));
                  }} /></th><th>Точка</th><th>Дата</th></tr>
                </thead>
                <tbody>
                  {deleteDialog.points.map(p => (
                    <tr key={p.guid}>
                      <td><input type="checkbox" checked={selectedPoints.has(p.guid)} onChange={() => togglePoint(p.guid)} /></td>
                      <td>{p.location_original}</td>
                      <td>{p.display_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Выберите сборщика, на которого заменить в выбранных точках:</p>
            <Select
              options={collectors.filter(c => c.guid !== deleteDialog.collector.guid).map(c => ({ value: c.guid, label: c.display_name }))}
              onChange={(selected) => setDeleteDialog({ ...deleteDialog, replacementId: selected?.value })}
              placeholder="Выберите замену..."
              isClearable
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={closeDialog}>Отмена</button>
              <button onClick={confirmReplace} style={{ background: '#e74c3c', color: 'white' }}>Заменить в выбранных и удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectorManager;
