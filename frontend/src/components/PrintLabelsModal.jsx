import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

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

const PrintLabelsModal = ({ points, selectedPointGuids, onClose }) => {
  const [printData, setPrintData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printMode, setPrintMode] = useState('with_qr');
  
  // ==================== РАЗМЕРЫ ЭТИКЕТКИ ====================
  const labelW = 17;
  const labelH = 8;
  const margin = 4;
  const gap = 0.7;
  const pageWidth = 210;
  const pageHeight = 297;
  
  const cols = Math.floor((pageWidth - margin * 2 + gap) / (labelW + gap));
  const rows = Math.floor((pageHeight - margin * 2 + gap) / (labelH + gap));
  
  // ==================== КООРДИНАТЫ ЭЛЕМЕНТОВ ====================
  const holeX = labelW - 0.8;
  const holeY = labelH / 2;
  const textX = 0.3;
  
  const qrSize = 6.6;
  const qrX = labelW - qrSize - 1.5;
  const qrY = 1.2;
  
  const fontSize = 3.8;
  
  // ==================== ФИКСИРОВАННЫЕ Y-КООРДИНАТЫ (ОБЩИЕ) ====================
  const line1Y = 1.0;    // Строка 1 места
  const line2Y = 2.1;    // Строка 2 места
  const line3Y = 3.2;    // Строка 3 места
  const line4Y = 4.4;    // Строка 4 места (для без QR) ИЛИ широта (для с QR)
  const line5Y = 5.5;    // Строка 5: долгота (для с QR) ИЛИ координаты одной строкой (для без QR)
  const dateY = 6.6;     // Строка 6: дата
  const collectorY = 7.6; // Строка 7: сборщик
  
  // ==================== НАСТРОЙКИ ДЛЯ РЕЖИМА "С QR" ====================
  const qrConfig = {
    textMaxWidth: 15.3,
    maxLenLine1: 28,
    maxLenLine2: 13,
    maxLenLine3: 13,
    maxLenLat: 16,
    maxLenLon: 16,
    maxLenDate: 16,
    maxLenCollector: 18,
    maxLinesLocation: 3,     // 3 строки для описания
    useLine4ForLat: true,    // 4-я строка = широта
    useLine5ForLon: true,    // 5-я строка = долгота
  };
  
  // ==================== НАСТРОЙКИ ДЛЯ РЕЖИМА "БЕЗ QR" ====================
  const noQrConfig = {
    textMaxWidth: 15.0,
    maxLenLine1: 28,
    maxLenLine2: 28,
    maxLenLine3: 28,
    maxLenLine4: 26,         // 4-я строка для описания
    maxLenCoords: 28,        // Координаты одной строкой
    maxLenDate: 26,
    maxLenCollector: 25,
    maxLinesLocation: 4,     // 4 строки для описания
    useLine4ForLat: false,   // 4-я строка = описание
    useLine5ForLon: false,   // 5-я строка = координаты
  };
  
  const cfg = printMode === 'with_qr' ? qrConfig : noQrConfig;

  useEffect(() => {
    const selectedPoints = points.filter(p => selectedPointGuids.includes(p.guid));
    const initialData = selectedPoints.map(point => ({
      guid: point.guid,
      location_original: point.location_original || '—',
      latitude_dms: point.latitude_dms || '',
      longitude_dms: point.longitude_dms || '',
      date_text: point.display_date || point.date_text || '—',
      collector_name: point.collectors?.map(c => c.display_name).join(', ') || '—',
      quantity: 1,
      originalPoint: point
    }));
    setPrintData(initialData);
  }, [points, selectedPointGuids]);

  const updateQuantity = (guid, newQuantity) => {
    let quantity = parseInt(newQuantity, 10);
    if (isNaN(quantity) || quantity < 1) quantity = 1;
    if (quantity > 1000) quantity = 1000;
    setPrintData(prev => prev.map(item => item.guid === guid ? { ...item, quantity } : item));
  };

  const updateField = (guid, field, value) => {
    setPrintData(prev => prev.map(item => item.guid === guid ? { ...item, [field]: value } : item));
  };

  const deleteRow = (guid) => {
    if (window.confirm('Remove this point from print?')) {
      setPrintData(prev => prev.filter(item => item.guid !== guid));
    }
  };

  const truncateText = (text, maxLen) => {
    if (!text || text === '—') return text;
    if (text.length > maxLen) {
      return text.substring(0, maxLen - 3) + ' ';
    }
    return text;
  };

  const splitTextToLines = (text, maxLenLine, maxLines) => {
    if (!text || text === '—') return [];
    
    let remaining = text;
    const lines = [];
    
    for (let lineIdx = 0; lineIdx < maxLines && remaining.length > 0; lineIdx++) {
      if (remaining.length <= maxLenLine) {
        lines.push(remaining);
        break;
      } else {
        let cutIndex = maxLenLine;
        while (cutIndex > 0 && remaining[cutIndex] !== ' ' && cutIndex > maxLenLine - 10) {
          cutIndex--;
        }
        if (cutIndex === 0) cutIndex = maxLenLine;
        
        let line = remaining.substring(0, cutIndex).trim();
        if (line.length > maxLenLine) {
          line = line.substring(0, maxLenLine - 3) + ' ';
        }
        lines.push(line);
        remaining = remaining.substring(cutIndex).trim();
      }
    }
    
    if (remaining.length > 0 && lines.length > 0) {
      lines[lines.length - 1] = lines[lines.length - 1] + ' ';
    }
    
    return lines;
  };

  const generatePDF = async () => {
    if (printData.length === 0) {
      alert('No data to print');
      return;
    }

    setLoading(true);
    
    if (printMode === 'with_qr') {
      for (const item of printData) {
        const point = item.originalPoint;
        if (point.latitude && point.longitude) {
          await generateQRDataUrl(`https://www.google.com/maps?q=${point.latitude},${point.longitude}`, 150);
        }
      }
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    
    try {
      pdf.setFont("tahoma", "normal");
    } catch(e) {
      pdf.setFont("helvetica", "normal");
    }
    pdf.setFontSize(fontSize);
    
    let currentRow = 0, currentCol = 0;
    
    for (const item of printData) {
      const quantity = item.quantity;
      const point = item.originalPoint;
      
      for (let copy = 0; copy < quantity; copy++) {
        if (currentRow >= rows) {
          pdf.addPage();
          currentRow = 0;
          currentCol = 0;
        }
        
        const x = margin + currentCol * (labelW + gap);
        const y = margin + currentRow * (labelH + gap);
        
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.1);
        pdf.rect(x, y, labelW, labelH);
        
        pdf.setFillColor(0);
        pdf.circle(x + holeX, y + holeY, 0.25, 'F');
        
        // ==================== ОПИСАНИЕ МЕСТА (до 3 или 4 строк) ====================
        const locationLines = splitTextToLines(
          item.location_original, 
          cfg.maxLenLine1, 
          cfg.maxLinesLocation
        );
        
        if (locationLines.length > 0) pdf.text(locationLines[0], x + textX, y + line1Y);
        if (locationLines.length > 1) pdf.text(locationLines[1], x + textX, y + line2Y);
        if (locationLines.length > 2) pdf.text(locationLines[2], x + textX, y + line3Y);
        
        if (printMode === 'without_qr' && locationLines.length > 3) {
          // 4-я строка описания для режима без QR
          pdf.text(locationLines[3], x + textX, y + line4Y);
        }
        
        // ==================== КООРДИНАТЫ ====================
        if (printMode === 'with_qr') {
          // Режим с QR: 4-я строка = широта, 5-я строка = долгота
          if (item.latitude_dms) {
            let latText = truncateText(item.latitude_dms, cfg.maxLenLat);
            pdf.text(latText, x + textX, y + line4Y);
          }
          if (item.longitude_dms) {
            let lonText = truncateText(item.longitude_dms, cfg.maxLenLon);
            pdf.text(lonText, x + textX, y + line5Y);
          }
        } else {
          // Режим без QR: 5-я строка = координаты одной строкой
          const coordsText = `${item.latitude_dms} ${item.longitude_dms}`.trim();
          if (coordsText && coordsText !== ' ') {
            let finalCoordsText = truncateText(coordsText, cfg.maxLenCoords);
            pdf.text(finalCoordsText, x + textX, y + line5Y);
          }
        }
        
        // ==================== ДАТА (6-я строка) ====================
        if (item.date_text && item.date_text !== '—') {
          let dateText = truncateText(item.date_text, cfg.maxLenDate);
          pdf.text(dateText, x + textX, y + dateY);
        }
        
        // ==================== СБОРЩИК (7-я строка) ====================
        if (item.collector_name && item.collector_name !== '—') {
          let collectorText = truncateText(item.collector_name, cfg.maxLenCollector);
          pdf.text(collectorText, x + textX, y + collectorY);
        }
        
        // ==================== QR КОД ====================
        if (printMode === 'with_qr' && point.latitude && point.longitude) {
          const qrDataUrl = qrCache.get(`https://www.google.com/maps?q=${point.latitude},${point.longitude}`);
          if (qrDataUrl) {
            pdf.addImage(qrDataUrl, 'PNG', x + qrX, y + qrY, qrSize, qrSize);
          }
        }
        
        currentCol++;
        if (currentCol >= cols) {
          currentCol = 0;
          currentRow++;
        }
      }
    }
    
    pdf.save(`entomo_labels_${printMode === 'with_qr' ? 'with_qr' : 'without_qr'}.pdf`);
    setLoading(false);
    alert('PDF ready!');
  };

  const totalLabels = printData.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.8)', 
      zIndex: 3000, 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      <div style={{ 
        background: '#2c3e50', 
        color: 'white', 
        padding: '12px 20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexShrink: 0 
      }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Print Labels</h2>
        <button 
          onClick={onClose}
          style={{ 
            background: '#e74c3c', 
            border: 'none', 
            color: 'white', 
            fontSize: '14px', 
            cursor: 'pointer',
            padding: '6px 16px',
            borderRadius: '6px',
            fontWeight: 'bold'
          }}
        >
          Close
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px', background: '#ecf0f1' }}>
        <div style={{ background: 'white', borderRadius: '8px', padding: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <strong>📱 Print mode:</strong>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="printMode" 
                value="with_qr" 
                checked={printMode === 'with_qr'} 
                onChange={(e) => setPrintMode(e.target.value)}
              />
              <span>With QR code (3+2+1+1 lines)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="printMode" 
                value="without_qr" 
                checked={printMode === 'without_qr'} 
                onChange={(e) => setPrintMode(e.target.value)}
              />
              <span>Without QR code (4+1+1+1 lines)</span>
            </label>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: '8px', padding: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div><strong>Total labels:</strong> {totalLabels}</div>
          <div><strong>Selected points:</strong> {printData.length}</div>
          <div><strong>Labels per sheet:</strong> {cols * rows}</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={onClose}
              style={{ 
                padding: '8px 20px', 
                background: '#95a5a6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Cancel
            </button>
            <button 
              onClick={generatePDF} 
              disabled={loading || printData.length === 0} 
              style={{ 
                padding: '8px 20px', 
                background: '#27ae60', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: (loading || printData.length === 0) ? 'not-allowed' : 'pointer', 
                opacity: (loading || printData.length === 0) ? 0.6 : 1,
                fontSize: '13px'
              }}
            >
              {loading ? 'Generating PDF...' : 'Print'}
            </button>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>
              <tr>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6', textAlign: 'left' }}>Location</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6', textAlign: 'left' }}>Coordinates</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6', textAlign: 'left' }}>Collector</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6', textAlign: 'center', width: '100px' }}>Quantity</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #dee2e6', textAlign: 'center', width: '50px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {printData.map((item) => (
                <tr key={item.guid} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    <textarea 
                      value={item.location_original} 
                      onChange={(e) => updateField(item.guid, 'location_original', e.target.value)} 
                      style={{ width: '100%', border: '1px solid #ddd', borderRadius: '4px', padding: '4px', fontSize: '11px', resize: 'vertical' }} 
                      rows="4" 
                    />
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    <input 
                      type="text" 
                      value={item.latitude_dms} 
                      onChange={(e) => updateField(item.guid, 'latitude_dms', e.target.value)} 
                      placeholder="Latitude" 
                      style={{ width: '100%', border: '1px solid #ddd', borderRadius: '4px', padding: '4px', fontSize: '11px', marginBottom: '4px' }} 
                    />
                    <input 
                      type="text" 
                      value={item.longitude_dms} 
                      onChange={(e) => updateField(item.guid, 'longitude_dms', e.target.value)} 
                      placeholder="Longitude" 
                      style={{ width: '100%', border: '1px solid #ddd', borderRadius: '4px', padding: '4px', fontSize: '11px' }} 
                    />
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    <input 
                      type="text" 
                      value={item.date_text} 
                      onChange={(e) => updateField(item.guid, 'date_text', e.target.value)} 
                      style={{ width: '100%', border: '1px solid #ddd', borderRadius: '4px', padding: '4px', fontSize: '11px' }} 
                    />
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    <input 
                      type="text" 
                      value={item.collector_name} 
                      onChange={(e) => updateField(item.guid, 'collector_name', e.target.value)} 
                      style={{ width: '100%', border: '1px solid #ddd', borderRadius: '4px', padding: '4px', fontSize: '11px' }} 
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', verticalAlign: 'top' }}>
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      value={item.quantity} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || val === '0') {
                          updateQuantity(item.guid, 1);
                        } else {
                          const num = parseInt(val, 10);
                          if (!isNaN(num) && num > 0 && num <= 1000) {
                            updateQuantity(item.guid, num);
                          } else if (num > 1000) {
                            updateQuantity(item.guid, 1000);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (isNaN(val) || val < 1) {
                          updateQuantity(item.guid, 1);
                        }
                      }}
                      style={{ 
                        width: '70px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        padding: '6px 8px', 
                        textAlign: 'center', 
                        fontSize: '12px',
                        outline: 'none',
                        backgroundColor: '#fff'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', verticalAlign: 'top' }}>
                    <button 
                      onClick={() => deleteRow(item.guid)} 
                      style={{ 
                        background: '#e74c3c', 
                        border: 'none', 
                        cursor: 'pointer', 
                        padding: '4px 8px', 
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '12px'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {printData.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              No selected points for printing
              <div style={{ marginTop: '15px' }}>
                <button 
                  onClick={onClose}
                  style={{ 
                    padding: '8px 20px', 
                    background: '#3498db', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '6px', 
                    cursor: 'pointer' 
                  }}
                >
                  Go back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintLabelsModal;
