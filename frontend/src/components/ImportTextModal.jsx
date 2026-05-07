import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const ImportTextModal = ({ onClose, onImport }) => {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!text.trim()) {
      alert('Введите данные для импорта');
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      const blob = new Blob([text], { type: 'text/plain' });
      formData.append('file', blob, 'import.txt');

      const response = await axios.post(`${API_URL}/import/text`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setResult({
        success: true,
        message: response.data.message,
        count: response.data.imported?.length || 0,
        preview: response.data.imported?.slice(0, 5) || []
      });

      if (onImport) onImport();
    } catch (error) {
      console.error('Import error:', error);
      setResult({
        success: false,
        message: error.response?.data?.detail || 'Ошибка импорта'
      });
    } finally {
      setImporting(false);
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
      zIndex: 1200
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '700px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <h2>Импорт текстовых данных</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
          Вставьте строки в формате:<br />
          <code style={{ background: '#f0f0f0', padding: '2px 4px', borderRadius: '4px' }}>
            Turkey, Mus, valley of Murat Nehri riv., near Yorecik vill., 1640m, 3.VII.2025 leg. D. Fominykh N38°47'09.0001" E41°13'07.6927"
          </code>
        </p>

        <textarea
          rows="12"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Вставляйте строки по одной на строку..."
          style={{
            width: '100%',
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '13px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '15px'
          }}
        />

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '15px' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {importing ? 'Импорт...' : 'Импортировать'}
          </button>
        </div>

        {result && (
          <div style={{
            padding: '12px',
            background: result.success ? '#d5f5e3' : '#fadbd8',
            borderRadius: '4px',
            marginTop: '10px'
          }}>
            <strong>{result.success ? '✅ Успешно!' : '❌ Ошибка'}</strong>
            <p>{result.message}</p>
            {result.success && result.preview && result.preview.length > 0 && (
              <>
                <p style={{ marginTop: '10px', fontWeight: 'bold' }}>Первые 5 точек:</p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px' }}>
                  {result.preview.map((item, idx) => (
                    <li key={idx}>
                      {item.location} — {item.date} — {item.collector}
                      {item.latitude && ` (${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)})`}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportTextModal;
