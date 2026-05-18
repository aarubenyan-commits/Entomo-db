import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const ExportModal = ({ onClose, filters }) => {
  const [exportType, setExportType] = useState('points');
  const [exporting, setExporting] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState({
    latitude: true,
    longitude: true,
    latitude_dms: false,
    longitude_dms: false,
    location_original: true,
    date_text: true,
    collector: true,
    taxa: true,
    sources: true
  });

  const toggleColumn = (column) => {
    setSelectedColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const handleExport = async () => {
    setExporting(true);
    
    try {
      let url = '';
      if (exportType === 'points') {
        // Собираем параметры фильтров
        const params = new URLSearchParams();
        if (filters?.year) params.append('year', filters.year);
        if (filters?.month) params.append('month', filters.month);
        if (filters?.day) params.append('day', filters.day);
        if (filters?.collector) params.append('collector', filters.collector);
        
        url = `${API_URL}/export/points?${params.toString()}`;
      } else if (exportType === 'taxa') {
        url = `${API_URL}/export/taxa`;
      } else if (exportType === 'studies') {
        url = `${API_URL}/export/studies`;
      }
      
      // Скачиваем файл
      const response = await axios.get(url, {
        responseType: 'blob'
      });
      
      // Создаём ссылку для скачивания
      const blob = new Blob([response.data], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `entomo_export_${exportType}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      onClose();
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      alert('Ошибка при экспорте данных');
    } finally {
      setExporting(false);
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
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '500px',
        maxWidth: '90%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Экспорт данных</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✖️</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Тип данных:</label>
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="points">Точки сбора</option>
            <option value="taxa">Таксоны</option>
            <option value="studies">Исследования</option>
          </select>
        </div>

        {exportType === 'points' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Колонки для экспорта:</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.latitude} onChange={() => toggleColumn('latitude')} />
                Широта (дес.)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.longitude} onChange={() => toggleColumn('longitude')} />
                Долгота (дес.)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.latitude_dms} onChange={() => toggleColumn('latitude_dms')} />
                Широта (DMS)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.longitude_dms} onChange={() => toggleColumn('longitude_dms')} />
                Долгота (DMS)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.location_original} onChange={() => toggleColumn('location_original')} />
                Описание места
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.date_text} onChange={() => toggleColumn('date_text')} />
                Дата
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.collector} onChange={() => toggleColumn('collector')} />
                Сборщик
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.taxa} onChange={() => toggleColumn('taxa')} />
                Таксоны
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={selectedColumns.sources} onChange={() => toggleColumn('sources')} />
                Источники
              </label>
            </div>
          </div>
        )}

        {filters?.year || filters?.month || filters?.day || filters?.collector ? (
          <div style={{ marginBottom: '20px', padding: '10px', background: '#e8f4f8', borderRadius: '4px' }}>
            <strong>🔍 Активные фильтры:</strong>
            <ul style={{ margin: '8px 0 0 20px', fontSize: '12px' }}>
              {filters.year && <li>Год: {filters.year}</li>}
              {filters.month && <li>Месяц: {filters.month}</li>}
              {filters.day && <li>День: {filters.day}</li>}
              {filters.collector && <li>Сборщик: {filters.collector}</li>}
            </ul>
          </div>
        ) : (
          <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}>
            📊 Будут экспортированы все данные
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {exporting ? 'Экспорт...' : '📥 Экспортировать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
