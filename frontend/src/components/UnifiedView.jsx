import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ForceGraph2D from 'react-force-graph-2d';

const API_URL = 'http://127.0.0.1:8000';

const UnifiedView = ({ onUpdate }) => {
  const [points, setPoints] = useState([]);
  const [filteredPoints, setFilteredPoints] = useState([]);
  const [selectedRowGuid, setSelectedRowGuid] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState('');
  const [filterCollector, setFilterCollector] = useState('');
  const [persons, setPersons] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const fgRef = useRef();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [points, filterYear, filterCollector]);

  const fetchData = async () => {
    try {
      const pointsRes = await axios.get(`${API_URL}/points`);
      setPoints(pointsRes.data);
      const personsRes = await axios.get(`${API_URL}/persons`);
      setPersons(personsRes.data);
      await loadGraphData(pointsRes.data, personsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGraphData = async (pointsData, personsData) => {
    const nodes = [];
    const nodeMap = {};
    personsData.forEach(p => {
      const nodeId = `person_${p.guid}`;
      nodeMap[nodeId] = { id: nodeId, type: 'person', guid: p.guid, name: p.full_name };
      nodes.push(nodeMap[nodeId]);
    });
    pointsData.forEach(p => {
      const nodeId = `point_${p.guid}`;
      nodeMap[nodeId] = { id: nodeId, type: 'point', guid: p.guid, name: p.location_original?.substring(0, 40) || '—', date: p.display_date };
      nodes.push(nodeMap[nodeId]);
    });
    const links = [];
    const addedLinks = new Set();
    for (const point of pointsData) {
      const linksRes = await axios.get(`${API_URL}/objects/point/${point.guid}/links`);
      for (const link of linksRes.data) {
        let targetNodeId = null;
        if (link.target_type === 'person') targetNodeId = `person_${link.target_guid}`;
        if (targetNodeId && nodeMap[targetNodeId]) {
          const key = `point_${point.guid}-${targetNodeId}`;
          if (!addedLinks.has(key)) {
            addedLinks.add(key);
            links.push({
              source: `point_${point.guid}`,
              target: targetNodeId,
              relation_type: link.relation_type,
              link_guid: link.link_guid
            });
          }
        }
      }
    }
    setGraphData({ nodes, links });
  };

  const applyFilters = () => {
    let filtered = [...points];
    if (filterYear) filtered = filtered.filter(p => p.display_date?.includes(filterYear));
    if (filterCollector) filtered = filtered.filter(p => p.collector_name?.toLowerCase().includes(filterCollector.toLowerCase()));
    setFilteredPoints(filtered);
  };

  const handleRowClick = (pointGuid) => {
    setSelectedRowGuid(pointGuid);
    const nodeId = `point_${pointGuid}`;
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node && fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(2, 1000);
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setShowDetails(true);
  };

  const getNodeColor = (node) => {
    if (node.type === 'person') return '#f39c12';
    if (node.type === 'point') {
      if (selectedRowGuid && node.guid === selectedRowGuid) return '#ff0000';
      return '#2ecc71';
    }
    return '#95a5a6';
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Таблица (30% высоты) */}
      <div style={{ height: '30%', overflow: 'auto', borderBottom: '1px solid #ccc', marginBottom: '10px' }}>
        <div style={{ padding: '8px', display: 'flex', gap: '10px' }}>
          <input type="text" placeholder="Год" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: '4px' }} />
          <select value={filterCollector} onChange={e => setFilterCollector(e.target.value)} style={{ padding: '4px' }}>
            <option value="">Все сборщики</option>
            {persons.map(p => (<option key={p.guid} value={p.full_name}>{p.full_name}</option>))}
          </select>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ backgroundColor: '#ecf0f1', position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ padding: '4px' }}>Место</th>
              <th style={{ padding: '4px' }}>Дата</th>
              <th style={{ padding: '4px' }}>Сборщик</th>
            </tr>
          </thead>
          <tbody>
            {filteredPoints.map(p => (
              <tr key={p.guid} onClick={() => handleRowClick(p.guid)} style={{ backgroundColor: selectedRowGuid === p.guid ? '#d0e8ff' : 'transparent', cursor: 'pointer' }}>
                <td style={{ padding: '4px' }}>{p.location_original?.substring(0, 50) || '—'}</td>
                <td style={{ padding: '4px' }}>{p.display_date || '—'}</td>
                <td style={{ padding: '4px' }}>{p.collector_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Граф (70% высоты) */}
      <div style={{ height: '70%', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeLabel={node => `${node.name}\nТип: ${node.type}`}
          nodeColor={getNodeColor}
          nodeCanvasObject={(node, ctx) => {
            ctx.fillStyle = getNodeColor(node);
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
            ctx.fill();
            // Очень короткий текст (или можно не выводить)
            if (node.type === 'person') {
              ctx.fillStyle = '#000';
              ctx.font = `${7}px Arial`;
              ctx.fillText(node.name?.substring(0, 8) || '', node.x + 8, node.y + 4);
            }
          }}
          linkLabel={link => link.relation_type}
          linkColor={() => '#aaa'}
          linkWidth={2}
          cooldownTicks={50}
          onNodeClick={handleNodeClick}
        />
        {showDetails && selectedNode && (
          <div style={{
            position: 'absolute', bottom: 20, right: 20, backgroundColor: 'white', border: '1px solid #ccc',
            borderRadius: '8px', padding: '10px', width: '260px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 100
          }}>
            <h4>{selectedNode.name}</h4>
            <p><strong>Тип:</strong> {selectedNode.type}</p>
            {selectedNode.type === 'point' && <p><strong>Дата:</strong> {selectedNode.date || '—'}</p>}
            <button onClick={() => setShowDetails(false)}>Закрыть</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedView;
