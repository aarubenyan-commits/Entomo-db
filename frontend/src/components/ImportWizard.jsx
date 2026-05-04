import React, { useState } from 'react';
import axios from 'axios';
import Papa from 'papaparse';

const API_URL = 'http://127.0.0.1:8000';

const ImportWizard = ({ onClose, onImport }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [mapping, setMapping] = useState({});
  const [step, setStep] = useState(1);

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    setFile(f);
    Papa.parse(f, { header: true, preview: 5, complete: (result) => {
      setPreview(result.data);
      setStep(2);
    }});
  };

  const handleMappingChange = (field, column) => {
    setMapping({ ...mapping, [field]: column });
  };

  const handleImport = async () => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    await axios.post(`${API_URL}/import/csv`, formData);
    onImport();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', width: '600px' }}>
        <h3>Импорт данных</h3>
        {step === 1 && (
          <div><input type="file" accept=".csv" onChange={handleFileUpload} /></div>
        )}
        {step === 2 && (
          <div>
            <p>Сопоставьте колонки с полями системы:</p>
            {preview.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr>{Object.keys(preview[0]).map(col => <th key={col}>{col}</th>)}</tr></thead>
                <tbody>{preview.map((row, i) => <tr key={i}>{Object.values(row).map((val, j) => <td key={j}>{val}</td>)}</tr>)}</tbody>
              </table>
            )}
            <div style={{ marginTop: '10px' }}>
              <label>Место сбора: <select onChange={(e) => handleMappingChange('location', e.target.value)}><option value="">—</option>{Object.keys(preview[0] || {}).map(col => <option key={col}>{col}</option>)}</select></label>
              <label>Дата: <select onChange={(e) => handleMappingChange('date', e.target.value)}><option value="">—</option>{Object.keys(preview[0] || {}).map(col => <option key={col}>{col}</option>)}</select></label>
              <label>Сборщик: <select onChange={(e) => handleMappingChange('collector', e.target.value)}><option value="">—</option>{Object.keys(preview[0] || {}).map(col => <option key={col}>{col}</option>)}</select></label>
            </div>
            <button onClick={handleImport} style={{ marginTop: '10px', background: '#27ae60', color: 'white', border: 'none', padding: '8px 16px' }}>Импортировать</button>
          </div>
        )}
        <button onClick={onClose} style={{ marginTop: '10px', marginLeft: '10px' }}>Отмена</button>
      </div>
    </div>
  );
};

export default ImportWizard;
