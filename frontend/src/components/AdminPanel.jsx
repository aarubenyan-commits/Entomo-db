import React, { useState } from 'react';
import GraphView from './GraphView';

const AdminPanel = ({ onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('graph');

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '90%', height: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <h2>Администрирование</h2>
        <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
          <button style={{ fontWeight: activeTab === 'graph' ? 'bold' : 'normal' }} onClick={() => setActiveTab('graph')}>Граф связей</button>
          <button style={{ fontWeight: activeTab === 'objects' ? 'bold' : 'normal' }} onClick={() => setActiveTab('objects')}>Объекты и связи</button>
        </div>

        {activeTab === 'graph' && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <GraphView onUpdate={onUpdate} />
          </div>
        )}

        {activeTab === 'objects' && (
          <div>
            <p>Табличный интерфейс управления объектами и связями (в разработке).</p>
          </div>
        )}

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
