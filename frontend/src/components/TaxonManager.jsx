import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { IconButton } from './IconLibrary';

const API_URL = 'http://127.0.0.1:8000';

const TaxonManager = ({ onClose, onUpdate }) => {
  const [taxa, setTaxa] = useState([]);
  const [editingGuid, setEditingGuid] = useState(null);
  const [showSourcesDialog, setShowSourcesDialog] = useState(false);
  const [currentTaxon, setCurrentTaxon] = useState(null);
  const [sources, setSources] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [showStudyDialog, setShowStudyDialog] = useState(false);
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
      const sorted = res.data.sort((a, b) => {
        const nameA = `${a.genus} ${a.species || ''}`.toLowerCase();
        const nameB = `${b.genus} ${b.species || ''}`.toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
      setTaxa(sorted);
    } catch (error) {
      console.error('Ошибка загрузки таксонов:', error);
    }
  };

  const openStudyDetails = (study) => {
    setSelectedStudy(study);
    setShowStudyDialog(true);
  };

  const loadSources = async (taxonGuid, taxonName) => {
    setCurrentTaxon({ guid: taxonGuid, name: taxonName });
    try {
      const res = await axios.get(`${API_URL}/sources/taxon/${taxonGuid}`);
      setSources(res.data);
      setShowSourcesDialog(true);
    } catch (error) {
      console.error('Ошибка загрузки источников:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.genus.trim()) {
      alert('Укажите род');
      return;
    }
    
    const displayName = formData.display_name || `${formData.genus} ${formData.species || ''} ${formData.subspecies || ''}`.trim();
    const existingTaxon = !editingGuid && taxa.find(t => 
      t.genus.toLowerCase() === formData.genus.toLowerCase() &&
      (t.species || '').toLowerCase() === (formData.species || '').toLowerCase() &&
      (t.subspecies || '').toLowerCase() === (formData.subspecies || '').toLowerCase()
    );
    
    if (existingTaxon) {
      alert(`Таксон "${existingTaxon.display_name}" уже существует!`);
      return;
    }
    
    try {
      let response;
      if (editingGuid) {
        response = await axios.put(`${API_URL}/taxa/${editingGuid}`, formData);
      } else {
        response = await axios.post(`${API_URL}/taxa`, null, {
          params: {
            genus: formData.genus,
            species: formData.species || null,
            subspecies: formData.subspecies || null,
            display_name: formData.display_name || null
          }
        });
      }
      await fetchTaxa();
      if (onUpdate) onUpdate(response?.data?.guid);
      resetForm();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      alert('Ошибка сохранения таксона: ' + (error.response?.data?.detail || error.message));
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
        await fetchTaxa();
        if (onUpdate) onUpdate(false);
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
      zIndex: 1500,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '650px',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>{editingGuid ? 'Редактировать таксон' : 'Новый таксон'}</h2>
          <IconButton icon="Close" onClick={() => { resetForm(); onClose(); }} style={{ padding: '4px', fontSize: '18px' }} />
        </div>
        
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
            <IconButton icon="Close" label="Отмена" onClick={() => { resetForm(); onClose(); }} style={{ background: '#95a5a6', color: 'white' }} />
            <IconButton icon="Save" label="Сохранить" type="submit" style={{ background: '#27ae60', color: 'white' }} />
          </div>
        </form>
        
        {taxa.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
            <h3>Список таксонов</h3>
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Название</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '120px' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {taxa.map(t => (
                    <tr key={t.guid} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px' }}>
                        <strong>{t.genus}</strong> {t.species || ''} {t.subspecies || ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <IconButton icon="Edit" onClick={() => handleEdit(t)} title="Редактировать" />
                        <IconButton icon="Study" onClick={() => loadSources(t.guid, t.display_name)} title="Источники" style={{ color: '#9b59b6' }} />
                        <IconButton icon="Delete" onClick={() => handleDelete(t.guid)} title="Удалить" style={{ color: '#e74c3c' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showStudyDialog && selectedStudy && (
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
            zIndex: 2001,
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              width: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}>
              <h3>Детали исследования</h3>
              <div style={{ marginBottom: '15px' }}><strong>Название:</strong> {selectedStudy.title || selectedStudy.url}</div>
              {selectedStudy.authors && <div style={{ marginBottom: '15px' }}><strong>Автор(ы):</strong> {selectedStudy.authors}</div>}
              {selectedStudy.url && <div style={{ marginBottom: '15px' }}><strong>Ссылка:</strong> <a href={selectedStudy.url} target="_blank" rel="noopener noreferrer">{selectedStudy.url}</a></div>}
              {selectedStudy.description && (
                <div style={{ marginBottom: '15px' }}>
                  <strong>Описание:</strong>
                  <div style={{ marginTop: '5px', padding: '10px', background: '#f9f9f9', borderRadius: '4px', maxHeight: '200px', overflow: 'auto' }}>
                    {selectedStudy.description}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <IconButton icon="Close" label="Закрыть" onClick={() => setShowStudyDialog(false)} style={{ background: '#95a5a6', color: 'white' }} />
              </div>
            </div>
          </div>
        )}

        {showSourcesDialog && (
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
              <h3>Источники данных для таксона: <strong>{currentTaxon?.name}</strong></h3>
              {sources.length === 0 ? (
                <p style={{ color: '#999' }}>Нет привязанных источников</p>
              ) : (
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Название</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Автор(ы)</th>
                       </tr>
                    </thead>
                    <tbody>
                      {sources.map(s => (
                        <tr key={s.link_guid} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => openStudyDetails(s)}>
                          <td style={{ padding: '8px' }}>
                            {s.title ? <strong>{s.title}</strong> : <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a>}
                           </td>
                          <td style={{ padding: '8px' }}>{s.authors || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <IconButton icon="Close" label="Закрыть" onClick={() => setShowSourcesDialog(false)} style={{ background: '#95a5a6', color: 'white' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaxonManager;
