import React, { useState, useRef, useEffect } from 'react';

const MassActionsMenu = ({ selectedCount, onPrint, onEditCollector, onEditStudy, onEditTaxa }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action) => {
    setIsOpen(false);
    action();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={selectedCount === 0}
        style={{
          padding: '4px 12px',
          fontSize: '11px',
          background: selectedCount > 0 ? '#9b59b6' : '#e9ecef',
          color: selectedCount > 0 ? 'white' : '#999',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
          cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        ⚡ Mass Actions ({selectedCount})
      </button>

      {isOpen && selectedCount > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '4px',
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '220px',
          overflow: 'hidden'
        }}>
          <div onClick={() => handleAction(onPrint)} style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
            <span style={{ fontSize: '16px' }}>🖨️</span>
            <span>Print Labels</span>
          </div>
          <div onClick={() => handleAction(onEditCollector)} style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
            <span style={{ fontSize: '16px' }}>👤</span>
            <span>Edit Collector</span>
          </div>
          <div onClick={() => handleAction(onEditStudy)} style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
            <span style={{ fontSize: '16px' }}>📚</span>
            <span>Edit Study</span>
          </div>
          <div onClick={() => handleAction(onEditTaxa)} style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
            <span style={{ fontSize: '16px' }}>🔬</span>
            <span>Add Taxon</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MassActionsMenu;
