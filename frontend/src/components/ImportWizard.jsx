import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const ImportWizard = ({ onClose, onImportComplete }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState({ rows: [], total: 0 });
  const [validationResults, setValidationResults] = useState([]);
  const [editableRows, setEditableRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setLoading(true);
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
      const response = await axios.post(`${API_URL}/import/parse-file`, formData);
      setPreviewData(response.data);
      setEditableRows(response.data.rows.map((row, idx) => ({ ...row, _idx: idx })));
      setStep(2);
    } catch (error) {
      alert('Ошибка при разборе файла: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/import/validate`, { rows: editableRows });
      setValidationResults(response.data.results);
      setStep(3);
    } catch (error) {
      alert('Ошибка валидации: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/import/confirm`, { rows: editableRows });
      setImportResult(response.data);
      if (onImportComplete) onImportComplete();
    } catch (error) {
      alert('Ошибка импорта: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateCell = (rowIdx, field, value) => {
    const newRows = [...editableRows];
    newRows[rowIdx][field] = value;
    setEditableRows(newRows);
  };

  const getRowStatus = (rowNum) => {
    const result = validationResults.find(r => r.row === rowNum);
    if (!result) return { status: 'pending', message: '' };
    if (!result.valid) return { status: 'error', message: result.errors.join(', ') };
    if (result.warnings?.length) return { status: 'warning', message: result.warnings.join(', ') };
    return { status: 'success', message: 'Готово к импорту' };
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '1400px',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
          <h2 style={{ margin: 0 }}>Импорт данных</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✖️</button>
        </div>

        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              border: '2px dashed #ccc',
              borderRadius: '8px',
              padding: '40px',
              textAlign: 'center',
              width: '400px'
            }}>
              <p>📁 Перетащите файл сюда или нажмите для выбора</p>
              <p style={{ fontSize: '12px', color: '#666' }}>Поддерживаются форматы: .txt, .csv</p>
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileSelect}
                style={{ marginTop: '10px' }}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: '10px', flexShrink: 0 }}>
              <button onClick={() => setStep(1)} style={{ marginRight: '10px' }}>← Назад</button>
              <button onClick={handleValidate} disabled={loading} style={{ background: '#3498db', color: 'white', padding: '8px 16px' }}>
                {loading ? 'Проверка...' : 'Проверить данные →'}
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>#</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Широта</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Долгота</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Род (genus)</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Вид (species)</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Подвид (subspecies)</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Отображаемое имя</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Описание места</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Дата</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Сборщик</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Источник</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Примечания</th>
                  </tr>
                </thead>
                <tbody>
                  {editableRows.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>{idx + 1}</td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.latitude || ''} onChange={(e) => updateCell(idx, 'latitude', e.target.value)} style={{ width: '100px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.longitude || ''} onChange={(e) => updateCell(idx, 'longitude', e.target.value)} style={{ width: '100px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.genus || ''} onChange={(e) => updateCell(idx, 'genus', e.target.value)} style={{ width: '100px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.species || ''} onChange={(e) => updateCell(idx, 'species', e.target.value)} style={{ width: '100px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.subspecies || ''} onChange={(e) => updateCell(idx, 'subspecies', e.target.value)} style={{ width: '100px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.display_name || ''} onChange={(e) => updateCell(idx, 'display_name', e.target.value)} style={{ width: '150px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.location_original || ''} onChange={(e) => updateCell(idx, 'location_original', e.target.value)} style={{ width: '200px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.date_text || ''} onChange={(e) => updateCell(idx, 'date_text', e.target.value)} style={{ width: '100px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.collector_name || ''} onChange={(e) => updateCell(idx, 'collector_name', e.target.value)} style={{ width: '120px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.source || row.study_title || ''} onChange={(e) => updateCell(idx, 'source', e.target.value)} style={{ width: '150px' }} />
                      </td>
                      <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                        <input type="text" value={row.notes || ''} onChange={(e) => updateCell(idx, 'notes', e.target.value)} style={{ width: '150px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', flexShrink: 0 }}>
              Всего записей: {editableRows.length}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: '10px', flexShrink: 0 }}>
              <button onClick={() => setStep(2)} style={{ marginRight: '10px' }}>← Назад</button>
              <button onClick={handleConfirm} disabled={loading} style={{ background: '#27ae60', color: 'white', padding: '8px 16px' }}>
                {loading ? 'Импорт...' : '✅ Подтвердить импорт'}
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>№</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Статус</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Сообщение</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Таксон</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Координаты</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {validationResults.map((result, idx) => {
                    const row = editableRows[idx];
                    const status = getRowStatus(result.row);
                    const statusColor = status.status === 'error' ? '#f8d7da' : status.status === 'warning' ? '#fff3cd' : '#d4edda';
                    const statusText = status.status === 'error' ? '❌ Ошибка' : status.status === 'warning' ? '⚠️ Предупреждение' : '✅ Готово';
                    
                    return (
                      <tr key={idx} style={{ backgroundColor: statusColor }}>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{idx + 1}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{statusText}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{status.message || '—'}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{row.display_name || `${row.genus} ${row.species || ''}`}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{row.latitude}, {row.longitude}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{row.source || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {importResult && (
              <div style={{ marginTop: '10px', padding: '10px', background: '#d4edda', borderRadius: '4px', flexShrink: 0 }}>
                <strong>✅ {importResult.message}</strong>
                {importResult.errors?.length > 0 && (
                  <div style={{ marginTop: '5px', color: '#721c24', background: '#f8d7da', padding: '5px' }}>
                    <strong>Ошибки:</strong>
                    <ul>{importResult.errors.map((e, i) => <li key={i}>Строка {e.row}: {e.error}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ImportWizard;
