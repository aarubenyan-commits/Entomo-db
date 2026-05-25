import React, { useState } from 'react';
import PointForm from './PointForm';

const PointCard = ({ point, isSelected, onSelect, onUpdate }) => {
  const [showEdit, setShowEdit] = useState(false);
  const [expandedTaxa, setExpandedTaxa] = useState(false);
  
  const taxaList = point.taxa || [];
  const previewTaxa = taxaList.slice(0, 3);
  const remainingCount = taxaList.length - 3;
  
  const collectors = point.collectors || [];
  const collectorsNames = collectors.map(c => c.display_name).join(', ');
  
  const handleDoubleClick = () => {
    setShowEdit(true);
  };
  
  return (
    <>
      <div
        onDoubleClick={handleDoubleClick}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.stopPropagation();
            onSelect(point.guid, !isSelected);
          }
        }}
        style={{
          backgroundColor: isSelected ? '#e8f4f8' : '#ffffff',
          borderRadius: '12px',
          marginBottom: '8px',
          padding: '12px 14px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          border: '1px solid #e9ecef',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isSelected ? '#e0eef5' : '#f8f9fa';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isSelected ? '#e8f4f8' : '#ffffff';
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Чекбокс */}
          <div style={{ paddingTop: '2px' }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect(point.guid, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
                borderRadius: '3px',
              }}
            />
          </div>
          
          {/* Контент */}
          <div style={{ flex: 1 }}>
            {/* Место */}
            <div style={{
              fontWeight: 500,
              fontSize: '13px',
              color: '#2c3e50',
              marginBottom: '4px',
              lineHeight: 1.4,
            }}>
              {point.location_original || '—'}
            </div>
            
            {/* Координаты DMS */}
            {point.latitude_dms && point.longitude_dms && (
              <div style={{
                fontSize: '10px',
                color: '#7f8c8d',
                fontFamily: 'monospace',
                marginBottom: '8px',
              }}>
                {point.latitude_dms} {point.longitude_dms}
              </div>
            )}
            
            {/* Нижняя строка */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              {/* Левая часть: дата и сборщики */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                {point.display_date && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#95a5a6' }}>📅</span>
                    <span style={{ fontSize: '11px', color: '#5d6d7e' }}>{point.display_date}</span>
                  </div>
                )}
                {collectorsNames && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#95a5a6' }}>👤</span>
                    <span style={{ fontSize: '11px', color: '#5d6d7e' }}>{collectorsNames}</span>
                  </div>
                )}
              </div>
              
              {/* Правая часть: таксоны и исследования */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {taxaList.length > 0 && (
                  <div 
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setExpandedTaxa(!expandedTaxa); }}
                  >
                    <span style={{ fontSize: '11px', color: '#95a5a6' }}>🔬</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                      {!expandedTaxa ? (
                        <>
                          {previewTaxa.map((taxon, idx) => (
                            <span key={idx} style={{
                              fontSize: '10px',
                              background: '#ecf0f1',
                              padding: '2px 6px',
                              borderRadius: '10px',
                              color: '#2c3e50',
                            }}>
                              {taxon.display_name.length > 20 ? taxon.display_name.slice(0, 18) + '…' : taxon.display_name}
                            </span>
                          ))}
                          {remainingCount > 0 && (
                            <span style={{ fontSize: '10px', color: '#3498db' }}>+{remainingCount}</span>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#2c3e50', maxWidth: '200px' }}>
                          {taxaList.map(t => t.display_name).join(', ')}
                        </span>
                      )}
                    </div>
                    {taxaList.length > 3 && (
                      <span style={{ fontSize: '9px', color: '#bdc3c7' }}>{expandedTaxa ? '▲' : '▼'}</span>
                    )}
                  </div>
                )}
                
                {point.studies_count > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#95a5a6' }}>📚</span>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#8e44ad' }}>
                      {point.studies_count}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showEdit && (
        <PointForm
          point={point}
          onClose={() => setShowEdit(false)}
          onSave={(success) => {
            setShowEdit(false);
            if (success && onUpdate) onUpdate();
          }}
        />
      )}
    </>
  );
};

export default PointCard;
