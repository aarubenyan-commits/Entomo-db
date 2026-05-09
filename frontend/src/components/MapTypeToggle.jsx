import React from 'react';

const MapTypeToggle = ({ mapType, onMapTypeChange }) => {
  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 1000,
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: 'flex',
      overflow: 'hidden'
    }}>
      <button
        onClick={() => onMapTypeChange('osm')}
        style={{
          padding: '8px 16px',
          background: mapType === 'osm' ? '#2ecc71' : '#f0f0f0',
          border: 'none',
          cursor: 'pointer',
          fontWeight: mapType === 'osm' ? 'bold' : 'normal',
          color: mapType === 'osm' ? 'white' : '#333'
        }}
      >
        🗺️ OSM
      </button>
      <button
        onClick={() => onMapTypeChange('google')}
        style={{
          padding: '8px 16px',
          background: mapType === 'google' ? '#2ecc71' : '#f0f0f0',
          border: 'none',
          cursor: 'pointer',
          fontWeight: mapType === 'google' ? 'bold' : 'normal',
          color: mapType === 'google' ? 'white' : '#333'
        }}
      >
        🗺️ Google
      </button>
    </div>
  );
};

export default MapTypeToggle;
