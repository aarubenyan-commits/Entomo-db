import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LoadScript } from '@react-google-maps/api';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import CollectorManager from './components/CollectorManager';
import StudyManager from './components/StudyManager';
import TaxonManager from './components/TaxonManager';
import ImportWizard from './components/ImportWizard';
import BulkEditModal from './components/BulkEditModal';
import ExportModal from './components/ExportModal';
import MapView from './components/MapView';
import FilterDrawer from './components/FilterDrawer';
import GraphView from './components/GraphView';
import ExpandablePointCard from './components/ExpandablePointCard';

const API_URL = 'http://127.0.0.1:8000';
const MAPS_API_KEY = 'AIzaSyBt-bcHW2_VAjETvUFvfaPPLVhhe9Iqr7E';
const POINTS_PER_PAGE = 20;

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

// Функция для парсинга даты из формата "20.IV.2022" или "20.04.2022"
function parseDate(dateStr) {
  if (!dateStr) return 0;
  
  // Формат "20.IV.2022"
  const monthMap = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6,
    'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12
  };
  
  // Проверяем на римские месяцы
  for (const [roman, num] of Object.entries(monthMap)) {
    if (dateStr.includes(roman)) {
      const match = dateStr.match(/(\d+)\./);
      const day = match ? parseInt(match[1]) : 1;
      const yearMatch = dateStr.match(/\.(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 2000;
      return new Date(year, num - 1, day).getTime();
    }
  }
  
  // Формат "20.04.2022"
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day).getTime();
    }
  }
  
  return 0;
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
  const [filterTaxonIds, setFilterTaxonIds] = useState([]);
  const [taxa, setTaxa] = useState([]);
  const [selectedPoints, setSelectedPoints] = useState(new Set());
  const [highlightedPoint, setHighlightedPoint] = useState(null);
  const [newPointMode, setNewPointMode] = useState(false);
  const [newPointCoords, setNewPointCoords] = useState({ lat: null, lng: null });
  const [autoFocusNewPoint, setAutoFocusNewPoint] = useState(false);

  const [showCollectorManager, setShowCollectorManager] = useState(false);
  const [showStudyManager, setShowStudyManager] = useState(false);
  const [showTaxonManagerGlobal, setShowTaxonManagerGlobal] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState([]);
  const [viewMode, setViewMode] = useState('map');
  
  const [currentPage, setCurrentPage] = useState(1);
  
  const hasActiveFilters = filterYear || filterMonth || filterDay || filterCollector || filterTaxonIds.length > 0;
  const usePagination = !hasActiveFilters && filteredPoints.length > POINTS_PER_PAGE;
  const totalPages = usePagination ? Math.ceil(filteredPoints.length / POINTS_PER_PAGE) : 1;
  
  const paginatedPoints = usePagination && !newPointMode
    ? filteredPoints.slice((currentPage - 1) * POINTS_PER_PAGE, currentPage * POINTS_PER_PAGE)
    : filteredPoints;

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { 
    applyFilters();
    setCurrentPage(1);
    setHighlightedPoint(null);
  }, [points, filterYear, filterMonth, filterDay, filterCollector, filterTaxonIds]);

  const fetchData = async () => {
    try {
      const pointsRes = await axios.get(`${API_URL}/points`);
      const personsRes = await axios.get(`${API_URL}/persons`);
      const taxaRes = await axios.get(`${API_URL}/species`);
      setTaxa(taxaRes.data);
      setPersons(personsRes.data);
      
      // Сортировка от новых к старым с парсингом дат
      const sorted = pointsRes.data.sort((a, b) => {
        const dateA = parseDate(a.display_date);
        const dateB = parseDate(b.display_date);
        return dateB - dateA;
      });
      
      setPoints(sorted);
    } catch (error) { console.error(error); }
  };

  const applyFilters = () => {
    let filtered = [...points];
    if (filterYear) filtered = filtered.filter(p => p.display_date?.includes(filterYear));
    if (filterMonth) filtered = filtered.filter(p => p.display_date?.match(`\\.${filterMonth}\\.`));
    if (filterDay) filtered = filtered.filter(p => p.display_date?.startsWith(filterDay.padStart(2, "0")));
    if (filterCollector) {
      filtered = filtered.filter(p => 
        p.collectors?.some(c => c.display_name.toLowerCase().includes(filterCollector.toLowerCase()))
      );
    }
    
    if (filterTaxonIds.length > 0) {
      filtered = filtered.filter(point => {
        if (!point.taxon_ids || point.taxon_ids.length === 0) return false;
        return point.taxon_ids.some(taxonId => filterTaxonIds.includes(taxonId));
      });
    }
    
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
    const pointsToSelect = newPointMode ? paginatedPoints : paginatedPoints;
    pointsToSelect.forEach(p => { newQuantities[p.guid] = 1; });
    setSelectedQuantities(newQuantities);
  };

  const getTotalLabels = () => Object.values(selectedQuantities).reduce((sum, q) => sum + q, 0);

  const handleSelectPoint = (guid, isSelected) => {
    const newSelected = new Set(selectedPoints);
    if (isSelected) {
      newSelected.add(guid);
    } else {
      newSelected.delete(guid);
    }
    setSelectedPoints(newSelected);
    setSelectedForBulk(Array.from(newSelected));
  };

  const handleSelectAllVisible = () => {
    const visiblePoints = newPointMode ? paginatedPoints : paginatedPoints;
    if (selectedPoints.size === visiblePoints.length && visiblePoints.length > 0) {
      setSelectedPoints(new Set());
      setSelectedForBulk([]);
    } else {
      const allGuids = visiblePoints.map(p => p.guid);
      setSelectedPoints(new Set(allGuids));
      setSelectedForBulk(allGuids);
    }
  };

  const handleClearAllSelections = () => {
    setSelectedPoints(new Set());
    setSelectedForBulk([]);
    setSelectedQuantities({});
  };

  const handleMarkerClick = (guid) => {
    const index = filteredPoints.findIndex(p => p.guid === guid);
    if (index === -1) return;
    
    if (usePagination && !newPointMode) {
      const targetPage = Math.floor(index / POINTS_PER_PAGE) + 1;
      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
        setTimeout(() => {
          setHighlightedPoint(guid);
          const element = document.getElementById(`point-card-${guid}`);
          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      } else {
        setHighlightedPoint(guid);
        const element = document.getElementById(`point-card-${guid}`);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setHighlightedPoint(guid);
      const element = document.getElementById(`point-card-${guid}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleHighlightPoint = (guid) => {
    setHighlightedPoint(guid);
    const point = filteredPoints.find(p => p.guid === guid);
    if (point && point.latitude && point.longitude && window.mapRef) {
      window.mapRef.setView([point.latitude, point.longitude], 14);
    }
  };

  const handleDeletePoint = async (guid) => {
    if (window.confirm('Удалить эту точку?')) {
      try {
        await axios.delete(`${API_URL}/points/${guid}`);
        fetchData();
        if (highlightedPoint === guid) setHighlightedPoint(null);
        if (selectedPoints.has(guid)) {
          const newSelected = new Set(selectedPoints);
          newSelected.delete(guid);
          setSelectedPoints(newSelected);
          setSelectedForBulk(Array.from(newSelected));
        }
      } catch (error) {
        alert('Ошибка удаления');
      }
    }
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
        const collectorNames = point.collectors?.map(c => c.display_name).join(', ');
        if (collectorNames) { pdf.text(collectorNames, textX, y + labelH - 0.6); }
        currentCol++;
        if (currentCol >= cols) { currentCol = 0; currentRow++; }
      }
    }
    pdf.save('labels.pdf');
    alert('PDF готов!');
  };

  const handleNewPoint = (lat = null, lng = null) => {
    setNewPointMode(true);
    setNewPointCoords({ lat, lng });
    setAutoFocusNewPoint(true);
    setCurrentPage(1);
    document.body.style.overflow = 'hidden';
  };

  const handleCancelNewPoint = () => {
    setNewPointMode(false);
    setNewPointCoords({ lat: null, lng: null });
    setAutoFocusNewPoint(false);
    document.body.style.overflow = '';
  };

  const handleNewPointSave = (success) => {
    if (success) {
      fetchData();
      setNewPointMode(false);
      setNewPointCoords({ lat: null, lng: null });
      setCurrentPage(1);
    } else {
      setNewPointMode(false);
      setNewPointCoords({ lat: null, lng: null });
    }
    setAutoFocusNewPoint(false);
    document.body.style.overflow = '';
  };

  const onMapClick = (lat, lng) => {
    handleNewPoint(lat, lng);
  };

  const newPointObject = newPointMode ? {
    guid: 'new',
    location_original: '',
    display_date: '',
    latitude: newPointCoords.lat,
    longitude: newPointCoords.lng,
    latitude_dms: newPointCoords.lat ? decimalToDms(newPointCoords.lat, true) : null,
    longitude_dms: newPointCoords.lng ? decimalToDms(newPointCoords.lng, false) : null,
    collectors: [],
    taxa: [],
    studies: [],
    studies_count: 0,
    taxon_ids: []
  } : null;

  function decimalToDms(decimal, isLat) {
    if (decimal === undefined || decimal === null) return '';
    const dec = parseFloat(decimal);
    const degrees = Math.floor(Math.abs(dec));
    const minutesFull = (Math.abs(dec) - degrees) * 60;
    const minutes = Math.floor(minutesFull);
    const seconds = (minutesFull - minutes) * 60;
    const direction = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
    return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toFixed(1)}"${direction}`;
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      {/* Основной контент - затемняется оверлеем */}
      <div style={{ 
        height: '100%', 
        width: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        opacity: newPointMode ? 0.7 : 1,
        pointerEvents: newPointMode ? 'none' : 'auto',
        transition: 'opacity 0.2s ease'
      }}>
        <div style={{ padding: '6px 12px', background: '#84b6e9', flexShrink: 0, display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', background: '#6b9ec7', padding: '3px 8px', borderRadius: '6px' }}>
              <span style={{ color: 'white', fontSize: '11px' }}>⚙️</span>
              <button onClick={() => setShowCollectorManager(true)} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Сборщики</button>
              <button onClick={() => setShowTaxonManagerGlobal(true)} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Таксоны</button>
              <button onClick={() => setShowStudyManager(true)} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Исследования</button>
              <button onClick={() => setViewMode(viewMode === 'map' ? 'graph' : 'map')} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                {viewMode === 'map' ? '📊 Граф' : '🗺️ Карта'}
              </button>
              <button onClick={() => setShowImportWizard(true)} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>📥 Импорт</button>
              <button onClick={() => setShowExportModal(true)} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>📤 Экспорт</button>
                            <button onClick={() => setShowBulkEditModal(true)} disabled={selectedForBulk.length === 0} style={{ background: selectedForBulk.length === 0 ? '#6b9ec7' : '#e67e22', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: selectedForBulk.length === 0 ? 'not-allowed' : 'pointer', fontSize: '11px', opacity: selectedForBulk.length === 0 ? 0.5 : 1 }}>
                Массовое {selectedForBulk.length > 0 ? `(${selectedForBulk.length})` : ''}
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', background: '#6b9ec7', padding: '3px 8px', borderRadius: '6px' }}>
              <span style={{ color: 'white', fontSize: '11px' }}>🏷️</span>
              <button onClick={selectAll} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Выбрать всё</button>
              <button onClick={resetQuantities} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Сброс кол-ва</button>
              <button onClick={printLabels} style={{ background: 'none', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>🖨️ Печать ({getTotalLabels()})</button>
            </div>
          </div>
          
          <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
            {filteredPoints.length} точек
            {usePagination && !newPointMode && ` • стр. ${currentPage} из ${totalPages}`}
            {hasActiveFilters && <span style={{ fontSize: '10px', marginLeft: '8px' }}>(фильтр)</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', margin: 0, padding: 0 }}>
          {viewMode === 'map' && (
            <div style={{ width: '30%', overflow: 'auto', backgroundColor: '#fff', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 10px', background: '#f8f9fa', borderBottom: '1px solid #e2e6ea', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={handleSelectAllVisible} style={{ padding: '4px 12px', fontSize: '11px', background: '#e9ecef', border: '1px solid #dee2e6', borderRadius: '6px', cursor: 'pointer' }}>☐ Выбрать все</button>
                <button onClick={handleClearAllSelections} style={{ padding: '4px 12px', fontSize: '11px', background: '#e9ecef', border: '1px solid #dee2e6', borderRadius: '6px', cursor: 'pointer' }}>✕ Сбросить всё</button>
                <FilterDrawer
                  filterYear={filterYear}
                  setFilterYear={setFilterYear}
                  filterMonth={filterMonth}
                  setFilterMonth={setFilterMonth}
                  filterDay={filterDay}
                  setFilterDay={setFilterDay}
                  filterCollector={filterCollector}
                  setFilterCollector={setFilterCollector}
                  persons={persons}
                  filterTaxonIds={filterTaxonIds}
                  setFilterTaxonIds={setFilterTaxonIds}
                  taxa={taxa}
                  points={points}
                />
                <button onClick={() => handleNewPoint()} style={{ padding: '4px 12px', fontSize: '11px', background: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>+ Новая точка</button>
                {usePagination && !newPointMode && <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#7f8c8d' }}>стр. {currentPage} из {totalPages}</div>}
              </div>
              
              <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
                {paginatedPoints.map(point => (
                  <div key={point.guid} id={`point-card-${point.guid}`}>
                    <ExpandablePointCard
                      point={point}
                      isSelected={selectedPoints.has(point.guid)}
                      isHighlighted={highlightedPoint === point.guid}
                      onSelect={handleSelectPoint}
                      onHighlight={handleHighlightPoint}
                      onUpdate={fetchData}
                    />
                  </div>
                ))}
              </div>
              
              {usePagination && !newPointMode && totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '8px', borderTop: '1px solid #e2e6ea', background: '#f8f9fa' }}>
                  <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} style={{ padding: '4px 10px', fontSize: '11px', background: '#e9ecef', border: '1px solid #dee2e6', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}>← Назад</button>
                  <span style={{ padding: '4px 10px', fontSize: '11px' }}>{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} style={{ padding: '4px 10px', fontSize: '11px', background: '#e9ecef', border: '1px solid #dee2e6', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}>Вперёд →</button>
                </div>
              )}
            </div>
          )}
          
          <div style={{ width: viewMode === 'map' ? '70%' : '100%', height: '100%', position: 'relative' }}>
            <LoadScript googleMapsApiKey={MAPS_API_KEY} loadingElement={<div>Загрузка карт...</div>}>
              <div style={{ height: '100%', width: '100%' }}>
                {viewMode === 'map' ? (
                  <MapView
                    points={filteredPoints}
                    onMapClick={onMapClick}
                    highlightedPoint={highlightedPoint}
                    onMarkerClick={handleMarkerClick}
                  />
                ) : (
                  <GraphView onUpdate={fetchData} refreshTrigger={points} />
                )}
              </div>
            </LoadScript>
          </div>
        </div>
      </div>
      
      {/* Форма новой точки - поверх затемнённого фона */}
      {newPointMode && newPointObject && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '0',
          right: '0',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'auto'
        }}>
          <div style={{ width: '500px', maxWidth: '90%' }}>
            <ExpandablePointCard
              point={newPointObject}
              isSelected={false}
              isHighlighted={false}
              onSelect={() => {}}
              onHighlight={() => {}}
              onUpdate={handleNewPointSave}
              onCancel={handleCancelNewPoint}
              isNew={true}
              autoFocus={autoFocusNewPoint}
            />
          </div>
        </div>
      )}
      
      {showCollectorManager && <CollectorManager onClose={() => setShowCollectorManager(false)} onUpdate={fetchData} />}
      {showTaxonManagerGlobal && <TaxonManager onClose={() => setShowTaxonManagerGlobal(false)} onUpdate={fetchData} />}
      {showStudyManager && <StudyManager onClose={() => setShowStudyManager(false)} onUpdate={fetchData} />}
      {showImportWizard && <ImportWizard onClose={() => setShowImportWizard(false)} onImportComplete={fetchData} />}
      {showExportModal && <ExportModal filters={{year: filterYear, month: filterMonth, day: filterDay, collector: filterCollector}} onClose={() => setShowExportModal(false)} />}
      {showBulkEditModal && (
        <BulkEditModal
          selectedPoints={selectedForBulk}
          onClose={() => { setShowBulkEditModal(false); setSelectedPoints(new Set()); setSelectedForBulk([]); }}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}

export default App;
