import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const ExportModal = ({ onClose, filters }) => {
  const [exporting, setExporting] = useState(false);
  
  // Все доступные колонки для экспорта
  const [selectedColumns, setSelectedColumns] = useState({
    // Геоданные
    latitude: true,
    longitude: true,
    latitude_dms: true,
    longitude_dms: true,
    // Локация и дата
    location_original: true,
    date_text: true,
    // Связи
    collector_name: true,
    taxa: true,
    source: true
  });

  const toggleColumn = (column) => {
    setSelectedColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const toggleAll = () => {
    const allSelected = Object.values(selectedColumns).every(v => v === true);
    const newState = {};
    Object.keys(selectedColumns).forEach(key => {
      newState[key] = !allSelected;
    });
    setSelectedColumns(newState);
  };

  const handleExport = async () => {
    setExporting(true);
    
    try {
      // Отправляем выбранные колонки на бэкенд
      const response = await axios.post(`${API_URL}/export/points`, {
        filters: {
          year: filters?.year || '',
          month: filters?.month || '',
          day: filters?.day || '',
          collector: filters?.collector || ''
        },
        columns: selectedColumns
      }, {
        responseType: 'blob'
      });
      
      // Создаём ссылку для скачивания
      const blob = new Blob([response.data], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `entomo_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      onClose();
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      alert('Ошибка при экспорте данных: ' + (error.response?.data?.detail || error.message));
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
        padding: '24px',
        borderRadius: '12px',
        width: '550px',
        maxWidth: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>📤 Экспорт данных</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}>✖️</button>
        </div>

        {/* Фильтры */}
        {(filters?.year || filters?.month || filters?.day || filters?.collector) && (
          <div style={{ marginBottom: '20px', padding: '12px', background: '#e8f4f8', borderRadius: '8px', borderLeft: '4px solid #2196F3' }}>
            <strong>🔍 Активные фильтры:</strong>
            <ul style={{ margin: '8px 0 0 20px', fontSize: '12px' }}>
              {filters.year && <li>Год: {filters.year}</li>}
              {filters.month && <li>Месяц: {filters.month}</li>}
              {filters.day && <li>День: {filters.day}</li>}
              {filters.collector && <li>Сборщик: {filters.collector}</li>}
            </ul>
          </div>
        )}

        {/* Выбор колонок */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>📋 Выберите колонки для экспорта:</label>
            <button 
              onClick={toggleAll}
              style={{ 
                padding: '4px 12px', 
                fontSize: '11px', 
                background: '#e9ecef', 
                border: '1px solid #dee2e6', 
                borderRadius: '4px', 
                cursor: 'pointer' 
              }}
            >
              {Object.values(selectedColumns).every(v => v === true) ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '10px',
            padding: '12px',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.latitude} onChange={() => toggleColumn('latitude')} />
              <span>🌐 Широта (дес.)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.longitude} onChange={() => toggleColumn('longitude')} />
              <span>🌐 Долгота (дес.)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.latitude_dms} onChange={() => toggleColumn('latitude_dms')} />
              <span>🗺️ Широта (DMS)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.longitude_dms} onChange={() => toggleColumn('longitude_dms')} />
              <span>🗺️ Долгота (DMS)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.location_original} onChange={() => toggleColumn('location_original')} />
              <span>📍 Описание места</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.date_text} onChange={() => toggleColumn('date_text')} />
              <span>📅 Дата</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.collector_name} onChange={() => toggleColumn('collector_name')} />
              <span>👤 Сборщик(и)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.taxa} onChange={() => toggleColumn('taxa')} />
              <span>🔬 Таксоны</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={selectedColumns.source} onChange={() => toggleColumn('source')} />
              <span>📚 Источник(и)</span>
            </label>
          </div>
        </div>

        <div style={{ 
          marginBottom: '20px', 
          padding: '10px', 
          background: '#fff3cd', 
          borderRadius: '6px', 
          fontSize: '12px',
          borderLeft: '3px solid #ffc107'
        }}>
          💡 <strong>Совет:</strong> При экспорте всех колонок файл будет совместим с мастером импорта.
          Вы сможете загрузить его обратно без изменений.
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
          >
            Отмена
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ 
              padding: '10px 24px', 
              background: '#27ae60', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? 0.7 : 1,
              fontSize: '14px'
            }}
          >
            {exporting ? '⏳ Экспорт...' : '📥 Экспортировать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;