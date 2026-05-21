import React, { useState, useRef, useEffect } from 'react';
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
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, rowIdx: null, field: null });
  const [internalBuffer, setInternalBuffer] = useState({ value: null, field: null });
  const [columnWidths, setColumnWidths] = useState({
    genus: 100,
    species: 100,
    subspecies: 100,
    display_name: 180,
    location_original: 250,
    date_text: 100,
    collector_name: 120,
    source: 180,
    notes: 200,
    latitude: 100,
    longitude: 100
  });
  const [resizingColumn, setResizingColumn] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const [rowHeights, setRowHeights] = useState({});
  
  const tableRef = useRef(null);
  const inputRefs = useRef({});
  const textareaRefs = useRef({});

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
    if (!editableRows || editableRows.length === 0) {
      alert("Нет данных для валидации. Пожалуйста, загрузите файл.");
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/import/validate`, { rows: editableRows });
      if (response.data.error) {
        alert(response.data.error);
        return;
      }
      setValidationResults(response.data.results || []);
      
      // Подсчитываем количество ошибок и предупреждений
      const errorCount = response.data.results.filter(r => !r.valid).length;
      const warningCount = response.data.results.reduce((sum, r) => sum + (r.warnings?.length || 0), 0);
      
      if (errorCount > 0) {
        alert(`Найдено ${errorCount} строк с ошибками. Пожалуйста, исправьте их перед импортом.`);
      } else if (warningCount > 0) {
        alert(`Найдено ${warningCount} предупреждений. Вы можете продолжить импорт.`);
      } else {
        alert("Валидация успешно завершена. Данные готовы к импорту.");
      }
      
      setStep(3);
    } catch (error) {
      console.error("Ошибка валидации:", error);
      alert("Ошибка валидации: " + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };


  const handleConfirm = async () => {
    if (!editableRows || editableRows.length === 0) {
      alert('Нет данных для импорта');
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/import/confirm`, { rows: editableRows });
      setImportResult(response.data);
      if (onImportComplete) onImportComplete();
    } catch (error) {
      alert('Ошибка импорта: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const updateCell = (rowIdx, field, value) => {
    const newRows = [...editableRows];
    newRows[rowIdx][field] = value;
    setEditableRows(newRows);
    setRowHeights(prev => ({ ...prev, [rowIdx]: null }));
  };

  const deleteRow = (rowIdx) => {
    if (window.confirm(`Удалить строку ${rowIdx + 1}?`)) {
      const newRows = [...editableRows];
      newRows.splice(rowIdx, 1);
      setEditableRows(newRows);
      const newRowHeights = {};
      Object.keys(rowHeights).forEach(key => {
        const k = parseInt(key);
        if (k < rowIdx) newRowHeights[k] = rowHeights[k];
        if (k > rowIdx) newRowHeights[k - 1] = rowHeights[k];
      });
      setRowHeights(newRowHeights);
    }
  };

  const addNewRow = () => {
    const newRow = {
      latitude: '', longitude: '', location_original: '', date_text: '',
      collector_name: '', genus: '', species: '', subspecies: '',
      display_name: '', notes: '', source: ''
    };
    setEditableRows([...editableRows, newRow]);
  };

  const copyDownColumn = (rowIdx, field) => {
    const value = editableRows[rowIdx][field];
    if (value === undefined || value === null) return;
    const newRows = [...editableRows];
    for (let i = rowIdx + 1; i < newRows.length; i++) {
      newRows[i][field] = value;
    }
    setEditableRows(newRows);
  };

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      return true;
    } catch (err) {
      console.error('Ошибка копирования в буфер:', err);
      return false;
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch (err) {
      console.error('Ошибка вставки из буфера:', err);
      return null;
    }
  };

  const handleKeyDown = async (e, rowIdx, field, currentValue) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      await copyToClipboard(currentValue || '');
      setInternalBuffer({ value: currentValue, field, rowIdx });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      const pastedText = await pasteFromClipboard();
      if (pastedText !== null) {
        updateCell(rowIdx, field, pastedText);
        setInternalBuffer({ value: pastedText, field, rowIdx });
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      copyDownColumn(rowIdx, field);
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      updateCell(rowIdx, field, '');
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const fields = ['genus', 'species', 'subspecies', 'display_name', 'location_original', 'date_text', 'collector_name', 'source', 'notes', 'latitude', 'longitude'];
      const currentIndex = fields.indexOf(field);
      if (currentIndex < fields.length - 1) {
        const nextField = fields[currentIndex + 1];
        const nextInput = inputRefs.current[`${rowIdx}-${nextField}`];
        if (nextInput) nextInput.focus();
      }
    }
  };

  const handleContextMenu = (e, rowIdx, field, value) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, rowIdx, field, value });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, rowIdx: null, field: null });
  };

  const contextMenuAction = async (action) => {
    if (contextMenu.rowIdx === null) return;
    switch (action) {
      case 'copy':
        await copyToClipboard(contextMenu.value);
        setInternalBuffer({ value: contextMenu.value, field: contextMenu.field, rowIdx: contextMenu.rowIdx });
        break;
      case 'paste':
        const pastedText = await pasteFromClipboard();
        if (pastedText !== null) {
          updateCell(contextMenu.rowIdx, contextMenu.field, pastedText);
        }
        break;
      case 'copyDown':
        copyDownColumn(contextMenu.rowIdx, contextMenu.field);
        break;
      case 'delete':
        updateCell(contextMenu.rowIdx, contextMenu.field, '');
        break;
      case 'deleteRow':
        deleteRow(contextMenu.rowIdx);
        break;
    }
    closeContextMenu();
  };

  const startResize = (e, columnKey, currentWidth) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    setStartX(e.clientX);
    setStartWidth(currentWidth);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  };

  const handleMouseMove = (e) => {
    if (resizingColumn === null) return;
    const delta = e.clientX - startX;
    const newWidth = Math.max(60, startWidth + delta);
    setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
  };

  const stopResize = () => {
    setResizingColumn(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
  };

  const updateRowHeight = (rowIdx) => {
    const fields = ['display_name', 'location_original', 'notes', 'source'];
    let maxHeight = 40;
    fields.forEach(field => {
      const textarea = textareaRefs.current[`${rowIdx}-${field}`];
      if (textarea) {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.max(40, scrollHeight)}px`;
        maxHeight = Math.max(maxHeight, scrollHeight);
      }
    });
    setRowHeights(prev => ({ ...prev, [rowIdx]: maxHeight }));
  };

  useEffect(() => {
    if (step !== 2) return;
    setTimeout(() => {
      if (editableRows && editableRows.length > 0) {
        editableRows.forEach((_, idx) => updateRowHeight(idx));
      }
    }, 100);
  }, [editableRows, step]);

  useEffect(() => {
    if (step !== 2) return;
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      stopResize();
    };
  }, [step]);

  useEffect(() => {
    return () => stopResize();
  }, []);

  const getRowStatus = (rowNum) => {
    if (!validationResults || validationResults.length === 0) {
      return { status: 'pending', message: 'Ожидание валидации' };
    }
    const result = validationResults.find(r => r.row === rowNum);
    if (!result) return { status: 'pending', message: '' };
    if (!result.valid) return { status: 'error', message: result.errors?.join(', ') || 'Ошибка' };
    if (result.warnings?.length) return { status: 'warning', message: result.warnings.join(', ') };
    return { status: 'success', message: 'Готово к импорту' };
  };

  const columns = [
    { key: 'genus', label: 'Род', multiline: false },
    { key: 'species', label: 'Вид', multiline: false },
    { key: 'subspecies', label: 'Подвид', multiline: false },
    { key: 'display_name', label: 'Отображаемое имя', multiline: true },
    { key: 'location_original', label: 'Описание места', multiline: true },
    { key: 'date_text', label: 'Дата', multiline: false },
    { key: 'collector_name', label: 'Сборщик', multiline: false },
    { key: 'source', label: 'Источник', multiline: true },
    { key: 'notes', label: 'Примечания', multiline: true },
    { key: 'latitude', label: 'Широта', multiline: false },
    { key: 'longitude', label: 'Долгота', multiline: false }
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }} onClick={closeContextMenu}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '95%', maxWidth: '1600px', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexShrink: 0 }}>
          <h2 style={{ margin: 0 }}>Импорт данных</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✖️</button>
        </div>

        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ border: '2px dashed #ccc', borderRadius: '8px', padding: '40px', textAlign: 'center', width: '400px' }}>
              <p style={{ fontSize: '16px' }}>📁 Перетащите файл сюда или нажмите для выбора</p>
              <p style={{ fontSize: '12px', color: '#666' }}>Поддерживаются форматы: .txt, .csv</p>
              <input type="file" accept=".txt,.csv" onChange={handleFileSelect} style={{ marginTop: '15px' }} />
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: '10px', flexShrink: 0, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setStep(1)} style={{ padding: '6px 12px', cursor: 'pointer' }}>← Назад</button>
              <button onClick={addNewRow} style={{ background: '#28a745', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>➕ Добавить строку</button>
              <button onClick={handleValidate} disabled={loading} style={{ background: '#3498db', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {loading ? 'Проверка...' : 'Проверить данные →'}
              </button>
            </div>
            <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#e8f4f8', borderLeft: '4px solid #2196F3', borderRadius: '4px', fontSize: '12px', flexShrink: 0 }}>
              <strong>💡 Горячие клавиши:</strong>
              <span style={{ marginLeft: '15px' }}>Ctrl+C — копировать</span>
              <span style={{ marginLeft: '15px' }}>Ctrl+V — вставить</span>
              <span style={{ marginLeft: '15px' }}>Ctrl+D — заполнить вниз</span>
              <span style={{ marginLeft: '15px' }}>Delete — очистить</span>
              <span style={{ marginLeft: '15px' }}>Tab — следующая ячейка</span>
              <span style={{ marginLeft: '15px' }}>ПКМ — меню</span>
              <span style={{ marginLeft: '15px' }}>🖱️ Перетащите границу столбца — изменить ширину</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '1200px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '8px', border: '1px solid #ddd', width: '40px', position: 'relative' }}>#</th>
                      {columns.map(col => (
                        <th key={col.key} style={{ padding: '8px', border: '1px solid #ddd', width: columnWidths[col.key], position: 'relative', userSelect: 'none' }}>
                          {col.label}
                          <div style={{ position: 'absolute', right: -4, top: 0, width: 8, height: '100%', cursor: 'col-resize', zIndex: 10 }} onMouseDown={(e) => startResize(e, col.key, columnWidths[col.key])} />
                        </th>
                      ))}
                      <th style={{ padding: '8px', border: '1px solid #ddd', width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableRows && editableRows.length > 0 ? editableRows.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee', height: rowHeights[idx] || 'auto' }}>
                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', background: '#f9f9f9', verticalAlign: 'top' }}>{idx + 1}</td>
                        {columns.map(col => (
                          <td key={col.key} style={{ padding: '4px', border: '1px solid #ddd', width: columnWidths[col.key], verticalAlign: 'top' }}>
                            {col.multiline ? (
                              <textarea
                                ref={el => { if (el) textareaRefs.current[`${idx}-${col.key}`] = el; }}
                                value={row[col.key] || ''}
                                onChange={(e) => {
                                  updateCell(idx, col.key, e.target.value);
                                  setTimeout(() => updateRowHeight(idx), 10);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, idx, col.key, row[col.key])}
                                onContextMenu={(e) => handleContextMenu(e, idx, col.key, row[col.key])}
                                style={{ width: '100%', border: 'none', padding: '6px 4px', background: 'transparent', outline: 'none', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', overflow: 'hidden', minHeight: '40px' }}
                                rows={1}
                              />
                            ) : (
                              <input
                                ref={el => { if (el) inputRefs.current[`${idx}-${col.key}`] = el; }}
                                type="text"
                                value={row[col.key] || ''}
                                onChange={(e) => updateCell(idx, col.key, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, idx, col.key, row[col.key])}
                                onContextMenu={(e) => handleContextMenu(e, idx, col.key, row[col.key])}
                                style={{ width: '100%', border: 'none', padding: '6px 4px', background: 'transparent', outline: 'none', fontSize: '12px' }}
                              />
                            )}
                          </td>
                        ))}
                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'center', verticalAlign: 'top' }}>
                          <button onClick={() => deleteRow(idx)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }} title="Удалить строку">🗑️</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '40px' }}>Нет данных для отображения</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', flexShrink: 0 }}>
              Всего записей: {editableRows?.length || 0}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: '10px', flexShrink: 0 }}>
              <button onClick={() => setStep(2)} style={{ marginRight: '10px', padding: '6px 12px', cursor: 'pointer' }}>← Назад</button>
              <button onClick={handleConfirm} disabled={loading} style={{ background: '#27ae60', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {loading ? 'Импорт...' : 'Подтвердить импорт'}
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5' }}>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>№</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Статус</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Сообщение</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Таксон</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Координаты</th>
                    <th style={{ padding: '8px', border: '1px solid #ddd' }}>Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {validationResults && validationResults.length > 0 ? validationResults.map((result, idx) => {
                    const row = editableRows?.[idx];
                    const status = getRowStatus(result.row);
                    const statusColor = status.status === "error" ? "#f8d7da" : status.status === "warning" ? "#fff3cd" : status.status === "success" ? "#d4edda" : "white";
                    const statusText = status.status === "error" ? "❌ Ошибка" : status.status === "warning" ? "⚠️ Предупреждение" : status.status === "success" ? "✅ Готово" : "⏳ Ожидание";
                    return (
                      <tr key={idx} style={{ backgroundColor: statusColor }}>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{idx + 1}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{statusText}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{status.message || '—'}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{row?.display_name || (row?.genus ? row.genus + ' ' + (row.species || '') : '—')}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{row?.latitude || '—'}, {row?.longitude || '—'}</td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{row?.source || '—'}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>Нет результатов валидации</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {importResult && (
              <div style={{ marginTop: '10px', padding: '10px', background: '#d4edda', borderRadius: '4px', flexShrink: 0 }}>
                <strong>✅ {importResult.message}</strong>
                {importResult.warnings && importResult.warnings.length > 0 && (
                  <div style={{ marginTop: '5px', color: '#856404', background: '#fff3cd', padding: '5px', borderRadius: '4px' }}>
                    <strong>⚠️ Предупреждения:</strong>
                    <ul style={{ margin: '5px 0 0 20px' }}>
                      {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {importResult.errors?.length > 0 && (
                  <div style={{ marginTop: '5px', color: '#721c24', background: '#f8d7da', padding: '5px', borderRadius: '4px' }}>
                    <strong>❌ Ошибки:</strong>
                    <ul style={{ margin: '5px 0 0 20px' }}>
                      {importResult.errors.map((e, i) => <li key={i}>Строка {e.row}: {e.error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu.visible && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: 'white', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 2100, minWidth: '150px' }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => contextMenuAction('copy')} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>📋 Копировать</div>
          <div onClick={() => contextMenuAction('paste')} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>📌 Вставить</div>
          <div onClick={() => contextMenuAction('copyDown')} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>⬇️ Заполнить вниз</div>
          <div onClick={() => contextMenuAction('delete')} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>🗑️ Очистить</div>
          <div onClick={() => contextMenuAction('deleteRow')} style={{ padding: '8px 12px', cursor: 'pointer' }}>❌ Удалить строку</div>
        </div>
      )}
    </div>
  );
};

export default ImportWizard;
