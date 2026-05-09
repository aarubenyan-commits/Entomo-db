import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const GraphView = ({ onNodeClick, onUpdate, refreshTrigger }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const fgRef = useRef();

  useEffect(() => {
    fetchGraphData();
  }, [refreshTrigger]);

  const fetchGraphData = async () => {
    try {
      const [pointsRes, personsRes, taxaRes] = await Promise.all([
        axios.get(`${API_URL}/points`),
        axios.get(`${API_URL}/persons`),
        axios.get(`${API_URL}/taxa`)
      ]);

      const nodes = [];
      const links = [];
      const nodeMap = new Map();

      personsRes.data.forEach(p => {
        const node = { id: p.guid, name: p.full_name, type: 'person', group: 1 };
        nodes.push(node);
        nodeMap.set(p.guid, node);
      });

      taxaRes.data.forEach(t => {
        const node = { id: t.guid, name: t.full_name, type: 'taxon', group: 3 };
        nodes.push(node);
        nodeMap.set(t.guid, node);
      });

      pointsRes.data.forEach(p => {
        const node = { 
          id: p.guid, 
          name: p.location_original || p.display_date || 'Без названия', 
          type: 'point', 
          group: 2,
          latitude: p.latitude,
          longitude: p.longitude
        };
        nodes.push(node);
        nodeMap.set(p.guid, node);

        if (p.collector_name) {
          const personNode = personsRes.data.find(person => person.full_name === p.collector_name);
          if (personNode && nodeMap.has(personNode.guid)) {
            links.push({
              source: personNode.guid,
              target: p.guid,
              type: 'collected_at'
            });
          }
        }
      });

      for (const point of pointsRes.data) {
        try {
          const taxaLinksRes = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
          taxaLinksRes.data.forEach(taxon => {
            if (nodeMap.has(taxon.guid)) {
              links.push({
                source: point.guid,
                target: taxon.guid,
                type: 'has_taxon'
              });
            }
          });
        } catch (error) {
          console.error('Ошибка загрузки таксонов для точки', point.guid);
        }
      }

      setGraphData({ nodes, links });
    } catch (error) {
      console.error('Ошибка загрузки данных для графа:', error);
    }
  };

  const handleNodeClick = (node, event) => {
    setSelectedNode(node);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setShowContextMenu(true);
    if (onNodeClick) onNodeClick(node);
  };

  const handleCloseMenu = () => {
    setShowContextMenu(false);
    setSelectedNode(null);
  };

  const handleEdit = () => {
    if (selectedNode) {
      alert(`Редактирование ${selectedNode.name} (пока в разработке)`);
    }
    handleCloseMenu();
  };

  const handleDelete = async () => {
    if (!selectedNode) return;
    
    if (window.confirm(`Удалить ${selectedNode.name}?`)) {
      try {
        if (selectedNode.type === 'point') {
          await axios.delete(`${API_URL}/points/${selectedNode.id}`);
        } else if (selectedNode.type === 'person') {
          await axios.delete(`${API_URL}/persons/${selectedNode.id}`);
        } else if (selectedNode.type === 'taxon') {
          await axios.delete(`${API_URL}/taxa/${selectedNode.id}`);
        }
        fetchGraphData();
        if (onUpdate) onUpdate();
        alert('Удалено успешно');
      } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка удаления');
      }
    }
    handleCloseMenu();
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchTerm)}`);
      setSearchResults(response.data);
      
      if (fgRef.current) {
        const highlightedNodes = response.data.map(item => item.guid);
        fgRef.current.nodeColor(node => 
          highlightedNodes.includes(node.id) ? '#ff0000' : (node.group === 1 ? '#3498db' : node.group === 2 ? '#2ecc71' : '#9b59b6')
        );
      }
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  };

  const handleAddNode = async () => {
    const type = prompt('Что добавить? (point/person/taxon)');
    if (!type) return;
    
    const name = prompt('Введите название:');
    if (!name) return;
    
    try {
      if (type === 'point') {
        const lat = prompt('Широта (дес.):');
        const lon = prompt('Долгота (дес.):');
        if (lat && lon) {
          await axios.post(`${API_URL}/points/create`, {
            latitude: parseFloat(lat),
            longitude: parseFloat(lon),
            location_original: name,
            collector_name: 'Системный'
          });
        }
      } else if (type === 'person') {
        await axios.post(`${API_URL}/persons?full_name=${encodeURIComponent(name)}&role=collector`);
      } else if (type === 'taxon') {
        const genus = prompt('Род:');
        if (genus) {
          await axios.post(`${API_URL}/taxa?genus=${encodeURIComponent(genus)}&species=${encodeURIComponent(name)}`);
        }
      }
      fetchGraphData();
      if (onUpdate) onUpdate();
      alert('Добавлено успешно');
    } catch (error) {
      console.error('Ошибка добавления:', error);
      alert('Ошибка добавления');
    }
  };

  const handleRefresh = () => {
    fetchGraphData();
    if (onUpdate) onUpdate();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'white', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="Поиск..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <button onClick={handleSearch} style={{ padding: '6px 12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            🔍 Найти
          </button>
          <button onClick={handleAddNode} style={{ padding: '6px 12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            ➕ Добавить
          </button>
          <button onClick={handleRefresh} style={{ padding: '6px 12px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            🔄 Обновить
          </button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #ccc', borderRadius: '4px', maxHeight: '150px', overflow: 'auto' }}>
            {searchResults.map(result => (
              <div key={result.guid} style={{ padding: '5px', borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => {
                const node = graphData.nodes.find(n => n.id === result.guid);
                if (node && fgRef.current) {
                  fgRef.current.centerAt(node.x, node.y, 1000);
                  fgRef.current.zoom(2, 1000);
                }
              }}>
                {result.name} ({result.type})
              </div>
            ))}
          </div>
        )}
      </div>
      
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={node => node.group === 1 ? '#3498db' : node.group === 2 ? '#2ecc71' : '#9b59b6'}
        nodeVal={node => node.type === 'point' ? 4 : 6}
        onNodeClick={handleNodeClick}
        linkLabel={link => link.type}
        linkColor={() => '#999999'}
        linkWidth={1}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400)}
      />
      
      {showContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenuPosition.y,
            left: contextMenuPosition.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 1000
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>
            {selectedNode?.name}
          </div>
          <div style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={handleEdit}>
            ✏️ Редактировать
          </div>
          <div style={{ padding: '8px 12px', cursor: 'pointer', color: 'red', borderTop: '1px solid #eee' }} onClick={handleDelete}>
            🗑️ Удалить
          </div>
          <div style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid #eee' }} onClick={handleCloseMenu}>
            ❌ Отмена
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphView;
