import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LoadScript } from '@react-google-maps/api';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import PointForm from './components/PointForm';
import CollectorManager from './components/CollectorManager';
import TaxonManager from './components/TaxonManager';
import ImportTextModal from './components/ImportTextModal';
import MapView from './components/MapView';
import GraphView from './components/GraphView';

const API_URL = 'http://127.0.0.1:8000';
const MAPS_API_KEY = 'AIzaSyBt-bcHW2_VAjETvUFvfaPPLVhhe9Iqr7E';

const qrCache = new Map();

async function generateQRDataUrl(url, size = 150) {
  if (qrCache.has(url)) return qrCache.get(url);
  try {
    const qrDataUrl = await QRCode.toDataURL(url, { width: size, margin: 1 });
    qrCache.set(url, qrDataUrl);
    return qrDataUrl;
  } catch (error) {
    console.error('QR error:', error);
    return null;
  }
}

function App() {
  const [points, setPoints] = useState([]);
  const [filteredPoints, setFilteredPoints] = useState([]);
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [persons, setPersons] = useState([]);
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterCollector, setFilterCollector] = useState('');
  const [highlightedRows, setHighlightedRows] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showCollectorManager, setShowCollectorManager] = useState(false);
  const [showTaxonManagerGlobal, setShowTaxonManagerGlobal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [initialLat, setInitialLat] = useState(null);
  const [initialLng, setInitialLng] = useState(null);
  const [viewMode, setViewMode] = useState('map');
  const tableBodyRef = useRef(null);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { applyFilters(); }, [points, filterYear, filterMonth, filterDay, filterCollector]);

  const fetchData = async () => {
    try {
      const pointsRes = await axios.get(`${API_URL}/points`);
      setPoints(pointsRes.data);
      const personsRes = await axios.get(`${API_URL}/persons`);
      setPersons(personsRes.data);
    } catch (error) { console.error(error); }
  };

  const applyFilters = () => {
    let filtered = [...points];
    if (filterYear) filtered = filtered.filter(p => p.display_date?.includes(filterYear));
    if (filterMonth) filtered = filtered.filter(p => p.display_date?.match(`\\.${filterMonth}\\.`));
    if (filterDay) filtered = filtered.filter(p => p.display_date?.startsWith(filterDay.padStart(2, '0')));
    if (filterCollector) filtered = filtered.filter(p => p.collector_name?.toLowerCase().includes(filterCollector.toLowerCase()));
    setFilteredPoints(filtered);
  };

  const updateQuantity = (guid, quantity) => {
    const num = parseInt(quantity) || 0;
    if (num <= 0) {
      const newQuantities = { ...selectedQuantities };
      delete newQuantities[guid];
      setSelectedQuantities(newQuantities);
    } else {
      setSelectedQuantities({ ...selectedQuantities, [guid]: num });
    }
  };

  const resetQuantities = () => setSelectedQuantities({});
  const selectAll = () => {
    const newQuantities = {};
    filteredPoints.forEach(p => { newQuantities[p.guid] = 1; });
    setSelectedQuantities(newQuantities);
  };

  const getTotalLabels = () => Object.values(selectedQuantities).reduce((sum, q) => sum + q, 0);

  const scrollToRow = (guid) => {
    if (tableBodyRef.current) {
      const row = tableBodyRef.current.querySelector(`[data-row-guid="${guid}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleRowClick = (guid, lat, lng, event) => {
    const newHighlighted = new Set(highlightedRows);
    if (event.ctrlKey || event.metaKey) {
      if (newHighlighted.has(guid)) newHighlighted.delete(guid);
      else newHighlighted.add(guid);
    } else {
      newHighlighted.clear();
      newHighlighted.add(guid);
    }
    setHighlightedRows(newHighlighted);
  };

  const handleMarkerClick = (guid, lat, lng) => {
    const newHighlighted = new Set(highlightedRows);
    if (newHighlighted.has(guid)) newHighlighted.delete(guid);
    else newHighlighted.add(guid);
    setHighlightedRows(newHighlighted);
    scrollToRow(guid);
  };

  const handleDeletePoint = async (guid, event) => {
    event.stopPropagation();
    if (window.confirm('Удалить эту точку?')) {
      try {
        await axios.delete(`${API_URL}/points/${guid}`);
        fetchData();
      } catch (error) {
        alert('Ошибка удаления');
      }
    }
  };

  const handleRefreshGraph = () => {
    // Принудительно обновляем состояние для графа
    fetchData();
  };

  const printLabels = async () => {
    const selected = points.filter(p => selectedQuantities[p.guid]);
    if (selected.length === 0) { alert('Выберите точки'); return; }
    for (const point of selected) {
      if (point.latitude && point.longitude) {
        await generateQRDataUrl(`https://www.google.com/maps?q=${point.latitude},${point.longitude}`, 150);
      }
    }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = 210, pageHeight = 297;
    const labelW = 13.7, labelH = 7;
    const margin = 5, gap = 0.2;
    const cols = Math.floor((pageWidth - margin * 2 + gap) / (labelW + gap));
    const rows = Math.floor((pageHeight - margin * 2 + gap) / (labelH + gap));
    let currentRow = 0, currentCol = 0;
    for (const point of selected) {
      const quantity = selectedQuantities[point.guid];
      for (let copy = 0; copy < quantity; copy++) {
        if (currentRow >= rows) { pdf.addPage(); currentRow = 0; currentCol = 0; }
        const x = margin + currentCol * (labelW + gap);
        const y = margin + currentRow * (labelH + gap);
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.1);
        pdf.rect(x, y, labelW, labelH);
        pdf.setFillColor(0);
        pdf.circle(x + 0.8, y + 3.5, 0.12, 'F');
        pdf.setFontSize(2.8);
        let textY = y + 1.2;
        const textX = x + 1.2;
        let locationText = point.location_original || '—';
        if (locationText.length > 35) locationText = locationText.substring(0, 32) + '...';
        const locationLines = pdf.splitTextToSize(locationText, labelW - 2.5);
        locationLines.forEach(line => { pdf.text(line, textX, textY); textY += 0.9; });
        if (point.display_date) { pdf.text(point.display_date, textX, textY); textY += 1.0; }
        if (point.latitude_dms && point.longitude_dms) {
          const coordsY = y + labelH - 2.8;
          pdf.text(point.latitude_dms, textX, coordsY);
          pdf.text(point.longitude_dms, textX, coordsY + 1.0);
        }
        const qrDataUrl = qrCache.get(`https://www.google.com/maps?q=${point.latitude},${point.longitude}`);
        if (qrDataUrl) {
          const qrSize = 5;
          pdf.addImage(qrDataUrl, 'PNG', x + labelW - qrSize - 0.4, y + labelH - qrSize - 0.4, qrSize, qrSize);
        }
        if (point.collector_name) { pdf.text(point.collector_name, textX, y + labelH - 0.6); }
        currentCol++;
        if (currentCol >= cols) { currentCol = 0; currentRow++; }
      }
    }
    pdf.save('labels.pdf');
    alert('PDF готов!');
  };

  const handleFormSave = (success) => {
    if (success) fetchData();
    setShowForm(false);
    setEditingPoint(null);
    setInitialLat(null);
    setInitialLng(null);
  };

  const onMapClick = (lat, lng) => {
    setEditingPoint(null);
    setInitialLat(lat);
    setInitialLng(lng);
    setShowForm(true);
  };

  const handleImport = () => {
    fetchData();
    setShowImportModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', margin: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px', background: '#2c3e50', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#34495e', padding: '5px 10px', borderRadius: '6px' }}>
            <span style={{ color: 'white', fontSize: '12px' }}>🔍 Точки:</span>
            <input type="text" placeholder="Год" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ padding: '4px', width: '60px', borderRadius: '4px', border: 'none' }} />
            <input type="text" placeholder="Месяц" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ padding: '4px', width: '60px', borderRadius: '4px', border: 'none' }} />
            <input type="text" placeholder="День" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={{ padding: '4px', width: '60px', borderRadius: '4px', border: 'none' }} />
            <select value={filterCollector} onChange={(e) => setFilterCollector(e.target.value)} style={{ padding: '4px', borderRadius: '4px', border: 'none' }}>
              <option value="">Все сборщики</option>
              {persons.map(p => (<option key={p.guid} value={p.full_name}>{p.full_name}</option>))}
            </select>
            <button onClick={() => { setEditingPoint(null); setInitialLat(null); setInitialLng(null); setShowForm(true); }} style={{ background: '#a5aaaa', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>➕ Новая точка</button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgb(65, 79, 93)', padding: '5px 10px', borderRadius: '6px' }}>
            <span style={{ color: 'white', fontSize: '12px' }}>📍 Печать этикеток:</span>
            <button onClick={selectAll} style={{ background: '#0983ed', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>✓ Выбрать всё</button>
            <button onClick={resetQuantities} style={{ background: '#0983ed', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>⟳ Сбросить</button>
            <button onClick={printLabels} style={{ background: '#0983ed', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>🖨️ Печать ({getTotalLabels()})</button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#34495e', padding: '5px 10px', borderRadius: '6px' }}>
            <span style={{ color: 'white', fontSize: '12px' }}>⚙️ Администрирование:</span>
            <button onClick={() => setShowCollectorManager(true)} style={{ background: '#11a43d', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>👥 Сборщики</button>
            <button onClick={() => setShowTaxonManagerGlobal(true)} style={{ background: '#11a43d', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>🔬 Таксоны</button>
            <button onClick={() => setViewMode(viewMode === 'map' ? 'graph' : 'map')} style={{ background: '#11a43d', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>
              {viewMode === 'map' ? '📊 Переключить на граф' : '🗺️ Переключить на карту'}
            </button>
            <button onClick={() => setShowImportModal(true)} style={{ background: '#11a43d', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>📂 Импорт текста</button>
          </div>
          
          <div style={{ color: 'white', marginLeft: 'auto', fontSize: '14px', fontWeight: 'bold' }}>
            📊 Точек: {filteredPoints.length}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: '40%', overflow: 'auto', backgroundColor: 'white', borderRight: '1px solid #ddd' }}>
          <div ref={tableBodyRef} style={{ overflow: 'auto', height: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ backgroundColor: '#e3e5e6', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '8px' }}>Место</th>
                  <th style={{ padding: '8px' }}>Дата</th>
                  <th style={{ padding: '8px' }}>Сборщик</th>
                  <th style={{ padding: '8px', width: '60px' }}>Кол-во</th>
                  <th style={{ padding: '8px', width: '70px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredPoints.map(p => (
                  <tr key={p.guid} data-row-guid={p.guid} onClick={(e) => handleRowClick(p.guid, p.latitude, p.longitude, e)} style={{ backgroundColor: highlightedRows.has(p.guid) ? '#d0e8ff' : 'transparent', cursor: 'pointer' }}>
                    <td style={{ padding: '8px' }}>{p.location_original?.substring(0, 50) || '—'}</td>
                    <td style={{ padding: '8px' }}>{p.display_date || '—'}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{p.collector_name || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      <input type="number" min="0" max="999" value={selectedQuantities[p.guid] || ''} onChange={(e) => updateQuantity(p.guid, e.target.value)} style={{ width: '50px', padding: '4px' }} onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button onClick={(e) => { e.stopPropagation(); setEditingPoint(p); setShowForm(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', marginRight: '8px' }}>✏️</button>
                      <button onClick={(e) => handleDeletePoint(p.guid, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#e74c3c' }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ width: '60%', height: '100%', position: 'relative' }}>
          {viewMode === 'map' ? (
            <LoadScript googleMapsApiKey={MAPS_API_KEY} loadingElement={<div>Загрузка карт...</div>}>
              <MapView
                points={filteredPoints}
                onMapClick={onMapClick}
                highlightedRows={highlightedRows}
                onMarkerClick={handleMarkerClick}
              />
            </LoadScript>
          ) : (
            <GraphView 
              onNodeClick={(node) => {
                if (node.type === 'point') {
                  handleMarkerClick(node.id, node.latitude, node.longitude);
                }
              }} 
              onUpdate={fetchData}
              refreshTrigger={points} // Передаём points для отслеживания изменений
            />
          )}
        </div>
      </div>
      
      {showForm && (
        <PointForm
          point={editingPoint}
          initialLat={initialLat}
          initialLng={initialLng}
          onClose={() => handleFormSave(false)}
          onSave={handleFormSave}
        />
      )}
      {showCollectorManager && <CollectorManager onClose={() => setShowCollectorManager(false)} onUpdate={fetchData} />}
      {showTaxonManagerGlobal && <TaxonManager onClose={() => setShowTaxonManagerGlobal(false)} onUpdate={fetchData} />}
      {showImportModal && <ImportTextModal onClose={() => setShowImportModal(false)} onImport={handleImport} />}
    </div>
  );
}

export default App;
