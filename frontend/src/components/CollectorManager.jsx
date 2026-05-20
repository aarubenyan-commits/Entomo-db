import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { IconButton } from './IconLibrary';

const API_URL = 'http://127.0.0.1:8000';

const CollectorManager = ({ onClose, onUpdate }) => {
  const [collectors, setCollectors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [selectedPoints, setSelectedPoints] = useState(new Set());
  const [selectedReplacement, setSelectedReplacement] = useState(null);

  const loadCollectors = async () => {
    const res = await axios.get(`${API_URL}/persons`);
    setCollectors(res.data);
  };

  useEffect(() => {
    loadCollectors();
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    
    const existing = collectors.find(c => c.display_name.toLowerCase() === newName.toLowerCase());
    if (existing) {
      alert(`Сборщик "${newName}" уже существует!`);
      return;
    }
    
    try {
      await axios.post(`${API_URL}/persons?display_name=${encodeURIComponent(newName)}`);
      setNewName('');
      loadCollectors();
      if (onUpdate) onUpdate();
    } catch (error) {
      alert('Ошибка добавления сборщика');
    }
  };

  const handleEdit = (guid, name) => {
    setEditingId(guid);
    setEditName(name);
  };

  const handleSave = async (guid) => {
    if (!editName.trim()) return;
    
    const existing = collectors.find(c => c.display_name.toLowerCase() === editName.toLowerCase() && c.guid !== guid);
    if (existing) {
      alert(`Сборщик "${editName}" уже существует!`);
      return;
    }
    
    try {
      await axios.put(`${API_URL}/persons/${guid}?display_name=${encodeURIComponent(editName)}`);
      setEditingId(null);
      loadCollectors();
      if (onUpdate) onUpdate();
    } catch (error) {
      alert('Ошибка сохранения сборщика');
    }
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
        });
        setSelectedPoints(new Set(points.map(p => p.guid)));
        setSelectedReplacement(null);
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

  const selectAllPoints = () => {
    if (selectedPoints.size === deleteDialog?.points.length) {
      setSelectedPoints(new Set());
    } else {
      setSelectedPoints(new Set(deleteDialog?.points.map(p => p.guid)));
    }
  };

  const confirmReplace = async () => {
    const { collector } = deleteDialog;
    if (!selectedReplacement) {
      alert('Выберите сборщика для замены');
      return;
    }
    const replacementCollector = collectors.find(c => c.guid === selectedReplacement);
    if (!replacementCollector) return;

    const selectedPointsArray = Array.from(selectedPoints);
    if (selectedPointsArray.length === 0) {
      alert('Выберите хотя бы одну точку для замены');
      return;
    }

    const confirmAll = window.confirm(`Заменить сборщика "${collector.display_name}" на "${replacementCollector.display_name}" в выбранных точках?\n(Выбрано ${selectedPointsArray.length} из ${deleteDialog.points.length})`);
    if (!confirmAll) return;

    try {
      // Используем новый эндпоинт bulk-update с replace_person
      const response = await axios.post(`${API_URL}/points/bulk-update`, {
        point_guids: selectedPointsArray,
        updates: {
          replace_person: {
            old_person_guid: collector.guid,
            new_person_guid: replacementCollector.guid
          }
        }
      });
      
      alert(response.data.message);
      loadCollectors();
      if (onUpdate) onUpdate();
      setDeleteDialog(null);
    } catch (error) {
      console.error('Ошибка замены сборщика:', error);
      alert('Ошибка при замене сборщика: ' + (error.response?.data?.detail || error.message));
    }
  };

  const closeDialog = () => setDeleteDialog(null);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '700px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3>Управление сборщиками</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
          <input type="text" placeholder="Новый сборщик" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1, padding: '8px' }} />
          <IconButton icon="Add" label="Добавить" onClick={handleAdd} style={{ background: '#27ae60', color: 'white' }} />
        </div>
        <hr />
        
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '8px', textAlign: 'left', width: '50px' }}>#</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Сборщик</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '100px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map((c, idx) => (
                <tr key={c.guid} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{idx+1}.</td>
                  <td style={{ padding: '8px' }}>
                    {editingId === c.guid ? (
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '4px' }} />
                    ) : (
                      <strong>{c.display_name}</strong>
                    )}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {editingId === c.guid ? (
                      <>
                        <IconButton icon="Save" onClick={() => handleSave(c.guid)} style={{ background: '#27ae60', color: 'white' }} />
                        <IconButton icon="Close" onClick={() => setEditingId(null)} style={{ background: '#95a5a6', color: 'white' }} />
                      </>
                    ) : (
                      <>
                        <IconButton icon="Edit" onClick={() => handleEdit(c.guid, c.display_name)} />
                        <IconButton icon="Delete" onClick={() => handleDeleteClick(c)} style={{ color: '#e74c3c' }} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <IconButton icon="Close" label="Закрыть" onClick={() => { if (onUpdate) onUpdate(); onClose(); }} style={{ background: '#3498db', color: 'white' }} />
        </div>
      </div>

      {/* Диалог удаления сборщика */}
      {deleteDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200
        }}>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '25px', 
            borderRadius: '12px', 
            width: '900px', 
            maxWidth: '90vw', 
            maxHeight: '85vh', 
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#e74c3c' }}>🗑️ Удаление сборщика «{deleteDialog.collector.display_name}»</h3>
              <IconButton icon="Close" onClick={closeDialog} style={{ padding: '4px', fontSize: '20px' }} />
            </div>
            
            <div style={{ marginBottom: '20px', padding: '12px', background: '#fff3cd', borderRadius: '8px', borderLeft: '4px solid #ffc107' }}>
              <strong>⚠️ Внимание!</strong> У этого сборщика есть <strong>{deleteDialog.points.length}</strong> связанных точек.
              Выберите нового сборщика для замены в выбранных точках.
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>📋 Точки сборщика:</h4>
              <div style={{ 
                maxHeight: '300px', 
                overflow: 'auto', 
                border: '1px solid #ddd', 
                borderRadius: '8px',
                background: '#fafafa'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0', zIndex: 1 }}>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ width: '40px', padding: '10px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedPoints.size === deleteDialog.points.length && deleteDialog.points.length > 0}
                          onChange={selectAllPoints}
                        />
                      </th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Точка</th>
                      <th style={{ padding: '10px', textAlign: 'left', width: '120px' }}>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deleteDialog.points.map(p => (
                      <tr key={p.guid} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedPoints.has(p.guid)} 
                            onChange={() => togglePoint(p.guid)}
                          />
                        </td>
                        <td style={{ padding: '10px' }}>{p.location_original || '—'}</td>
                        <td style={{ padding: '10px' }}>{p.display_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>👤 Выберите нового сборщика для замены:</h4>
              <div style={{ 
                maxHeight: '250px', 
                overflow: 'auto', 
                border: '1px solid #ddd', 
                borderRadius: '8px',
                background: '#fafafa'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0', zIndex: 1 }}>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ width: '40px', padding: '10px', textAlign: 'center' }}>✓</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Сборщик</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectors
                      .filter(c => c.guid !== deleteDialog.collector.guid)
                      .map(c => (
                        <tr 
                          key={c.guid} 
                          style={{ 
                            borderBottom: '1px solid #eee',
                            backgroundColor: selectedReplacement === c.guid ? '#e3f2fd' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => setSelectedReplacement(c.guid)}
                        >
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input 
                              type="radio" 
                              name="replacement"
                              checked={selectedReplacement === c.guid}
                              onChange={() => setSelectedReplacement(c.guid)}
                            />
                          </td>
                          <td style={{ padding: '10px' }}>
                            <strong>{c.display_name}</strong>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {collectors.filter(c => c.guid !== deleteDialog.collector.guid).length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', background: '#f9f9f9', borderRadius: '8px' }}>
                  Нет других сборщиков для замены. Сначала создайте нового.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #ddd' }}>
              <IconButton icon="Close" label="Отмена" onClick={closeDialog} style={{ background: '#95a5a6', color: 'white', padding: '10px 20px' }} />
              <IconButton 
                icon="Delete" 
                label={`Заменить в ${selectedPoints.size} точках и удалить`} 
                onClick={confirmReplace} 
                disabled={!selectedReplacement || selectedPoints.size === 0}
                style={{ background: '#e74c3c', color: 'white', padding: '10px 20px' }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectorManager;
